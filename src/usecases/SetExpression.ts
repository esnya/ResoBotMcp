import { z } from 'zod';
import { OscSender } from '../gateway/OscSender.js';
import { readExpressionPreset } from '../gateway/Presets.js';

export const SetExpressionInput = {
  eyesId: z.string().min(1).optional(),
  mouthId: z.string().min(1).optional(),
} as const;
export const SetExpressionSchema = z.object(SetExpressionInput);
export type SetExpressionArgs = z.infer<typeof SetExpressionSchema>;

export class SetExpression {
  constructor(private readonly osc: OscSender) {}

  async execute(args: SetExpressionArgs): Promise<{ delivered: true }> {
    const parsed = SetExpressionSchema.parse(args);
    if (parsed.eyesId !== undefined) {
      const text = await readExpressionPreset('eyes', parsed.eyesId);
      await this.osc.sendText(text, '/virtualbot/expression/eyes');
    }
    if (parsed.mouthId !== undefined) {
      const text = await readExpressionPreset('mouth', parsed.mouthId);
      await this.osc.sendText(text, '/virtualbot/expression/mouth');
    }
    return { delivered: true } as const;
  }
}
