import pino, { type Logger } from 'pino';

const level = process.env['LOG_LEVEL'] ?? 'info';

// Route logs to stderr to avoid colliding with MCP stdio transport on stdout
const destination = pino.destination({ dest: 2, sync: false });

export const logger: Logger = pino(
  {
    level,
    base: { app: 'resonite-mcp' },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  destination,
);

export function scoped(scope: string): Logger {
  return logger.child({ scope });
}
