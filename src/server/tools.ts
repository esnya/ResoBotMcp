import { z } from 'zod';
import { encodeArray } from '../gateway/FlatKV.js';
import { ReadLocalAsset, loadResoniteDataPathFromEnv } from '../usecases/ReadLocalAsset.js';
import { scoped } from '../logging.js';
import {
  CaptureCameraInput,
  DirectionSchema,
  PingInput,
  SetTextInput,
  WaitResoniteInput,
  SetArmPositionInput,
  SetLampInput,
  TurnRelativeInput,
} from '../tools/contracts.js';
import { SetAccentHue, SetAccentHueInput } from '../usecases/SetAccentHue.js';
import { SetExpression, SetExpressionInput } from '../usecases/SetExpression.js';
import { ctx, server } from './app.js';
import { ADDR } from '../gateway/addresses.js';

const log = scoped('tool');
const setExpression = new SetExpression(ctx.oscSender);
const setAccentHue = new SetAccentHue(ctx.oscSender);

// Register tools at import-time (declarative style)
server.registerTool(
  'set_text',
  { description: 'Send text via OSC.', inputSchema: SetTextInput },
  async (args: { text: string }) => {
    const { text } = z.object(SetTextInput).parse(args);
    await ctx.oscSender.sendText(text);
    return { content: [{ type: 'text', text: 'delivered' }] };
  },
);

// Set arm XYZ position
server.registerTool(
  'set_arm_position',
  { description: 'Set arm XYZ.', inputSchema: SetArmPositionInput },
  async (args: { x: number; y: number; z: number }) => {
    const parsed = z.object(SetArmPositionInput).parse(args);
    const { x, y, z: zPos } = parsed;
    await ctx.oscSender.sendNumbers(ADDR.arm.position, x, y, zPos);
    return { content: [{ type: 'text', text: 'delivered' }] };
  },
);

server.registerTool(
  'set_expression',
  { description: 'Set facial expression.', inputSchema: SetExpressionInput },
  async (args: { eyesId?: string | undefined; mouthId?: string | undefined }) => {
    await setExpression.execute(args);
    return { content: [{ type: 'text', text: 'delivered' }] };
  },
);

server.registerTool(
  'ping',
  { description: 'WS echo roundtrip.', inputSchema: PingInput },
  async (args: { text: string }) => {
    const res = await ctx.wsServer.request('ping', { text: args.text ?? '' });
    const parsed = z.object({ text: z.string() }).parse(res);
    return {
      content: [{ type: 'text', text: parsed.text }],
      structuredContent: { text: parsed.text },
    } as const;
  },
);

server.registerTool(
  'capture_camera',
  { description: 'Capture; returns image (base64).', inputSchema: CaptureCameraInput },
  async (args: { fov?: unknown; size?: unknown }) => {
    // Normalize minor argument issues: defaults and nearest power-of-two size
    const defaultFov = 60;
    const defaultSize = 512;
    const rawFov = Number((args as { fov?: unknown }).fov);
    const rawSize = Number((args as { size?: unknown }).size);
    const fov = Number.isFinite(rawFov) ? rawFov : defaultFov;
    let size: number;
    if (Number.isFinite(rawSize)) {
      const clamped = Math.max(1, Math.min(4096, Math.round(rawSize)));
      const lower = 2 ** Math.floor(Math.log2(clamped));
      const upper = 2 ** Math.ceil(Math.log2(clamped));
      size = clamped === lower ? lower : clamped - lower <= upper - clamped ? lower : upper;
      size = Math.max(1, Math.min(4096, size));
    } else {
      size = defaultSize;
    }
    // Validate final model (strict contract) before calling WS RPC
    const { fov: okFov, size: okSize } = z.object(CaptureCameraInput).parse({ fov, size });
    log.info({ name: 'capture_camera', fov: okFov, size: okSize, normalized: true }, 'request');
    try {
      const { record, raw } = await ctx.wsServer.requestWithRaw('camera_capture', {
        fov: String(okFov),
        size: String(okSize),
      });
      const parsed = z.object({ url: z.string().startsWith('local://') }).safeParse(record);
      if (!parsed.success) {
        const msg = 'invalid ws response: missing url';
        return { isError: true, content: [{ type: 'text', text: `${msg}; raw=${raw}` }] };
      }
      const assetCfg = loadResoniteDataPathFromEnv();
      const reader = new ReadLocalAsset(assetCfg);
      const b64 = await reader.readBase64FromLocalUrl(parsed.data.url);
      return {
        content: [{ type: 'image', data: b64, mimeType: 'image/png' }],
        structuredContent: { url: parsed.data.url, fov: okFov, size: okSize },
      } as const;
    } catch (e) {
      const err = e as Error & { raw?: string };
      const raw =
        typeof (err as { raw?: unknown }).raw === 'string'
          ? `; raw=${(err as { raw?: string }).raw}`
          : '';
      return { isError: true, content: [{ type: 'text', text: `ws error: ${err.message}${raw}` }] };
    }
  },
);

server.registerTool(
  'set_accent_hue',
  { description: 'Set accent hue.', inputSchema: SetAccentHueInput },
  async (args: { hue: number }) => {
    await setAccentHue.execute(args);
    return { content: [{ type: 'text', text: 'delivered' }] };
  },
);

// Lamp control: state (off/on) mapped to int (0/2), optional brightness [0..1]
server.registerTool(
  'set_lamp',
  { description: 'Lamp on/off and brightness.', inputSchema: SetLampInput },
  async (args: Record<string, unknown>) => {
    const { state, on, brightness, temperature } = z.object(SetLampInput).parse(args);
    const resolvedState: 'off' | 'on' = state ?? (on ? 'on' : 'off');
    const stateInt = resolvedState === 'on' ? 2 : 0;
    // Lamp state is expected as integer (0/2) on Resonite side
    await ctx.oscSender.sendIntegers(ADDR.lamp.state, stateInt);
    if (typeof brightness === 'number') {
      const b = Math.min(1, Math.max(0, brightness));
      await ctx.oscSender.sendNumbers(ADDR.lamp.brightness, b);
    }
    if (typeof temperature === 'number') {
      await ctx.oscSender.sendNumbers(ADDR.lamp.temperature, temperature);
    }
    return { content: [{ type: 'text', text: 'delivered' }] };
  },
);

// Restore standard state (keep color as-is internally)
server.registerTool('reset', { description: 'Restore standard state.' }, async (_args: unknown) => {
  // Neutral expression
  await setExpression.execute({ eyesId: 'neutral', mouthId: 'line' });
  // Lamp: off, and set temperature to warm (~2700K). Accent color is preserved elsewhere.
  await ctx.oscSender.sendIntegers(ADDR.lamp.state, 0);
  await ctx.oscSender.sendNumbers(ADDR.lamp.temperature, 2700);
  // Brightness to standard level (full)
  await ctx.oscSender.sendNumbers(ADDR.lamp.brightness, 1);
  // Arm position to origin
  await ctx.oscSender.sendNumbers(ADDR.arm.position, 0, 0, 0);
  return { content: [{ type: 'text', text: 'reset' }] } as const;
});

server.registerTool(
  'wait_resonite',
  {
    description: 'Wait for Resonite WS connection to this server.',
    inputSchema: WaitResoniteInput,
  },
  async (args: { timeoutMs?: number | undefined }) => {
    const { timeoutMs } = z.object(WaitResoniteInput).parse(args);
    // Default bounded wait for connection
    await ctx.wsServer.waitForConnection(typeof timeoutMs === 'number' ? timeoutMs : 15000);
    return { content: [{ type: 'text', text: 'connected' }] };
  },
);

// Arm instant actions (RPC): grab and release
server.registerTool('arm_grab', { description: 'Arm grab (instant).' }, async (_args: unknown) => {
  const rec = await ctx.wsServer.request('arm_grab', {});
  const parsed = z.object({ grabbing: z.string().min(1) }).parse(rec);
  return {
    content: [{ type: 'text', text: `ok: ${parsed.grabbing}` }],
    structuredContent: { grabbing: parsed.grabbing },
  } as const;
});

server.registerTool(
  'arm_release',
  { description: 'Arm release (instant).' },
  async (_args: unknown) => {
    const rec = await ctx.wsServer.request('arm_release', {});
    const parsed = z.object({ released_count: z.coerce.number().int().min(0) }).parse(rec);
    return {
      content: [{ type: 'text', text: `released: ${parsed.released_count}` }],
      structuredContent: { released_count: parsed.released_count },
    } as const;
  },
);

// Get last arm contact metadata and grabbed flag
server.registerTool('get_arm_contact', { description: 'Last arm contact.' }, (_args: unknown) => {
  const c = ctx.armContact.get();
  // If no contact has been received yet, or metadata is empty, guide the user.
  if (!c || !c.meta || String(c.meta).trim().length === 0) {
    const msg =
      'No arm contact detected. Move the arm or approach the target until contact is made.';
    return { content: [{ type: 'text', text: msg }] };
  }
  return { content: [{ type: 'text', text: JSON.stringify(c) }] };
});

server.registerTool(
  'move_relative',
  {
    description: 'Move by direction+distance.',
    inputSchema: { direction: DirectionSchema, distance: z.number() },
  },
  async (args: {
    direction: 'forward' | 'back' | 'left' | 'right' | 'up' | 'down';
    distance: number;
  }) => {
    const d = Number(args.distance);
    if (!Number.isFinite(d) || d === 0) return { content: [{ type: 'text', text: 'noop' }] };
    let vec: [number, number, number] = [0, 0, 0];
    switch (args.direction) {
      case 'forward':
        vec = [0, 0, d];
        break;
      case 'back':
        vec = [0, 0, -d];
        break;
      case 'left':
        vec = [-d, 0, 0];
        break;
      case 'right':
        vec = [d, 0, 0];
        break;
      case 'up':
        vec = [0, d, 0];
        break;
      case 'down':
        vec = [0, -d, 0];
        break;
    }
    const vector = encodeArray(vec);
    const rec = await ctx.wsServer.request('move_relative', { vector });
    const out = z.object({ actual_moved_meters: z.coerce.number() }).parse(rec);
    return {
      content: [{ type: 'text', text: `moved: ${out.actual_moved_meters}` }],
      structuredContent: { actual_moved_meters: out.actual_moved_meters },
    } as const;
  },
);

server.registerTool(
  'turn_relative',
  { description: 'Turn by degrees.', inputSchema: TurnRelativeInput },
  async (args: { degrees: number }) => {
    const parsed = z.object(TurnRelativeInput).parse(args);
    const rec = await ctx.wsServer.request('turn_relative', { degrees: String(parsed.degrees) });
    // No fields expected in response; enforce empty payload
    z.object({}).strict().parse(rec);
    return { content: [{ type: 'text', text: 'ok' }] } as const;
  },
);

server.registerTool('get_pose', { description: 'Get current pose.' }, (_args: unknown) => {
  const pose = ctx.poseTracker.get();
  if (!pose) throw new Error('pose unavailable');
  return { content: [{ type: 'text', text: JSON.stringify(pose) }] };
});
