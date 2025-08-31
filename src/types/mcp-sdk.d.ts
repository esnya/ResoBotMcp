declare module '@modelcontextprotocol/sdk/server/mcp' {
  import type { ZodRawShape } from 'zod';
  import type { Transport } from '@modelcontextprotocol/sdk/dist/esm/shared/transport.js';
  import type { ServerOptions } from '@modelcontextprotocol/sdk/dist/esm/server/index.js';

  export class McpServer {
    constructor(info: { name: string; version: string }, options?: ServerOptions);
    connect(transport: Transport): Promise<void>;
    close(): Promise<void>;
    registerTool<InputArgs extends ZodRawShape>(
      name: string,
      config: {
        title?: string;
        description?: string;
        inputSchema?: InputArgs;
      },
      cb: (args: any, extra: any) => any,
    ): any;
  }
}

declare module '@modelcontextprotocol/sdk/server/stdio' {
  export class StdioServerTransport {
    constructor();
    start(): Promise<void>;
    close(): Promise<void>;
  }
}
