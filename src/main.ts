import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';
import { OscSender, loadOscTargetFromEnv } from './gateway/OscSender.js';
import { SendTextViaOsc } from './usecases/SendTextViaOsc.js';
import { WebSocketRpcServer, wsConfigFromEnv } from './gateway/WebSocketRpc.js';
import { ReadLocalAsset, loadResoniteDataPathFromEnv } from './usecases/ReadLocalAsset.js';
import { MoveLinearInput } from './usecases/MoveLinear.js';
import { TurnRelativeInput } from './usecases/TurnRelative.js';
import { scoped } from './logging.js';
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
log.info({ osc: oscTarget }, 'server starting');
wsServer.register('ping', (args) => {
  const { text } = z.object({ text: z.string() }).parse({ text: args['text'] ?? '' });
  return { text };
});

process.on('exit', () => oscSender.close());
process.on('SIGINT', () => {
  oscSender.close();
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
    const result = await wsServer.request('camera.capture', {
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
  forward: z.ZodOptional<z.ZodNumber>;
  right: z.ZodOptional<z.ZodNumber>;
}>(
  'move_relative',
  {
    description: 'Move relative to bot axes: forward/right in meters. Sends numeric OSC.',
    inputSchema: MoveLinearInput,
  },
  async (args: { forward?: number; right?: number }) => {
    scoped('tool:move_relative').info(args, 'request');
    const parsed = z.object(MoveLinearInput).parse(args);
    const poseRes = await wsServer.request('bot.pose', {});
    const pose = z
      .object({
        x: z.coerce.number(),
        y: z.coerce.number(),
        z: z.coerce.number(),
        heading: z.coerce.number(),
        pitch: z.coerce.number(),
      })
      .parse(poseRes);
    const fwd = parsed.forward ?? 0;
    const right = parsed.right ?? 0;
    if (fwd === 0 && right === 0) return { content: [{ type: 'text', text: 'noop' }] };
    const rad = (pose.heading * Math.PI) / 180;
    const dx = fwd * Math.sin(rad) + right * Math.cos(rad);
    const dz = fwd * Math.cos(rad) - right * Math.sin(rad);
    const nx = pose.x + dx;
    const nz = pose.z + dz;
    // Unify addresses: send position separately
    await oscSender.sendNumbers('/resobot/position', nx, pose.y, nz);
    return { content: [{ type: 'text', text: 'delivered' }] };
  },
);

server.registerTool<{
  degrees: z.ZodNumber;
}>(
  'turn_relative',
  {
    description: 'Turn (yaw) relative in degrees. Sends numeric OSC.',
    inputSchema: TurnRelativeInput,
  },
  async (args: { degrees: number }) => {
    scoped('tool:turn_relative').info(args, 'request');
    const parsed = z.object(TurnRelativeInput).parse(args);
    const poseRes = await wsServer.request('bot.pose', {});
    const pose = z
      .object({
        x: z.coerce.number(),
        y: z.coerce.number(),
        z: z.coerce.number(),
        heading: z.coerce.number(),
        pitch: z.coerce.number(),
      })
      .parse(poseRes);
    const newHeading = pose.heading + parsed.degrees;
    // Unify addresses: send rotation separately
    await oscSender.sendNumbers('/resobot/rotation', newHeading, pose.pitch);
    return { content: [{ type: 'text', text: 'delivered' }] };
  },
);

// MCP tool: get current global position and orientation
server.registerTool(
  'get_pose',
  { description: 'Get current global position (x,y,z) and orientation (heading, pitch).' },
  async (_args: unknown) => {
    scoped('tool:get_pose').debug('request');
    const res = await wsServer.request('bot.pose', {});
    const pose = z
      .object({
        x: z.coerce.number(),
        y: z.coerce.number(),
        z: z.coerce.number(),
        heading: z.coerce.number(),
        pitch: z.coerce.number(),
      })
      .parse(res);
    return { content: [{ type: 'text', text: JSON.stringify(pose) }] };
  },
);

const transport = new StdioServerTransport();
server.connect(transport).catch((err) => {
  console.error('Failed to start MCP stdio server:', err);
  process.exit(1);
});
