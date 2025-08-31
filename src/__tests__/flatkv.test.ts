import { describe, it, expect } from 'vitest';
import { FlatKV } from '../gateway/FlatKV.ts';

describe('FlatKV', () => {
  it('encodes and decodes simple pairs', () => {
    const rec = {
      type: 'request',
      id: 'abc123',
      method: 'bot.say',
      'argument.text': 'Hello world!',
    };
    const text = FlatKV.encode(rec);
    const back = FlatKV.decode(text);
    expect(back).toEqual(rec);
  });

  it('percent-encodes control chars and unicode', () => {
    const tricky = 'hi ' + String.fromCharCode(0x1f) + ' ' + '世界' + ' %';
    const rec = { 'argument.payload': tricky };
    const text = FlatKV.encode(rec);
    expect(text).not.toContain(String.fromCharCode(0x1f));
    expect(text).toContain('%');
    const back = FlatKV.decode(text);
    expect(back['argument.payload']).toBe(tricky);
  });
});
