import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { z } from 'zod';
import { OscSender } from '../gateway/OscSender.js';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

type StepResult = { name: string; ok: boolean; detail?: string };

const McpResult = z.object({
  content: z
    .array(
      z.union([
        z.object({ type: z.literal('text'), text: z.string() }),
        z.object({ type: z.literal('image'), data: z.string(), mimeType: z.string() }),
      ]),
    )
    .optional(),
  isError: z.boolean().optional(),
  structuredContent: z.unknown().optional(),
});

async function callToolText(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<{ text: string | undefined; raw: unknown }> {
  const res = (await client.callTool({ name, arguments: args })) as unknown;
  const parsed = McpResult.safeParse(res);
  let text: string | undefined;
  if (parsed.success) {
    const firstText = parsed.data.content?.find(
      (c): c is { type: 'text'; text: string } => (c as { type: string }).type === 'text',
    );
    text = firstText?.text;
  }
  // MCP error handling: if the tool responded with isError, raise it.
  if (parsed.success && parsed.data.isError) {
    const message = text ?? `tool ${name} returned an error`;
    throw new Error(message);
  }
  if (!text) {
    throw new Error(`tool ${name} returned no text`);
  }
  return { text, raw: res };
}

async function callToolImage(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<{ data: string; mimeType: string; raw: unknown }> {
  const res = (await client.callTool({ name, arguments: args })) as unknown;
  const parsed = McpResult.safeParse(res);
  if (!parsed.success) throw new Error(`tool ${name} returned invalid content`);
  const first = parsed.data.content?.find(
    (c): c is { type: 'image'; data: string; mimeType: string } =>
      (c as { type: string }).type === 'image',
  );
  if (!first) throw new Error(`tool ${name} returned no image`);
  return { data: first.data, mimeType: first.mimeType, raw: res };
}

async function seedPose(
  x: number,
  y: number,
  z: number,
  heading: number,
  pitch: number,
): Promise<void> {
  const host = process.env['RESONITE_OSC_LISTEN_HOST'] ?? '127.0.0.1';
  const port = Number(process.env['RESONITE_OSC_LISTEN_PORT'] ?? '9010');
  const osc = new OscSender({ host, port, address: '/noop' });
  try {
    await osc.sendNumbers('/virtualbot/position', x, y, z);
    await osc.sendNumbers('/virtualbot/rotation', heading, pitch);
  } finally {
    osc.close();
  }
}

async function run(): Promise<number> {
  const here = path.dirname(fileURLToPath(new URL(import.meta.url)));
  const root = path.resolve(here, '..', '..');
  const tsxCli = path.resolve(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [tsxCli, path.resolve(root, 'src', 'main.ts')],
    stderr: 'overlapped',
    // Use default ports for local single-process testing. Do not override.
    env: {
      LOG_LEVEL: process.env['LOG_LEVEL'] ?? 'info',
    },
  });
  const client = new Client({ name: 'integration-check', version: '0.0.0' });
  const stderr = transport.stderr;
  if (stderr) {
    stderr.on('data', (buf) => {
      try {
        console.error(String(buf));
      } catch {
        // ignore
      }
    });
  }
  await client.connect(transport);

  const steps: StepResult[] = [];
  const add: (s: StepResult) => void = (s) => steps.push(s);
  const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

  const fmt = (n: unknown): string =>
    typeof n === 'number' && Number.isFinite(n) ? n.toFixed(3) : String(n);
  type Pose = { x: number; y: number; z: number; heading: number; pitch: number };
  const poseStr = (p: Pose): string =>
    `x=${fmt(p.x)} y=${fmt(p.y)} z=${fmt(p.z)} hd=${fmt(p.heading)} pt=${fmt(p.pitch)}`;

  async function getPose(client: Client): Promise<{
    x: number;
    y: number;
    z: number;
    heading: number;
    pitch: number;
  }> {
    const res = await callToolText(client, 'get_pose', {});
    const pose = JSON.parse(res.text ?? '{}');
    return pose;
  }

  // Ensure pose exists for movement tests
  await seedPose(0, 0, 0, 0, 0);
  await new Promise((r) => setTimeout(r, 200));

  // get_pose (baseline)
  try {
    const res = await callToolText(client, 'get_pose', {});
    const pose = JSON.parse(res.text ?? '{}');
    if (typeof pose.x === 'number' && typeof pose.heading === 'number')
      add({ name: 'get_pose', ok: true, detail: poseStr(pose) });
    else add({ name: 'get_pose', ok: false, detail: 'invalid pose shape' });
  } catch (e) {
    add({ name: 'get_pose', ok: false, detail: (e as Error).message });
  }

  // set_expression
  try {
    await callToolText(client, 'set_expression', { eyesId: 'winkL', mouthId: 'smile_big' });
    add({ name: 'set_expression', ok: true });
  } catch (e) {
    add({ name: 'set_expression', ok: false, detail: (e as Error).message });
  }

  // set_expression (invalid id must include valid list)
  try {
    await callToolText(client, 'set_expression', { eyesId: '___invalid___' });
    add({ name: 'set_expression_invalid', ok: false, detail: 'expected error' });
  } catch (e) {
    const msg = (e as Error).message ?? '';
    add({ name: 'set_expression_invalid', ok: msg.includes('valid:'), detail: msg });
  }

  // set_accent_hue
  try {
    await callToolText(client, 'set_accent_hue', { hue: 200 });
    add({ name: 'set_accent_hue', ok: true });
  } catch (e) {
    add({ name: 'set_accent_hue', ok: false, detail: (e as Error).message });
  }

  // Ensure WS connection from Resonite is ready (wait tool)
  try {
    await callToolText(client, 'wait_resonite', { timeoutMs: 10000 });
    add({ name: 'wait_resonite', ok: true });
  } catch (e) {
    add({ name: 'wait_resonite', ok: false, detail: (e as Error).message });
  }

  // move_relative (expects Resonite to echo updated pose)
  try {
    const p0 = await getPose(client);
    const moveRes = await callToolText(client, 'move_relative', {
      direction: 'forward',
      distance: 1.0,
    });
    let target: { vector?: unknown[] } | undefined;
    try {
      target = JSON.parse(moveRes.text ?? '{}');
    } catch {
      // ignore
    }
    // Allow time for Resonite to echo pose; poll up to ~3s
    let changed = false;
    const deadline = Date.now() + 3000;
    const eps = 0.01;
    while (Date.now() < deadline) {
      await sleep(250);
      const p1 = await getPose(client);
      if (
        typeof p1.x === 'number' &&
        typeof p1.z === 'number' &&
        Math.abs(p1.x - p0.x) + Math.abs(p1.z - p0.z) > eps
      ) {
        changed = true;
        const dx = p1.x - p0.x;
        const dz = p1.z - p0.z;
        const tStr =
          target && Array.isArray(target.vector) ? `target([${target.vector.join(',')}]) ` : '';
        add({
          name: 'move_relative',
          ok: true,
          detail: `${tStr}observed dx=${fmt(dx)} dz=${fmt(dz)}`,
        });
        break;
      }
    }
    if (!changed) {
      const tStr =
        target && Array.isArray(target.vector) ? `target([${target.vector.join(',')}]) ` : '';
      add({ name: 'move_relative', ok: false, detail: `${tStr}no pose change observed within 3s` });
    }
  } catch (e) {
    add({ name: 'move_relative', ok: false, detail: (e as Error).message });
  }

  // turn_relative (expects Resonite to echo updated heading)
  try {
    const p0 = await getPose(client);
    const turnRes = await callToolText(client, 'turn_relative', { degrees: 45 });
    let target: { degrees?: number } | undefined;
    try {
      target = JSON.parse(turnRes.text ?? '{}');
    } catch {
      // ignore
    }
    // Allow time for Resonite to echo rotation; poll up to ~3s
    let changed = false;
    const deadline = Date.now() + 3000;
    const epsDeg = 0.5;
    while (Date.now() < deadline) {
      await sleep(250);
      const p1 = await getPose(client);
      if (typeof p1.heading === 'number' && Math.abs(p1.heading - p0.heading) > epsDeg) {
        changed = true;
        const dh = p1.heading - p0.heading;
        const tStr =
          target && typeof target.degrees === 'number' ? `target(deg=${fmt(target.degrees)}) ` : '';
        add({ name: 'turn_relative', ok: true, detail: `${tStr}observed dHeading=${fmt(dh)}` });
        break;
      }
    }
    if (!changed) {
      const tStr =
        target && typeof target.degrees === 'number' ? `target(deg=${fmt(target.degrees)}) ` : '';
      add({
        name: 'turn_relative',
        ok: false,
        detail: `${tStr}no heading change observed within 3s`,
      });
    }
  } catch (e) {
    add({ name: 'turn_relative', ok: false, detail: (e as Error).message });
  }

  // set_text
  try {
    await callToolText(client, 'set_text', { text: 'hello' });
    add({ name: 'set_text', ok: true });
  } catch (e) {
    add({ name: 'set_text', ok: false, detail: (e as Error).message });
  }

  // ping (requires WS client connection from Resonite)
  try {
    const res = await callToolText(client, 'ping', { text: 'hello' });
    const { text } = z.object({ text: z.string() }).parse({ text: res.text });
    add({ name: 'ping(ws)', ok: text === 'hello', detail: text });
  } catch (e) {
    add({ name: 'ping(ws)', ok: false, detail: (e as Error).message });
  }

  // capture_camera (always; server returns image (data+mimeType))
  try {
    const res = await callToolImage(client, 'capture_camera', { fov: 60, size: 512 });
    const mime = res.mimeType || 'application/octet-stream';
    const b64 = res.data || '';
    if (!b64) throw new Error('empty image payload');
    const bin = Buffer.from(b64, 'base64');
    const outDir = process.env['INTEGRATION_OUT']
      ? path.resolve(String(process.env['INTEGRATION_OUT']))
      : path.resolve(root, 'captures');
    await fs.mkdir(outDir, { recursive: true });
    const ext = mime.includes('png') ? 'png' : mime.includes('jpeg') ? 'jpg' : 'bin';
    const dest = path.resolve(outDir, `capture_${Date.now()}.${ext}`);
    await fs.writeFile(dest, bin);
    add({ name: 'capture_camera', ok: true, detail: dest });
  } catch (e) {
    add({ name: 'capture_camera', ok: false, detail: (e as Error).message });
  }

  // Summarize
  const okCount = steps.filter((s) => s.ok).length;
  const total = steps.length;
  for (const s of steps) {
    const status = s.ok ? 'PASS' : 'FAIL';
    console.log(`${status} ${s.name}${s.detail ? ` - ${s.detail}` : ''}`);
  }
  console.log(`\nSummary: ${okCount}/${total} passed`);

  await transport.close();
  return okCount === total ? 0 : 1;
}

run()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
import 'dotenv/config';
