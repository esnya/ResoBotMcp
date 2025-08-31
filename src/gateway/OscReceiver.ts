import { Server } from 'node-osc';
import { z } from 'zod';
import { scoped } from '../logging.js';

const log = scoped('osc-recv');

export const OscIngressConfigSchema = z.object({
  host: z.string().min(1).default('0.0.0.0'),
  port: z.number().int().min(1).max(65535).default(9010),
});
export type OscIngressConfig = z.infer<typeof OscIngressConfigSchema>;

type Handler = (args: any[]) => void;

export class OscReceiver {
  private readonly server: Server;
  private readonly handlers = new Map<string, Handler>();

  constructor(private readonly config: OscIngressConfig) {
    this.server = new Server(config.port, config.host);
    log.info({ host: config.host, port: config.port }, 'OSC receiver listening');
    this.server.on('message', (msg: any[]) => {
      if (!Array.isArray(msg) || msg.length === 0) return;
      const [address, ...rest] = msg;
      if (typeof address !== 'string') return;
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
  const host = process.env['RESONITE_OSC_LISTEN_HOST'] ?? '0.0.0.0';
  const port = Number(process.env['RESONITE_OSC_LISTEN_PORT'] ?? '9010');
  return OscIngressConfigSchema.parse({ host, port });
}
