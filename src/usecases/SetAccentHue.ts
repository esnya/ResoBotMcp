import { z } from 'zod';
import { OscSender } from '../gateway/OscSender.js';

export const SetAccentHueInput = {
  hue: z.number().min(0).max(360),
} as const;
export const SetAccentHueSchema = z.object(SetAccentHueInput);
export type SetAccentHueArgs = z.infer<typeof SetAccentHueSchema>;

export class SetAccentHue {
  constructor(private readonly osc: OscSender) {}

  async execute(args: SetAccentHueArgs): Promise<{ delivered: true }> {
    const { hue } = SetAccentHueSchema.parse(args);
    const normalized = hue / 360;
    await this.osc.sendNumbers('/virtualbot/accent/hue', normalized);
    return { delivered: true } as const;
  }
}
