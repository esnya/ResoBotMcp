import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function projectDataPath(...segments: string[]): string {
  const here = path.dirname(fileURLToPath(new URL(import.meta.url)));
  return path.resolve(here, '../../data', ...segments);
}

function sanitizeId(id: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(id)) {
    throw new Error('invalid id');
  }
  return id;
}

export async function readExpressionPreset(kind: 'eyes' | 'mouth', id: string): Promise<string> {
  const safe = sanitizeId(id);
  const dir = kind === 'eyes' ? 'eyes_braille' : 'mouth_emote_braille';
  const base = kind === 'eyes' ? 'eyes_' : 'mouth_';
  const candidates = [safe.startsWith(base) ? safe : `${base}${safe}`, safe];

  for (const name of candidates) {
    const p = projectDataPath('braille', dir, `${name}.txt`);
    try {
      const buf = await readFile(p, 'utf8');
      return buf;
    } catch {
      // eslint-disable-next-line no-empty -- try next candidate; non-existent file is acceptable here
      {
      }
    }
  }
  const list = await listExpressionIds(kind);
  throw new Error(`preset not found: ${kind}:${id}; valid: ${list.join(',')}`);
}

export async function listExpressionIds(kind: 'eyes' | 'mouth'): Promise<string[]> {
  const dir = kind === 'eyes' ? 'eyes_braille' : 'mouth_emote_braille';
  const base = kind === 'eyes' ? 'eyes_' : 'mouth_';
  const p = projectDataPath('braille', dir);
  const files = await readdir(p);
  return files
    .filter((f) => f.endsWith('.txt') && f.startsWith(base))
    .map((f) => f.replace(/\.txt$/i, '').replace(new RegExp(`^${base}`), ''))
    .sort();
}
