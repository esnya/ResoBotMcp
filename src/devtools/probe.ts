import { loadOscTargetFromEnv, OscSender } from '../gateway/OscSender.js';
import { wsConfigFromEnv, WebSocketRpcServer } from '../gateway/WebSocketRpc.js';
import { SetExpression } from '../usecases/SetExpression.js';
import { SetAccentHue } from '../usecases/SetAccentHue.js';
import { z } from 'zod';
import { ADDR } from '../gateway/addresses.js';
import { Server as OscServer } from 'node-osc';

type Command =
  | { kind: 'help' }
  // Generic WS RPC call (Resonite must be connected to our WS server)
  | {
      kind: 'ws:call';
      method: string;
      args: Record<string, string>;
      timeoutMs?: number;
      connectTimeoutMs?: number;
      raw?: boolean;
      flat?: boolean;
    }
  // Back-compat convenience
  | { kind: 'ws:ping'; text: string }
  // Generic OSC send/listen
  | { kind: 'osc:send'; address: string; text?: string; floats?: number[]; ints?: number[] }
  | { kind: 'osc:listen'; host: string; port: number; filter?: string; durationMs?: number }
  // Back-compat convenience
  | { kind: 'osc:set-expression'; eyesId?: string; mouthId?: string }
  | { kind: 'osc:set-accent-hue'; hue: number }
  | { kind: 'osc:pose'; x: number; y: number; z: number; heading: number; pitch: number }
  | { kind: 'osc:expression-seq'; delayMs: number };

function parseArgs(argv: string[]): Command {
  const [cmd, ...rest] = argv;
  const kv: Record<string, string> = {};
  const multi: Record<string, string[]> = {};
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (!token) continue;
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = rest[i + 1];
      const val = next && !next.startsWith('--') ? (i++, next) : 'true';
      if (multi[key]) multi[key].push(val);
      else multi[key] = [val];
      kv[key] = val;
    }
  }
  const has = (k: string): boolean => Object.prototype.hasOwnProperty.call(kv, k);
  const asNumber = (k: string, fallback?: number): number | undefined => {
    const v = kv[k];
    if (v == null) return fallback;
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error(`${k} must be a number`);
    return n;
  };
  const parsePairs = (items: string[] | undefined): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const it of items ?? []) {
      const eq = it.indexOf('=');
      if (eq <= 0) throw new Error(`--arg requires key=value, got: ${it}`);
      const key = it.slice(0, eq);
      const value = it.slice(eq + 1);
      out[key] = value;
    }
    return out;
  };
  switch (cmd) {
    case undefined:
    case 'help':
    case '-h':
    case '--help':
      return { kind: 'help' };
    case 'ws:call': {
      const method = kv['method'];
      if (!method) throw new Error('method is required: --method <name>');
      const args = parsePairs(multi['arg']);
      const timeoutMs = asNumber('timeoutMs');
      const connectTimeoutMs = asNumber('connectTimeoutMs');
      const raw = kv['raw'] === 'true' || kv['raw'] === '1';
      const flat = kv['flat'] === 'true' || kv['flat'] === '1';
      const out: { kind: 'ws:call'; method: string; args: Record<string, string> } & Partial<{
        timeoutMs: number;
        connectTimeoutMs: number;
        raw: boolean;
        flat: boolean;
      }> = {
        kind: 'ws:call',
        method,
        args,
      };
      if (typeof timeoutMs === 'number') out.timeoutMs = timeoutMs;
      if (typeof connectTimeoutMs === 'number') out.connectTimeoutMs = connectTimeoutMs;
      if (raw) out.raw = true;
      if (flat) out.flat = true;
      return out;
    }
    case 'ws:ping':
    case 'ws-ping': {
      const text = kv['text'] ?? 'hello';
      return { kind: 'ws:ping', text };
    }
    case 'osc:send':
    case 'osc-send': {
      const address = kv['address'];
      if (!address || !address.startsWith('/')) throw new Error("--address '/path' required");
      const parseCsv = (raw: string | undefined, label: string): number[] => {
        const vals = (raw ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
          .map((s) => Number(s));
        if (vals.length === 0 || !vals.every((n) => Number.isFinite(n)))
          throw new Error(`--${label} must be CSV of numbers`);
        return vals;
      };
      const text = kv['text'];
      const floats = has('floats') ? parseCsv(kv['floats'], 'floats') : undefined;
      const integers = has('ints') ? parseCsv(kv['ints'], 'ints') : undefined;
      if (typeof text === 'string' && (floats || integers))
        throw new Error('use either --text or one of --floats/--ints');
      if (floats && integers) throw new Error('use exactly one of --floats or --ints (not both)');
      if (!text && !floats && !integers)
        throw new Error('one of --text, --floats, or --ints is required');
      const out: { kind: 'osc:send'; address: string } & Partial<{
        text: string;
        floats: number[];
        ints: number[];
      }> = { kind: 'osc:send', address };
      if (typeof text === 'string') out.text = text;
      if (floats) out.floats = floats;
      if (integers) out.ints = integers;
      return out;
    }
    case 'osc:listen':
    case 'osc-listen': {
      const host = kv['host'] ?? process.env['RESONITE_OSC_LISTEN_HOST'] ?? '0.0.0.0';
      const port = Number(kv['port'] ?? process.env['RESONITE_OSC_LISTEN_PORT'] ?? '9010');
      if (!Number.isFinite(port)) throw new Error('--port must be a number');
      const filter = kv['filter'];
      const durationMs = asNumber('durationMs');
      const out: { kind: 'osc:listen'; host: string; port: number } & Partial<{
        filter: string;
        durationMs: number;
      }> = { kind: 'osc:listen', host, port };
      if (typeof filter === 'string') out.filter = filter;
      if (typeof durationMs === 'number') out.durationMs = durationMs;
      return out;
    }
    case 'osc:set-expression':
    case 'set-expression': {
      const eyesId = kv['eyesId'];
      const mouthId = kv['mouthId'];
      const cmd: { kind: 'osc:set-expression'; eyesId?: string; mouthId?: string } = {
        kind: 'osc:set-expression',
      };
      if (eyesId) cmd.eyesId = eyesId;
      if (mouthId) cmd.mouthId = mouthId;
      return cmd;
    }
    case 'osc:set-accent-hue':
    case 'set-accent-hue': {
      const hue = Number(kv['hue']);
      if (!Number.isFinite(hue)) throw new Error('hue is required');
      return { kind: 'osc:set-accent-hue', hue };
    }
    case 'osc:expression-seq':
    case 'expression-seq':
    case 'expressions': {
      const delayMs = Number(kv['delayMs'] ?? '300');
      return { kind: 'osc:expression-seq', delayMs: Number.isFinite(delayMs) ? delayMs : 300 };
    }
    case 'osc:pose':
    case 'pose': {
      const x = Number(kv['x'] ?? '0');
      const y = Number(kv['y'] ?? '0');
      const z = Number(kv['z'] ?? '0');
      const heading = Number(kv['heading'] ?? '0');
      const pitch = Number(kv['pitch'] ?? '0');
      return { kind: 'osc:pose', x, y, z, heading, pitch };
    }
    default:
      return { kind: 'help' };
  }
}

async function main(): Promise<void> {
  const cmd = parseArgs(process.argv.slice(2));
  if (cmd.kind === 'help') {
    const u = `Usage: probe <command> [options]\n\nCommands:\n  ws:call --method <name> [--arg k=v] [--timeoutMs 15000] [--connectTimeoutMs 15000] [--raw] [--flat]\n  ws:ping --text <str>                 (alias: ws-ping)\n  osc:send --address /path [--text s | --floats f1,f2,... | --ints i1,i2,...] (alias: osc-send)\n  osc:listen [--host 0.0.0.0] [--port 9010] [--filter /addr] [--durationMs N] (alias: osc-listen)\n  osc:set-expression [--eyesId id] [--mouthId id] (alias: set-expression)\n  osc:set-accent-hue --hue <0..360>    (alias: set-accent-hue)\n  osc:pose --x --y --z --heading --pitch (alias: pose)\n  osc:expression-seq [--delayMs 300]   (alias: expressions)\n`;
    console.log(u);
    return;
  }
  if (cmd.kind === 'ws:call') {
    const cfg = wsConfigFromEnv();
    const server = new WebSocketRpcServer(cfg);
    try {
      const { method, args, timeoutMs, connectTimeoutMs, raw, flat } = cmd;
      if (raw) {
        const res = await server.requestWithRaw(method, args, {
          timeoutMs: timeoutMs ?? 15000,
          connectTimeoutMs: connectTimeoutMs ?? 15000,
        });
        console.log(res.raw);
      } else if (flat) {
        const res = await server.requestWithRaw(method, args, {
          timeoutMs: timeoutMs ?? 15000,
          connectTimeoutMs: connectTimeoutMs ?? 15000,
        });
        console.log(JSON.stringify(res.flat));
      } else {
        const res = await server.request(method, args, {
          timeoutMs: timeoutMs ?? 15000,
          connectTimeoutMs: connectTimeoutMs ?? 15000,
        });
        console.log(JSON.stringify(res));
      }
    } finally {
      server.close();
    }
    return;
  }
  if (cmd.kind === 'ws:ping') {
    const cfg = wsConfigFromEnv();
    const server = new WebSocketRpcServer(cfg);
    try {
      const res = await server.request('ping', { text: cmd.text }, { timeoutMs: 15000 });
      const parsed = z.object({ text: z.string() }).parse(res);
      console.log(parsed.text);
    } finally {
      server.close();
    }
    return;
  }
  if (cmd.kind === 'osc:listen') {
    const { host, port, filter, durationMs } = cmd;
    const server = new OscServer(port, host);
    console.error(`listening OSC on ${host}:${port}${filter ? ` filter=${filter}` : ''}`);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const shutdown = (code = 0): void => {
      try {
        server.close();
      } catch {
        // ignore
      }
      if (timer) clearTimeout(timer);
      process.exit(code);
    };
    process.on('SIGINT', () => shutdown(0));
    if (typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs > 0) {
      timer = setTimeout(() => shutdown(0), durationMs);
    }
    server.on('message', (msg: unknown[]) => {
      if (!Array.isArray(msg) || msg.length === 0) return;
      const [address, ...rest] = msg as [unknown, ...unknown[]];
      if (typeof address !== 'string') return;
      if (filter && address !== filter) return;
      const preview = rest.map((v) => (typeof v === 'number' ? v : String(v)));
      console.log(`${address} ${preview.join(' ')}`);
    });
    return; // keep process alive
  }
  const oscSender = new OscSender(loadOscTargetFromEnv());
  try {
    if (cmd.kind === 'osc:send') {
      if (typeof cmd.text === 'string') {
        await oscSender.sendTextAt(cmd.address, cmd.text);
        console.log('delivered');
        return;
      }
      if (cmd.floats && cmd.floats.length > 0) {
        await oscSender.sendNumbers(cmd.address, ...cmd.floats);
        console.log('delivered');
        return;
      }
      if (cmd.ints && cmd.ints.length > 0) {
        await oscSender.sendIntegers(cmd.address, ...cmd.ints);
        console.log('delivered');
        return;
      }
      throw new Error('nothing to send');
    }
    if (cmd.kind === 'osc:expression-seq') {
      const uc = new SetExpression(oscSender);
      const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
      const steps: Array<{ eyesId?: string; mouthId?: string }> = [
        { eyesId: 'winkL', mouthId: 'smile_big' },
        { eyesId: 'sparkle', mouthId: 'smile_big' },
        { eyesId: 'surprised', mouthId: 'line' },
        { eyesId: 'closed', mouthId: 'line' },
        // end with neutral (mouth uses 'line' as neutral equivalent)
        { eyesId: 'neutral', mouthId: 'line' },
      ];
      for (const s of steps) {
        await uc.execute(s);
        await sleep(cmd.delayMs);
      }
      console.log('sequence delivered');
      return;
    }
    if (cmd.kind === 'osc:pose') {
      const host = process.env['RESONITE_OSC_LISTEN_HOST'] ?? '127.0.0.1';
      const port = Number(process.env['RESONITE_OSC_LISTEN_PORT'] ?? '9010');
      const ingress = new OscSender({ host, port, address: ADDR.pose.position });
      await ingress.sendNumbers(ADDR.pose.position, cmd.x, cmd.y, cmd.z);
      await ingress.sendNumbers(ADDR.pose.rotation, cmd.heading, cmd.pitch);
      ingress.close();
      console.log('pose delivered');
      return;
    }
    if (cmd.kind === 'osc:set-expression') {
      const uc = new SetExpression(oscSender);
      await uc.execute({ eyesId: cmd.eyesId, mouthId: cmd.mouthId });
      console.log('delivered');
      return;
    }
    if (cmd.kind === 'osc:set-accent-hue') {
      const uc = new SetAccentHue(oscSender);
      await uc.execute({ hue: cmd.hue });
      console.log('delivered');
      return;
    }
  } finally {
    oscSender.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
import 'dotenv/config';
