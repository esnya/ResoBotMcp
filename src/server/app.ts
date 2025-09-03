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
