import pino from 'pino';

const level = process.env['LOG_LEVEL'] ?? 'info';

export const logger = pino({
  level,
  base: { app: 'resonite-mcp' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export function scoped(scope: string): ReturnType<typeof logger.child> {
  return logger.child({ scope });
}
