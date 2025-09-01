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
  {
    description: 'Send a generic UTF-8 text payload over OSC to Resonite.',
    inputSchema: SetTextInput,
  },
  async (args: { text: string }) => {
    const { text } = z.object(SetTextInput).parse(args);
    await ctx.sendTextViaOsc.execute({ text });
    return { content: [{ type: 'text', text: 'delivered' }] };
  },
);

server.registerTool(
  'set_expression',
  {
    description: 'Set expression by preset identifiers (eyesId/mouthId).',
    inputSchema: SetExpressionInput,
  },
  async (args: { eyesId?: string | undefined; mouthId?: string | undefined }) => {
    await setExpression.execute(args);
    return { content: [{ type: 'text', text: 'delivered' }] };
  },
);

server.registerTool(
  'ping',
  {
    description: 'Roundtrip a string via Resonite WS ping and echo it back.',
    inputSchema: PingInput,
  },
  async (args: { text: string }) => {
    const res = await ctx.wsServer.request('ping', { text: args.text ?? '' });
    const parsed = z.object({ text: z.string() }).parse(res);
    return { content: [{ type: 'text', text: parsed.text }] };
  },
);

server.registerTool(
  'capture_camera',
  {
    description: 'Capture via Resonite with {fov,size}; return local filename (no data).',
    inputSchema: CaptureCameraInput,
  },
  async (args: { fov: number; size: number }) => {
    const { fov, size } = z.object(CaptureCameraInput).parse(args);
    log.info({ name: 'capture_camera', fov, size }, 'request');
    const result = await ctx.wsServer.request('camera_capture', {
      fov: String(fov),
      size: String(size),
    });
    const { url } = z.object({ url: z.string().startsWith('local://') }).parse(result);
    const filename = filenameFromLocalUrl(url);
    return { content: [{ type: 'text', text: filename }] };
  },
);

server.registerTool(
  'set_accent_hue',
  {
    description: 'Set accent hue in degrees (0..360). Normalized to 0..1 for OSC.',
    inputSchema: SetAccentHueInput,
  },
  async (args: { hue: number }) => {
    await setAccentHue.execute(args);
    return { content: [{ type: 'text', text: 'delivered' }] };
  },
);

server.registerTool(
  'wait_resonite',
  { description: 'Wait for Resonite WS connection to this server.', inputSchema: WaitResoniteInput },
  async (args: { timeoutMs?: number | undefined }) => {
    const { timeoutMs } = z.object(WaitResoniteInput).parse(args);
    await ctx.wsServer.waitForConnection(typeof timeoutMs === 'number' ? timeoutMs : 10000);
    return { content: [{ type: 'text', text: 'connected' }] };
  },
);

server.registerTool(
  'move_relative',
  {
    description:
      'Move relative by direction enum and distance. Sends XYZ vector via WS RPC; pose echo remains via OSC.',
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
  {
    description: 'Turn (yaw) relative in degrees. Uses WS RPC; pose still echoed via OSC.',
    inputSchema: TurnRelativeInput,
  },
  async (args: { degrees: number }) => {
    const parsed = z.object(TurnRelativeInput).parse(args);
    await ctx.wsServer.request('turn_relative', { degrees: String(parsed.degrees) });
    return { content: [{ type: 'text', text: JSON.stringify({ degrees: parsed.degrees }) }] };
  },
);

server.registerTool(
  'get_pose',
  { description: 'Get current global position (x,y,z) and orientation (heading, pitch).' },
  (_args: unknown) => {
    const pose = ctx.poseTracker.get();
    if (!pose) throw new Error('pose unavailable');
    return { content: [{ type: 'text', text: JSON.stringify(pose) }] };
  },
);
