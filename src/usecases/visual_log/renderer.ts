import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Mustache from 'mustache';
import { jsonForScript } from '../html.js';
import type { AnyEvent } from './types.js';

let TEMPLATE_CACHE: string | undefined;

export async function loadTemplate(): Promise<string> {
  if (TEMPLATE_CACHE) return TEMPLATE_CACHE;
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const path = resolve(__dirname, '../../assets/visual_log_template.html');
  const buf = await fs.readFile(path, 'utf8');
  TEMPLATE_CACHE = buf;
  return buf;
}

export async function renderHtmlFromTemplate(title: string, events: AnyEvent[]): Promise<string> {
  const tpl = await loadTemplate();
  const view = { TITLE: title, DATA_JSON: jsonForScript(events) } as const;
  return Mustache.render(tpl, view);
}
