import { Server } from 'node-osc';
import { scoped } from '../logging.js';
import { z } from 'zod';
import { OscIngressConfig } from '../types/config.js';

const log = scoped('osc-recv');
const _noop = (): void => {};

// Config schema moved to types/config.ts

type Handler = (args: unknown[]) => void;

export class OscReceiver {
  private readonly server: Server;
  private readonly handlers = new Map<string, Handler>();

  constructor(private readonly config: OscIngressConfig) {
    this.server = new Server(config.port, config.host);
    log.info({ host: config.host, port: config.port }, 'OSC receiver listening');
    this.server.on('message', (msg: unknown[]) => {
      if (!Array.isArray(msg) || msg.length === 0) return;
      const [address, ...rest] = msg as [unknown, ...unknown[]];
      if (typeof address !== 'string') return;
      try {
        const preview = rest.map((v) => (typeof v === 'number' ? v : String(v))).slice(0, 8);
        log.debug({ address, args: preview }, 'osc message received');
      } catch {
        _noop();
      }
      const h = this.handlers.get(address);
      if (h) {
        try {
          h(rest);
        } catch (e) {
          log.error({ err: e, address }, 'handler threw');
        }
      } else {
        log.debug({ address }, 'unhandled OSC address');
      }
    });
  }

  register(address: string, handler: Handler): void {
    if (!address.startsWith('/')) throw new Error("OSC address must start with '/'");
    this.handlers.set(address, handler);
  }

  close(): void {
    this.server.close();
  }
}

export function oscIngressConfigFromEnv(): OscIngressConfig {
  const EnvSchema = z.object({
    host: z.string().min(1).default('0.0.0.0'),
    port: z.coerce.number().int().min(1).max(65535).default(9010),
  });
  return EnvSchema.parse({
    host: process.env['RESONITE_OSC_LISTEN_HOST'],
    port: process.env['RESONITE_OSC_LISTEN_PORT'],
  });
}
