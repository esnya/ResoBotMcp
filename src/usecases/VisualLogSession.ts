import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { AnyEvent, PoseEvent, TextEvent, ToolEvent } from './visual_log/types.js';
import { renderHtmlFromTemplate } from './visual_log/renderer.js';

export type VisualLogConfig = {
  dir: string; // output directory (created if missing)
  flushMs: number; // debounce for disk writes
  textCoalesceMs: number; // coalesce successive set_text calls
};

function now(): number {
  return Date.now();
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function timestampBase(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const HH = pad2(d.getHours());
  const MM = pad2(d.getMinutes());
  const SS = pad2(d.getSeconds());
  return `${yyyy}${mm}${dd}-${HH}${MM}${SS}`;
}

// renderer and types are imported from ./visual_log

export class VisualLogSession {
  private cfg: VisualLogConfig;
  private events: AnyEvent[] = [];
  private filePath: string | undefined;
  private writeTimer: ReturnType<typeof setTimeout> | undefined;
  private currentText: TextEvent | undefined;
  private closed = false;
  private lastPose: { x: number; y: number; z: number; heading: number; pitch: number } | undefined;

  constructor(cfg: VisualLogConfig) {
    this.cfg = cfg;
  }

  async init(): Promise<void> {
    if (this.closed) return;
    const dir = this.cfg.dir;
    await fs.mkdir(dir, { recursive: true }).catch(() => {});
    const name = `session-${timestampBase(new Date())}.html`;
    this.filePath = join(dir, name);
    await this.flush();
  }

  recordPose(
    pose: { x: number; y: number; z: number; heading: number; pitch: number },
    t?: number,
  ): void {
    if (this.closed) return;
    const ts = typeof t === 'number' ? t : now();
    const ev: PoseEvent = {
      type: 'pose',
      t: ts,
      x: pose.x,
      y: pose.y,
      z: pose.z,
      heading: pose.heading,
      pitch: pose.pitch,
    };
    this.lastPose = { x: ev.x, y: ev.y, z: ev.z, heading: ev.heading, pitch: ev.pitch };
    this.events.push(ev);
    this.scheduleFlush();
  }

  recordText(text: string, t?: number): void {
    if (this.closed) return;
    // Prefix-overwrite stream: always overwrite the latest compatible text event.
    const ts = typeof t === 'number' ? t : now();
    let target = this.currentText;
    if (!target) {
      // Try to resume last committed text if prefix-compatible
      const last = this.findLastTextEvent();
      if (last && (text.startsWith(last.text) || last.text.startsWith(text))) {
        target = last;
      }
    }
    if (!target) {
      // Create new text event
      const ev = { type: 'text', t: ts, text } as TextEvent;
      if (this.lastPose)
        (
          ev as unknown as {
            pose?: { x: number; y: number; z: number; heading: number; pitch: number };
          }
        ).pose = { ...this.lastPose };
      this.events.push(ev);
      this.currentText = ev;
    } else {
      target.t = ts;
      target.text = text;
      if (this.lastPose)
        (
          target as unknown as {
            pose?: { x: number; y: number; z: number; heading: number; pitch: number };
          }
        ).pose = { ...this.lastPose };
      this.currentText = target;
    }
    this.scheduleFlush();
  }

  recordTool(event: Omit<ToolEvent, 'type' | 't'> & { t?: number }): void {
    if (this.closed) return;
    const ts = typeof event.t === 'number' ? event.t : now();
    const ev: ToolEvent = {
      type: 'tool',
      t: ts,
      name: event.name,
      args: event.args,
      ok: event.ok,
      // optional fields added below
    } as unknown as ToolEvent;
    if (typeof event.text === 'string') (ev as unknown as { text?: string }).text = event.text;
    if (event.image)
      (ev as unknown as { image?: { dataUrl: string; mimeType: string } }).image = event.image;
    if ('structured' in event && event.structured !== undefined)
      (ev as unknown as { structured?: unknown }).structured = event.structured;
    if (typeof event.error === 'string') (ev as unknown as { error?: string }).error = event.error;
    if (this.lastPose)
      (
        ev as unknown as {
          pose?: { x: number; y: number; z: number; heading: number; pitch: number };
        }
      ).pose = {
        ...this.lastPose,
      };
    this.events.push(ev);
    this.scheduleFlush();
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.writeTimer) clearTimeout(this.writeTimer);
    await this.flush();
  }

  // --- internals ---
  private scheduleFlush(): void {
    if (this.writeTimer) return;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = undefined;
      this.flush().catch(() => {});
    }, this.cfg.flushMs);
  }

  // No debounce/timeout finalization; stream stays as last updated text.

  private async flush(): Promise<void> {
    if (!this.filePath) return; // not yet initialized
    const title = this.filePath.split(/[/\\]/).pop() || 'visual-log';
    // Render from external template only (no fallback)
    const htmlStr = await renderHtmlFromTemplate(title, this.events);
    try {
      await fs.writeFile(this.filePath, htmlStr, 'utf8');
    } catch {
      void 0; // best-effort write; avoid impacting main flows
    }
  }

  private findLastTextEvent(): TextEvent | undefined {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i];
      if ((e as { type?: string }).type === 'text') return e as TextEvent;
    }
    return undefined;
  }
}

// VisualTextCoalescer removed: behavior handled inline in VisualLogSession
