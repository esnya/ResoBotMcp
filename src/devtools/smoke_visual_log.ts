import 'dotenv/config';
import { VisualLogSession } from '../usecases/VisualLogSession.js';
import { loadAppConfigFromEnv } from '../server/config.js';
import path from 'node:path';
import { promises as fs } from 'node:fs';

async function main(): Promise<void> {
  const app = loadAppConfigFromEnv();
  const cfg = {
    dir: app.visualLog.dir,
    flushMs: Math.min(200, app.visualLog.flushMs),
    textCoalesceMs: app.visualLog.textCoalesceMs,
  } as const;

  const session = new VisualLogSession(cfg);
  await session.init();

  // Seed a path (rectangle) in X/Z plane with heading changes, offset so
  // points do not sit exactly on origin or axes but still straddle them.
  let x = -1.08,
    y = 0,
    z = -0.72,
    heading = 0,
    pitch = 0;
  const segments: Array<{ dx: number; dz: number; steps: number; heading: number }> = [
    { dx: 0.24, dz: 0, steps: 12, heading: 90 }, // +X (avoid 0 crossing at integer steps)
    { dx: 0, dz: 0.22, steps: 10, heading: 0 }, // +Z (avoid exact 0)
    { dx: -0.24, dz: 0, steps: 12, heading: 270 }, // -X
    { dx: 0, dz: -0.22, steps: 10, heading: 180 }, // -Z
  ];

  // Simulate typing that coalesces into a single text event.
  const text = 'Hello Resonite world!';
  for (let i = 1; i <= text.length; i++) {
    session.recordText(text.slice(0, i));
  }

  // Tool names to sprinkle along the route.
  const toolNames = [
    'set_expression',
    'set_accent_hue',
    'set_lamp',
    'move_relative',
    'turn_relative',
    'get_pose',
    'arm_grab',
    'arm_release',
    'get_arm_contact',
    'reset',
  ];

  const tinyPngDataUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAIElEQVR42mP8/5+hP4YGBgZGRkYwMjICGJAAZxgSGRCMBwAAqF0q6gC0fW4AAAAASUVORK5CYII='; // 10x10 png

  let tIndex = 0;
  for (const seg of segments) {
    heading = seg.heading;
    for (let i = 0; i < seg.steps; i++) {
      x += seg.dx;
      z += seg.dz;
      // add slight pitch variation for readability
      pitch = Math.sin((tIndex / 8) * Math.PI) * 5;
      session.recordPose({ x, y, z, heading, pitch });

      // Every 3rd step, add a tool event anchored to current pose
      if (tIndex % 3 === 0) {
        const name = toolNames[tIndex % toolNames.length] ?? 'ping';
        const ok = (tIndex / 3) % 5 !== 4; // make every 5th event an error
        const base: { name: string; args: Record<string, unknown>; ok: boolean } & Partial<{
          text: string;
          image: { dataUrl: string; mimeType: string };
          structured: unknown;
          error: string;
        }> = {
          name,
          args: { sample: 'value', index: tIndex },
          ok,
        };
        if (ok) {
          base.text = 'ok';
          base.structured = { index: tIndex, flag: true };
        } else {
          base.error = 'simulated failure';
        }
        // Add images for variety (first and mid sequence)
        if (tIndex === 0 || tIndex === 15) {
          base.image = { dataUrl: tinyPngDataUrl, mimeType: 'image/png' };
        }
        session.recordTool(base);
      }
      tIndex++;
    }
  }

  // Force a visible cluster: emit several tool events at the exact same pose.
  // This validates that cluster labels show counts while circles are suppressed.
  for (let k = 0; k < 8; k++) {
    const ok = k % 4 !== 3; // include a couple of errors
    const ev: { name: string; args: Record<string, unknown>; ok: boolean } & Partial<{
      text: string;
      image: { dataUrl: string; mimeType: string };
      structured: unknown;
      error: string;
    }> = { name: 'get_pose', args: { cluster: true, k }, ok };
    if (ok) {
      ev.text = 'ok';
      ev.structured = { k };
    } else {
      ev.error = 'simulated failure';
    }
    if (k === 0) ev.image = { dataUrl: tinyPngDataUrl, mimeType: 'image/png' };
    session.recordTool(ev);
  }

  await session.close();

  // Find the latest session HTML and print its absolute path.
  const dirAbs = path.resolve(cfg.dir);
  try {
    const entries = await fs.readdir(dirAbs, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((e) => e.isFile() && /^session-\d{8}-\d{6}\.html$/.test(e.name))
        .map(async (e) => {
          const fp = path.join(dirAbs, e.name);
          const st = await fs.stat(fp);
          return { path: fp, mtimeMs: st.mtimeMs };
        }),
    );
    files.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const latest = files[0]?.path ?? path.join(dirAbs, '(unknown)');
    console.log(`VisualLog written: ${latest}`);
  } catch {
    console.log(`VisualLog directory prepared: ${dirAbs}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
