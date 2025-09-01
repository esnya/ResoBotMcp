import { describe, it, expect } from 'vitest';
import { SetExpression } from '../usecases/SetExpression.js';
import { SetAccentHue } from '../usecases/SetAccentHue.js';
import { listExpressionIds } from '../gateway/Presets.js';

class FakeOscSender {
  public texts: Array<{ address: string; text: string }> = [];
  public numbers: Array<{ address: string; values: number[] }> = [];
  sendText(text: string, address?: string): Promise<void> {
    this.texts.push({ address: address ?? '/default', text });
    return Promise.resolve();
  }
  sendTextAt(address: string, text: string): Promise<void> {
    this.texts.push({ address, text });
    return Promise.resolve();
  }
  sendNumbers(address: string, ...values: number[]): Promise<void> {
    this.numbers.push({ address, values });
    return Promise.resolve();
  }
  close(): void {}
}

describe('SetExpression', () => {
  it('sends eyes and mouth preset text to proper addresses', async () => {
    const osc = new FakeOscSender();
    const uc = new SetExpression(osc as any);
    // Use known fixtures present in repo
    await uc.execute({ eyesId: 'winkL', mouthId: 'smile_big' });
    expect(
      osc.texts.find((t) => t.address === '/virtualbot/expression/eyes')?.text.length,
    ).toBeGreaterThan(0);
    expect(
      osc.texts.find((t) => t.address === '/virtualbot/expression/mouth')?.text.length,
    ).toBeGreaterThan(0);
  });

  it('returns valid id list on invalid id error', async () => {
    const osc = new FakeOscSender();
    const uc = new SetExpression(osc as any);
    const list = await listExpressionIds('eyes');
    await expect(uc.execute({ eyesId: '___not_exist___' })).rejects.toThrow(/valid:/);
    try {
      await uc.execute({ eyesId: '___not_exist___' });
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e);
      if (list.length > 0) {
        // at least some known id should be included in message
        expect(msg).toMatch(new RegExp(list[0]!));
      } else {
        expect(msg).toMatch(/valid:/);
      }
    }
  });
});

describe('SetAccentHue', () => {
  it('normalizes hue to 0..1 and sends numeric value', async () => {
    const osc = new FakeOscSender();
    const uc = new SetAccentHue(osc as any);
    await uc.execute({ hue: 180 });
    const entry = osc.numbers.find((n) => n.address === '/virtualbot/accent/hue');
    expect(entry).toBeTruthy();
    expect(entry?.values[0]).toBeCloseTo(0.5);
  });
});
