import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VisualLogSession } from '../usecases/VisualLogSession.js';

function wait(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

function extractEvents(html: string): any[] {
  const m = html.match(/<script id="visual-log-data" type="application\/json">([\s\S]*?)<\/script>/);
  expect(m).toBeTruthy();
  return JSON.parse(m![1]!);
}

describe('VisualLogSession tool events', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'vislog-tool-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('records tool success event with text/image/structured and pose copy', async () => {
    const log = new VisualLogSession({ dir, flushMs: 15, textCoalesceMs: 50 });
    await log.init();
    log.recordPose({ x: 1, y: 2, z: 3, heading: 10, pitch: -2 });
    log.recordTool({
      name: 'capture_camera',
      args: { w: 1 },
      ok: true,
      text: 'snapshot taken',
      image: { dataUrl: 'data:image/png;base64,AAAA', mimeType: 'image/png' },
      structured: { latencyMs: 12, quality: 'low' },
    });
    await wait(60);
    await log.close();
    const file = readdirSync(dir).find(f => f.endsWith('.html'))!;
    const html = readFileSync(join(dir, file), 'utf8');
    const events = extractEvents(html);
    const tool = events.find(e => e.type === 'tool' && e.name === 'capture_camera');
    expect(tool).toBeTruthy();
    expect(tool.ok).toBe(true);
    expect(tool.text).toBe('snapshot taken');
    expect(tool.image?.dataUrl).toBe('data:image/png;base64,AAAA');
    expect(tool.structured).toEqual({ latencyMs: 12, quality: 'low' });
    expect(tool.pose).toEqual({ x: 1, y: 2, z: 3, heading: 10, pitch: -2 });
  });

  it('records error tool event with error message and without image/text fields when absent', async () => {
    const log = new VisualLogSession({ dir, flushMs: 15, textCoalesceMs: 50 });
    await log.init();
    log.recordTool({ name: 'set_lamp', args: { on: true }, ok: false, error: 'hardware-failure' });
    await wait(50);
    await log.close();
    const file = readdirSync(dir).find(f => f.endsWith('.html'))!;
    const html = readFileSync(join(dir, file), 'utf8');
    const events = extractEvents(html);
    const tool = events.find(e => e.type === 'tool' && e.name === 'set_lamp');
    expect(tool).toBeTruthy();
    expect(tool.ok).toBe(false);
    expect(tool.error).toBe('hardware-failure');
    expect(tool).not.toHaveProperty('image');
    expect(tool).not.toHaveProperty('text');
  });

  it('preserves chronological order of pose then tool (no reordering)', async () => {
    const log = new VisualLogSession({ dir, flushMs: 15, textCoalesceMs: 50 });
    await log.init();
    log.recordPose({ x: 0, y: 0, z: 0, heading: 0, pitch: 0 });
    log.recordTool({ name: 'ping', ok: true });
    await wait(50);
    await log.close();
    const file = readdirSync(dir).find(f => f.endsWith('.html'))!;
    const html = readFileSync(join(dir, file), 'utf8');
    const events = extractEvents(html);
    const idxPose = events.findIndex(e => e.type === 'pose');
    const idxTool = events.findIndex(e => e.type === 'tool');
    expect(idxPose).toBeGreaterThanOrEqual(0);
    expect(idxTool).toBeGreaterThan(idxPose); // pose pushed before tool
  });
});
