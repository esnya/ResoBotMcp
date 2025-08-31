import { Client } from 'node-osc';
import { z } from 'zod';

export type OscTarget = {
  host: string;
  port: number;
  address: string;
};

export const OscTargetSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  address: z.string().startsWith('/'),
});

export class OscTextSender {
  private client: Client;
  private defaultAddress: string;

  constructor(target: OscTarget) {
    this.client = new Client(target.host, target.port);
    this.defaultAddress = target.address;
  }

  async sendText(text: string, address?: string): Promise<void> {
    const addr = address ?? this.defaultAddress;
    if (!addr.startsWith('/')) {
      throw new Error(`OSC address must start with '/': ${addr}`);
    }
    await new Promise<void>((resolve, reject) => {
      try {
        this.client.send(addr, text, (err: Error | null) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      } catch (e) {
        reject(e as Error);
      }
    });
  }

  close(): void {
    this.client.close();
  }
}

export function loadOscTargetFromEnv(): OscTarget {
  const host = process.env['RESONITE_OSC_HOST']?.trim() || '127.0.0.1';
  const port = Number(process.env['RESONITE_OSC_PORT']?.trim() ?? '9000');
  const address = process.env['RESONITE_OSC_ADDRESS']?.trim() || '/resonite/text';
  return OscTargetSchema.parse({ host, port, address });
}
