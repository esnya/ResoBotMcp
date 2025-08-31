import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';
import { OscTextSender, loadOscTargetFromEnv } from './gateway/OscSender.js';
import { SendTextViaOsc } from './usecases/SendTextViaOsc.js';
import { WebSocketRpcServer, wsConfigFromEnv } from './gateway/WebSocketRpc.js';
import { ReadLocalAsset, loadResoniteDataPathFromEnv } from './usecases/ReadLocalAsset.js';
const InputSchema = {
  text: z.string().min(1, 'text is required'),
} as const;
type SendTextArgs = {
  text: string;
};

const oscTarget = loadOscTargetFromEnv();
const oscSender = new OscTextSender(oscTarget);
const sendTextViaOsc = new SendTextViaOsc(oscSender);
const wsServer = new WebSocketRpcServer(wsConfigFromEnv());
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

const transport = new StdioServerTransport();
server.connect(transport).catch((err) => {
  console.error('Failed to start MCP stdio server:', err);
  process.exit(1);
});
