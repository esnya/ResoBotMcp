import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VisualLogSession } from '../usecases/VisualLogSession.js';

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('VisualLogSession', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vislog-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('coalesces rapid set_text calls into one event with latest text', async () => {
    const log = new VisualLogSession({ dir, flushMs: 50, textCoalesceMs: 50 });
    await log.init();
    log.recordText('hel');
    await wait(20);
    log.recordText('hello');
    await wait(120); // allow coalesce + flush to occur
    await log.close();

    const files = readdirSync(dir).filter((f) => f.startsWith('session-') && f.endsWith('.html'));
    expect(files.length).toBe(1);
    const html = readFileSync(join(dir, files[0]!), 'utf8');
    const match = html.match(
      /<script id="visual-log-data" type="application\/json">([\s\S]*?)<\/script>/,
    );
    expect(match).toBeTruthy();
    const events = JSON.parse(match![1]!) as Array<{ type: string; text?: string }>;
    const texts = events.filter((e) => e.type === 'text');
    expect(texts.length).toBe(1);
    expect(texts[0]!.text).toBe('hello');
  });

  it('records pose events and writes HTML', async () => {
    const log = new VisualLogSession({ dir, flushMs: 10, textCoalesceMs: 50 });
    await log.init();
    log.recordPose({ x: 0, y: 1, z: 2, heading: 30, pitch: -5 });
    await wait(30);
    await log.close();

    const files = readdirSync(dir).filter((f) => f.startsWith('session-') && f.endsWith('.html'));
    expect(files.length).toBe(1);
    const html = readFileSync(join(dir, files[0]!), 'utf8');
    expect(html).toContain('visual-log-data');
    expect(html).toContain('pose');
  });
});
