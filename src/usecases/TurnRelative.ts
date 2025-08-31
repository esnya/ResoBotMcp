import { z } from 'zod';
import { OscSender } from '../gateway/OscSender.js';

export const TurnRelativeInput = {
  degrees: z.number(),
} as const;

export class TurnRelative {
  constructor(private readonly osc: OscSender) {}

  async execute(args: { degrees: number }): Promise<{ delivered: true }> {
    const { degrees } = z.object({ degrees: z.number() }).parse(args);
    if (degrees === 0) return { delivered: true } as const;
    await this.osc.sendNumbers('/resobot/turn', degrees);
    return { delivered: true } as const;
  }
}
