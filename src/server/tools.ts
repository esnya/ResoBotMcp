import { z } from 'zod';
import { server, ctx } from './app.js';
import { scoped } from '../logging.js';
import { encodeArray } from '../gateway/FlatKV.js';
import { SetExpression, SetExpressionInput } from '../usecases/SetExpression.js';
import { SetAccentHue, SetAccentHueInput } from '../usecases/SetAccentHue.js';
import { filenameFromLocalUrl } from '../gateway/LocalWhitelistResources.js';
import { TurnRelativeInput } from '../types/controls.js';
import {
  SetTextInput,
  DirectionSchema,
  PingInput,
  CaptureCameraInput,
  WaitResoniteInput,
} from '../tools/contracts.js';

const log = scoped('tool');
const setExpression = new SetExpression(ctx.oscSender);
const setAccentHue = new SetAccentHue(ctx.oscSender);

// Register tools at import-time (declarative style)
server.registerTool(
  'set_text',
  { description: 'Send text via OSC.', inputSchema: SetTextInput },
  async (args: { text: string }) => {
    const { text } = z.object(SetTextInput).parse(args);
    await ctx.sendTextViaOsc.execute({ text });
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
    return { content: [{ type: 'text', text: parsed.text }] };
  },
);

server.registerTool(
  'capture_camera',
  { description: 'Capture; returns filename.', inputSchema: CaptureCameraInput },
  async (args: { fov: number; size: number }) => {
    const { fov, size } = z.object(CaptureCameraInput).parse(args);
    log.info({ name: 'capture_camera', fov, size }, 'request');
    try {
      const { record, raw } = await ctx.wsServer.requestWithRaw('camera_capture', {
        fov: String(fov),
        size: String(size),
      });
      const parsed = z.object({ url: z.string().startsWith('local://') }).safeParse(record);
      if (!parsed.success) {
        const msg = 'invalid ws response: missing url';
        return { isError: true, content: [{ type: 'text', text: `${msg}; raw=${raw}` }] };
      }
      const filename = filenameFromLocalUrl(parsed.data.url);
      return { content: [{ type: 'text', text: filename }] };
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

server.registerTool(
  'wait_resonite',
  {
    description: 'Wait for Resonite WS connection to this server.',
    inputSchema: WaitResoniteInput,
  },
  async (args: { timeoutMs?: number | undefined }) => {
    const { timeoutMs } = z.object(WaitResoniteInput).parse(args);
    await ctx.wsServer.waitForConnection(typeof timeoutMs === 'number' ? timeoutMs : 10000);
    return { content: [{ type: 'text', text: 'connected' }] };
  },
);

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
    await ctx.wsServer.request('move_relative', { vector });
    return { content: [{ type: 'text', text: JSON.stringify({ vector: vec }) }] };
  },
);

server.registerTool(
  'turn_relative',
  { description: 'Turn by degrees.', inputSchema: TurnRelativeInput },
  async (args: { degrees: number }) => {
    const parsed = z.object(TurnRelativeInput).parse(args);
    await ctx.wsServer.request('turn_relative', { degrees: String(parsed.degrees) });
    return { content: [{ type: 'text', text: JSON.stringify({ degrees: parsed.degrees }) }] };
  },
);

server.registerTool('get_pose', { description: 'Get current pose.' }, (_args: unknown) => {
  const pose = ctx.poseTracker.get();
  if (!pose) throw new Error('pose unavailable');
  return { content: [{ type: 'text', text: JSON.stringify(pose) }] };
});
