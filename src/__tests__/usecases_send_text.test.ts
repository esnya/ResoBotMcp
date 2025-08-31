import { describe, it, expect } from 'vitest';
import { SendTextViaOsc } from '../usecases/SendTextViaOsc.js';

class FakeOscSender {
  public texts: Array<{ address: string | undefined; text: string }> = [];
  sendText(text: string, address?: string): Promise<void> {
    this.texts.push({ address, text });
    return Promise.resolve();
  }
}

describe('SendTextViaOsc', () => {
  it('sends text to default address', async () => {
    const osc = new FakeOscSender();
    const uc = new SendTextViaOsc(osc as any);
    await uc.execute({ text: 'hello' });
    expect(osc.texts[0]?.text).toBe('hello');
  });
});
