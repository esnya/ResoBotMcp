import { z } from 'zod';
import { OscSender } from '../gateway/OscSender.js';
// Sends numeric OSC arguments directly

export const MoveLinearInput = {
  forward: z.number().optional(),
  right: z.number().optional(),
} as const;

export type MoveLinearArgs = {
  forward?: number | undefined;
  right?: number | undefined;
};

export class MoveLinear {
  constructor(private readonly osc: OscSender) {}

  async execute(args: MoveLinearArgs): Promise<{ delivered: true }> {
    const parsed = z
      .object({ forward: z.number().optional(), right: z.number().optional() })
      .parse(args);
    const forward = parsed.forward ?? 0;
    const right = parsed.right ?? 0;
    if (forward === 0 && right === 0) {
      return { delivered: true } as const;
    }
    // Order: forward, right
    await this.osc.sendNumbers('/resobot/move', forward, right);
    return { delivered: true } as const;
  }
}
