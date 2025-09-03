import { ADDR } from '../gateway/addresses.js';
import { ReadLocalAssetConfigSchema } from '../types/config.js';
import { OscIngressConfigSchema } from '../types/config.js';
import { WebSocketConfigSchema } from '../types/config.js';
import { z } from 'zod';

/**
 * Aggregated application configuration. Parse at the boundary (process.env).
 * Keeps per-feature schemas reusable while centralizing env inputs.
 */
export const AppConfigSchema = z.object({
  ws: WebSocketConfigSchema,
  oscEgress: z.object({
    host: z.string().min(1).default('127.0.0.1'),
    port: z.coerce.number().int().min(1).max(65535).default(9000),
    // Address is intentionally fixed to avoid drift across docs/tools.
    address: z.string().startsWith('/').default(ADDR.text),
  }),
  oscIngress: OscIngressConfigSchema,
  assets: ReadLocalAssetConfigSchema,
  visualLog: z.object({
    dir: z.string().min(1).default('logs'),
    flushMs: z.coerce.number().int().min(50).max(60_000).default(1000),
    textCoalesceMs: z.coerce.number().int().min(50).max(10_000).default(500),
  }),
});
export type AppConfig = z.infer<typeof AppConfigSchema>;

export function loadAppConfigFromEnv(): AppConfig {
  // Map env -> config fields; rely on sub-schemas for defaults and validation.
  const raw = {
    ws: {
      port: process.env['RESONITE_WS_PORT'] ? Number(process.env['RESONITE_WS_PORT']) : undefined,
    },
    oscEgress: {
      host: process.env['RESONITE_OSC_HOST'],
      port: process.env['RESONITE_OSC_PORT'] ? Number(process.env['RESONITE_OSC_PORT']) : undefined,
      address: ADDR.text,
    },
    oscIngress: {
      host: process.env['RESONITE_OSC_LISTEN_HOST'],
      port: process.env['RESONITE_OSC_LISTEN_PORT']
        ? Number(process.env['RESONITE_OSC_LISTEN_PORT'])
        : undefined,
    },
    assets: {
      resoniteDataPath: process.env['RESONITE_DATA_PATH'] ?? '',
    },
    visualLog: {
      dir: process.env['VISUAL_LOG_DIR'],
      flushMs: process.env['VISUAL_LOG_FLUSH_MS']
        ? Number(process.env['VISUAL_LOG_FLUSH_MS'])
        : undefined,
      textCoalesceMs: process.env['VISUAL_LOG_TEXT_COALESCE_MS']
        ? Number(process.env['VISUAL_LOG_TEXT_COALESCE_MS'])
        : undefined,
    },
  } as const;
  return AppConfigSchema.parse(raw);
}
