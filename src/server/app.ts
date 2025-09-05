import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createAppContext } from './context.js';

/** Singletons (definitions). Importing this module constructs the app context and MCP server. */
export const ctx = createAppContext();
export const server = new McpServer(
  { name: 'resonite-mcp', version: '0.1.0' },
  {
    capabilities: { tools: {} },
    instructions: 'MCP server exposing tools to interact with Resonite via OSC.',
  },
);

// Wrap tool registration to log all tool calls and results to the visual log.
const _origRegisterTool = server.registerTool.bind(server);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(server as any).registerTool = function registerToolWrapped(
  name: string,
  info: unknown,
  handler: (args: Record<string, unknown>) => Promise<unknown> | unknown,
): ReturnType<typeof _origRegisterTool> {
  const wrapped: (args: Record<string, unknown>) => Promise<unknown> = async (
    args: Record<string, unknown>,
  ): Promise<unknown> => {
    const t0 = Date.now();
    try {
      const res = (await handler(args)) as
        | { content?: Array<unknown>; structuredContent?: unknown }
        | undefined;
      // Extract first text or image for summary
      let text: string | undefined;
      let image: { dataUrl: string; mimeType: string } | undefined;
      if (res && Array.isArray(res.content)) {
        for (const c of res.content) {
          const t = (c as { type?: string }).type;
          if (!t) continue;
          if (t === 'text' && typeof (c as { text?: unknown }).text === 'string') {
            text = (c as { text: string }).text;
            break;
          }
          if (t === 'image') {
            const data = (c as { data?: unknown }).data;
            const mimeType = (c as { mimeType?: unknown }).mimeType;
            if (typeof data === 'string' && typeof mimeType === 'string') {
              image = { dataUrl: `data:${mimeType};base64,${data}`, mimeType };
              break;
            }
          }
        }
      }
      const payload = {
        name,
        args,
        ok: true as const,
        t: t0,
        ...(typeof text === 'string' ? { text } : {}),
        ...(image ? { image } : {}),
        ...(res && 'structuredContent' in res && res.structuredContent !== undefined
          ? { structured: (res as { structuredContent?: unknown }).structuredContent }
          : {}),
      } satisfies Omit<import('../usecases/visual_log/types.js').ToolEvent, 'type' | 't'> & {
        t?: number;
      };
      ctx.visualLog.recordTool(payload);
      return res;
    } catch (e) {
      const msg = (e as Error)?.message ?? 'error';
      ctx.visualLog.recordTool({ name, args, ok: false, t: t0, error: msg });
      throw e;
    }
  };
  return _origRegisterTool(name, info as never, wrapped as never);
};
