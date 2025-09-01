import { Client } from 'node-osc';
import { z } from 'zod';
import { scoped } from '../logging.js';
import { ADDR } from './addresses.js';

const log = scoped('osc');

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

export class OscSender {
  private client: Client;
  private defaultAddress: string;

  constructor(target: OscTarget) {
    this.client = new Client(target.host, target.port);
    this.defaultAddress = target.address;
  }

  async sendText(text: string): Promise<void> {
    const addr = this.defaultAddress;
    if (!addr.startsWith('/')) {
      throw new Error(`OSC address must start with '/': ${addr}`);
    }
    await new Promise<void>((resolve, reject) => {
      try {
        this.client.send(addr, text, (err: Error | null) => {
          if (err) {
            log.error({ err, addr }, 'osc send text failed');
            reject(err);
            return;
          }
          log.debug({ addr }, 'osc send text ok');
          resolve();
        });
      } catch (e) {
        log.error({ err: e, addr }, 'osc send text threw');
        reject(e as Error);
      }
    });
  }

  async sendTextAt(address: string, text: string): Promise<void> {
    if (!address.startsWith('/')) {
      throw new Error(`OSC address must start with '/': ${address}`);
    }
    await new Promise<void>((resolve, reject) => {
      try {
        this.client.send(address, text, (err: Error | null) => {
          if (err) {
            log.error({ err, addr: address }, 'osc send text failed');
            reject(err);
            return;
          }
          log.debug({ addr: address }, 'osc send text ok');
          resolve();
        });
      } catch (e) {
        log.error({ err: e, addr: address }, 'osc send text threw');
        reject(e as Error);
      }
    });
  }

  async sendNumbers(address: string, ...values: number[]): Promise<void> {
    if (!address.startsWith('/')) {
      throw new Error(`OSC address must start with '/': ${address}`);
    }
    await new Promise<void>((resolve, reject) => {
      try {
        // Force float typing for numeric values to satisfy receivers expecting float args
        const args = values.map((v) => ({ type: 'float', value: Number(v) }));
        this.client.send(address, ...args, (err: Error | null) => {
          if (err) {
            log.error({ err, address, values }, 'osc send numbers failed');
            reject(err);
            return;
          }
          log.debug({ address, values }, 'osc send numbers ok');
          resolve();
        });
      } catch (e) {
        log.error({ err: e, address, values }, 'osc send numbers threw');
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
  // Address is intentionally fixed to avoid hidden defaults divergence across tools/docs
  const address = ADDR.text;
  return OscTargetSchema.parse({ host, port, address });
}
