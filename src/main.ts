import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';
import { OscSender, loadOscTargetFromEnv } from './gateway/OscSender.js';
import { SendTextViaOsc } from './usecases/SendTextViaOsc.js';
import { WebSocketRpcServer, wsConfigFromEnv } from './gateway/WebSocketRpc.js';
import { ReadLocalAsset, loadResoniteDataPathFromEnv } from './usecases/ReadLocalAsset.js';
import { TurnRelativeInput } from './types/controls.js';
import { SetExpression, SetExpressionInput } from './usecases/SetExpression.js';
import { SetAccentHue, SetAccentHueInput } from './usecases/SetAccentHue.js';
import { OscReceiver, oscIngressConfigFromEnv } from './gateway/OscReceiver.js';
import { PoseTracker } from './gateway/PoseTracker.js';
import { scoped } from './logging.js';
import { encodeArray } from './gateway/FlatKV.js';
const InputSchema = {
  text: z.string().min(1, 'text is required'),
} as const;
type SendTextArgs = {
  text: string;
};

const oscTarget = loadOscTargetFromEnv();
const log = scoped('main');
const oscSender = new OscSender(oscTarget);
const sendTextViaOsc = new SendTextViaOsc(oscSender);
const wsServer = new WebSocketRpcServer(wsConfigFromEnv());
const setExpression = new SetExpression(oscSender);
const setAccentHue = new SetAccentHue(oscSender);
log.info({ osc: oscTarget }, 'server starting');

// Track pose from OSC ingress
const poseTracker = new PoseTracker();
const oscIngress = new OscReceiver(oscIngressConfigFromEnv());
oscIngress.register('/virtualbot/position', (args) => {
  const [x, y, z] = args as number[];
  poseTracker.updatePosition(Number(x), Number(y), Number(z));
  scoped('osc:position').debug({ x: Number(x), y: Number(y), z: Number(z) }, 'position updated');
});
oscIngress.register('/virtualbot/rotation', (args) => {
  const [heading, pitch] = args as number[];
  poseTracker.updateRotation(Number(heading), Number(pitch));
  scoped('osc:rotation').debug({ heading: Number(heading), pitch: Number(pitch) }, 'rotation updated');
});
wsServer.register('ping', (args) => {
  const { text } = z.object({ text: z.string() }).parse({ text: args['text'] ?? '' });
  return { text };
});

process.on('exit', () => oscSender.close());
process.on('SIGINT', () => {
  oscSender.close();
  oscIngress.close();
  wsServer.close();
  process.exit(0);
});

const server = new McpServer(
  { name: 'resonite-mcp', version: '0.1.0' },
  {
    capabilities: {
      tools: {},
    },
    instructions: 'MCP server exposing tools to interact with Resonite via OSC.',
  },
);

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function waitForPose(timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const p = poseTracker.get();
    if (p) return p;
    await sleep(50);
  }
  throw new Error('pose unavailable: timeout waiting for initial pose');
}

server.registerTool<{
  text: z.ZodString;
}>(
  'set_text',
  {
    description: 'Send a generic UTF-8 text payload over OSC to Resonite.',
    inputSchema: InputSchema,
  },
  async (args: SendTextArgs) => {
    scoped('tool:set_text').info('sending text');
    const { text } = args;
    await sendTextViaOsc.execute({ text });
    return { content: [{ type: 'text', text: 'delivered' }] };
  },
);

server.registerTool<{
  eyesId: z.ZodOptional<z.ZodString>;
  mouthId: z.ZodOptional<z.ZodString>;
}>(
  'set_expression',
  {
    description: 'Set expression by preset identifiers (eyesId/mouthId).',
    inputSchema: SetExpressionInput,
  },
  async (args: { eyesId?: string; mouthId?: string }) => {
    scoped('tool:set_expression').info(args, 'request');
    await setExpression.execute(args);
    return { content: [{ type: 'text', text: 'delivered' }] };
  },
);

server.registerTool(
  'ping',
  {
    description: 'Roundtrip a string via Resonite WS ping and echo it back.',
    inputSchema: { text: z.string() },
  },
  async (args: { text: string }) => {
    scoped('tool:ping').debug('ws ping');
    const res = await wsServer.request('ping', { text: args.text ?? '' });
    const parsed = z.object({ text: z.string() }).parse(res);
    return { content: [{ type: 'text', text: parsed.text }] };
  },
);

server.registerTool(
  'capture_camera',
  {
    description: 'Capture via Resonite with {fov,size}; return base64 of local asset.',
    inputSchema: {
      fov: z.number(),
      size: z
        .number()
        .int()
        .min(1, 'size must be >= 1')
        .max(4096, 'size must be <= 4096')
        .refine((v) => (v & (v - 1)) === 0, 'size must be a power of two (1..4096)'),
    },
  },
  async (args: { fov: number; size: number }) => {
    scoped('tool:capture_camera').info({ fov: args.fov, size: args.size }, 'request');
    const { fov, size } = args;
    const result = await wsServer.request('camera_capture', {
      fov: String(fov),
      size: String(size),
    });
    const { url } = z.object({ url: z.string().startsWith('local://') }).parse(result);
    const assetCfg = loadResoniteDataPathFromEnv();
    const reader = new ReadLocalAsset(assetCfg);
    const b64 = await reader.readBase64FromLocalUrl(url);
    return { content: [{ type: 'text', text: b64 }] };
  },
);

server.registerTool<{
  hue: z.ZodNumber;
}>(
  'set_accent_hue',
  {
    description: 'Set accent hue in degrees (0..360). Normalized to 0..1 for OSC.',
    inputSchema: SetAccentHueInput,
  },
  async (args: { hue: number }) => {
    scoped('tool:set_accent_hue').info(args, 'request');
    await setAccentHue.execute(args);
    return { content: [{ type: 'text', text: 'delivered' }] };
  },
);

// Directional move (enum + distance), replaces forward/right numeric pair
const DirectionSchema = z.union([
  z.literal('forward'),
  z.literal('back'),
  z.literal('left'),
  z.literal('right'),
  z.literal('up'),
  z.literal('down'),
]);

server.registerTool<{
  direction: z.ZodString;
  distance: z.ZodNumber;
}>(
  'move_relative',
  {
    description:
      'Move relative by direction enum and distance. Sends XYZ vector via WS RPC; pose echo remains via OSC.',
    inputSchema: { direction: DirectionSchema, distance: z.number() },
  },
  async (args: { direction: 'forward' | 'back' | 'left' | 'right' | 'up' | 'down'; distance: number }) => {
    const { direction, distance } = args;
    const d = Number(distance);
    if (!Number.isFinite(d) || d === 0) return { content: [{ type: 'text', text: 'noop' }] };
    let vec: [number, number, number] = [0, 0, 0];
    switch (direction) {
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
    scoped('tool:move_relative').info({ direction, distance: d, vector }, 'rpc move');
    await wsServer.request('move_relative', { vector });
    return { content: [{ type: 'text', text: JSON.stringify({ vector: vec }) }] };
  },
);

server.registerTool<{
  degrees: z.ZodNumber;
}>(
  'turn_relative',
  {
    description: 'Turn (yaw) relative in degrees. Uses WS RPC; pose still echoed via OSC.',
    inputSchema: TurnRelativeInput,
  },
  async (args: { degrees: number }) => {
    scoped('tool:turn_relative').info(args, 'request');
    const parsed = z.object(TurnRelativeInput).parse(args);
    await wsServer.request('turn_relative', { degrees: String(parsed.degrees) });
    scoped('tool:turn_relative').info({ degrees: parsed.degrees }, 'rpc sent');
    return { content: [{ type: 'text', text: JSON.stringify({ degrees: parsed.degrees }) }] };
  },
);

// (moved into move_relative; 'move' tool removed to avoid duplication)

// MCP tool: get current global position and orientation
server.registerTool(
  'get_pose',
  { description: 'Get current global position (x,y,z) and orientation (heading, pitch).' },
  (_args: unknown) => {
    scoped('tool:get_pose').debug('request');
    const pose = poseTracker.get();
    if (!pose) throw new Error('pose unavailable');
    return { content: [{ type: 'text', text: JSON.stringify(pose) }] };
  },
);

const transport = new StdioServerTransport();
server.connect(transport).catch((err) => {
  console.error('Failed to start MCP stdio server:', err);
  process.exit(1);
});
