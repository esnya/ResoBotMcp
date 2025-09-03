import 'dotenv/config';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { scoped } from './logging.js';
import { server, ctx } from './server/app.js';
import './server/tools.js';

const log = scoped('main');

process.on('exit', () => ctx.oscSender.close());
process.on('SIGINT', () => {
  try {
    ctx.oscSender.close();
    ctx.oscIngress.close();
    ctx.wsServer.close();
  } finally {
    process.exit(0);
  }
});

const transport = new StdioServerTransport();
server.connect(transport).catch((err: unknown) => {
  log.error({ err }, 'Failed to start MCP stdio server');
  process.exit(1);
});
