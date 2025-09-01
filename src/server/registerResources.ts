import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LocalWhitelistResources } from '../gateway/LocalWhitelistResources.js';

export type RegisteredResources = {
  local: LocalWhitelistResources;
};

export function registerResources(server: McpServer): RegisteredResources {
  const local = new LocalWhitelistResources();
  local.register(server);
  return { local } as const;
}
