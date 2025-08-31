import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadOscTargetFromEnv } from '../gateway/OscSender.ts';

const OLD_ENV = { ...process.env };

describe('loadOscTargetFromEnv', () => {
  beforeEach(() => {
    process.env = { ...OLD_ENV };
    delete process.env['RESONITE_OSC_HOST'];
    delete process.env['RESONITE_OSC_PORT'];
    delete process.env['RESONITE_OSC_ADDRESS'];
  });

  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  it('returns defaults when env is not set', () => {
    const t = loadOscTargetFromEnv();
    expect(t.host).toBe('127.0.0.1');
    expect(t.port).toBe(9000);
    expect(t.address).toBe('/resobot/text');
  });

  it('parses valid env values', () => {
    process.env['RESONITE_OSC_HOST'] = '192.168.0.10';
    process.env['RESONITE_OSC_PORT'] = '7000';
    process.env['RESONITE_OSC_ADDRESS'] = '/bot/say';
    const t = loadOscTargetFromEnv();
    expect(t.host).toBe('192.168.0.10');
    expect(t.port).toBe(7000);
    expect(t.address).toBe('/bot/say');
  });

  it('throws on invalid port', () => {
    process.env['RESONITE_OSC_PORT'] = 'abc';
    expect(() => loadOscTargetFromEnv()).toThrow();
  });
});
