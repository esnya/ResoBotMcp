import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';
import { OscTextSender, loadOscTargetFromEnv } from './gateway/OscSender.js';
import { SendTextViaOsc } from './usecases/SendTextViaOsc.js';
import { WebSocketRpcServer, wsConfigFromEnv } from './gateway/WebSocketRpc.js';
const InputSchema = {
  text: z.string().min(1, 'text is required'),
  address: z.string().startsWith('/').optional(),
  host: z.string().ip({ version: 'v4' }).optional(),
  port: z.number().int().min(1).max(65535).optional(),
} as const;
type SendTextArgs = {
  text: string;
  address?: string;
  host?: string;
  port?: number;
};

const oscTarget = loadOscTargetFromEnv();
const oscSender = new OscTextSender(oscTarget);
const sendTextViaOsc = new SendTextViaOsc(oscSender);
const wsServer = new WebSocketRpcServer(wsConfigFromEnv());
// Built-in RPC: sys.ping (Resonite -> Server)
const SERVER_NAME = 'resonite-mcp';
const SERVER_VERSION = '0.1.0';
wsServer.register('sys.ping', () => ({
  server: `${SERVER_NAME}/${SERVER_VERSION}`,
  now: String(Date.now()),
}));

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
  address: z.ZodOptional<z.ZodString>;
  host: z.ZodOptional<z.ZodString>;
  port: z.ZodOptional<z.ZodNumber>;
}>(
  'resonite.osc.send_text',
  {
    description: 'Send a generic UTF-8 text payload over OSC to Resonite.',
    inputSchema: InputSchema,
  },
  async (args: SendTextArgs) => {
    const { host, port, address, text } = args;
    if (host || port) {
      const { Client } = await import('node-osc');
      const client = new Client(host ?? oscTarget.host, port ?? oscTarget.port);
      await new Promise<void>((resolve, reject) => {
        try {
          client.send(address ?? oscTarget.address, text, (err: Error | null) => {
            client.close();
            if (err) {
              reject(err);
              return;
            }
            resolve();
          });
        } catch (e) {
          client.close();
          reject(e as Error);
        }
      });
      return { content: [{ type: 'text', text: 'delivered' }] };
    }
    const payload: { text: string; address?: string } = { text };
    if (address !== undefined) payload.address = address;
    await sendTextViaOsc.execute(payload);
    return { content: [{ type: 'text', text: 'delivered' }] };
  },
);

const transport = new StdioServerTransport();
server.connect(transport).catch((err) => {
  console.error('Failed to start MCP stdio server:', err);
  process.exit(1);
});
