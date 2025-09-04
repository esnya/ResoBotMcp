export type HtmlSafe = { __html: string };

export function raw(html: string): HtmlSafe {
  return { __html: html };
}

export function escapeHtml(value: unknown): string {
  const s = String(value);
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string);
}

/**
 * Minimal html tagged template: escapes all interpolations unless explicitly marked with raw().
 * Arrays are joined; falsy values (null/undefined/false) are omitted.
 */
export function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  let out = '';
  for (let i = 0; i < strings.length; i++) {
    out += strings[i] ?? '';
    if (i < values.length) {
      const v = values[i];
      if (v === null || v === undefined || v === false) continue;
      if (isHtmlSafe(v)) {
        out += v.__html;
      } else if (Array.isArray(v)) {
        out += v.map((x) => (isHtmlSafe(x) ? x.__html : escapeHtml(x))).join('');
      } else {
        out += escapeHtml(v);
      }
    }
  }
  return out;
}

function isHtmlSafe(v: unknown): v is HtmlSafe {
  if (typeof v !== 'object' || v === null) return false;
  const rec = v as Record<string, unknown>;
  return typeof rec['__html'] === 'string';
}

/**
 * Dedent and trim left-most indentation from a multi-line string.
 * Keeps content intact while removing TS-level indentation.
 */
export function dedent(input: string): string {
  const lines = input.replace(/\r\n?/g, '\n').split('\n');
  // Ignore first/last empty lines
  let start = 0;
  let end = lines.length;
  if (lines[0]?.trim() === '') start = 1;
  if (lines[end - 1]?.trim() === '') end -= 1;
  const slice = lines.slice(start, end);
  const indents = slice
    .filter((l) => l.trim().length > 0)
    .map((l) => l.match(/^\s*/)?.[0]?.length ?? 0);
  const min = indents.length ? Math.min(...indents) : 0;
  const out = slice.map((l) => (l.length >= min ? l.slice(min) : l)).join('\n');
  return out;
}

/**
 * Light whitespace minifier: collapse 2+ blank lines and trim indentation at line starts.
 * Intentionally conservative: does not parse HTML; safe for our usage.
 */
export function minifyWhitespace(s: string): string {
  return s
    .replace(/[\t ]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Safe JSON for <script type="application/json">: prevent accidental </script> termination.
 */
export function jsonForScript(data: unknown): string {
  return JSON.stringify(data).replace(/<\/script>/gi, '<\\/script>');
}
