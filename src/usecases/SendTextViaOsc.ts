import { OscSender } from '../gateway/OscSender.js';

export class SendTextViaOsc {
  constructor(private readonly osc: OscSender) {}

  async execute(input: { text: string; address?: string }): Promise<{ delivered: true }> {
    await this.osc.sendText(input.text, input.address);
    return { delivered: true } as const;
  }
}
