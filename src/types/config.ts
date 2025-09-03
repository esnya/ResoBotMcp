import { z } from 'zod';

// Centralized config schemas (code-as-contracts). Keep logic separate.

export const WebSocketConfigSchema = z.object({
  port: z.number().int().min(1).max(65535).default(8765),
});
export type WebSocketConfig = z.infer<typeof WebSocketConfigSchema>;

export const OscIngressConfigSchema = z.object({
  host: z.string().min(1).default('0.0.0.0'),
  port: z.number().int().min(1).max(65535).default(9010),
});
export type OscIngressConfig = z.infer<typeof OscIngressConfigSchema>;

export const OscTargetSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  address: z.string().startsWith('/'),
});
export type OscTarget = z.infer<typeof OscTargetSchema>;

export const ReadLocalAssetConfigSchema = z.object({
  resoniteDataPath: z.string().min(1, 'resoniteDataPath is required'),
});
export type ReadLocalAssetConfig = z.infer<typeof ReadLocalAssetConfigSchema>;
