import { Buffer } from 'node:buffer';

const US = String.fromCharCode(0x1f);
const GS = String.fromCharCode(0x1d);
const RS = String.fromCharCode(0x1e);

function needsEncodingByte(byte: number): boolean {
  if (
    byte === 0x25 /* % */ ||
    byte === 0x1f /* US */ ||
    byte === 0x1d /* GS */ ||
    byte === 0x1e /* RS */
  ) {
    return true;
  }
  return byte < 0x20 || byte > 0x7e;
}

function encodeValue(value: string): string {
  const utf8 = Buffer.from(value, 'utf8');
  let out = '';
  for (let i = 0; i < utf8.length; i++) {
    const b = utf8[i]!;
    if (needsEncodingByte(b)) {
      out += `%${b.toString(16).toUpperCase().padStart(2, '0')}`;
    } else {
      out += String.fromCharCode(b);
    }
  }
  return out;
}

function decodeValue(value: string): string {
  let bytes: number[] = [];
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]!;
    if (ch === '%') {
      const h1 = value[i + 1];
      const h2 = value[i + 2];
      if (!h1 || !h2) {
        throw new Error('Invalid percent-encoding');
      }
      const byte = Number.parseInt(h1 + h2, 16);
      if (Number.isNaN(byte)) {
        throw new Error('Invalid percent-encoding');
      }
      bytes.push(byte);
      i += 2;
    } else {
      bytes.push(ch.charCodeAt(0));
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

export type FlatRecord = Record<string, string>;

// ArrayValue helpers (C#-style): "[v0;v1;v2]"
export function encodeArray(values: Array<string | number>): string {
  return `[${values.map((v) => String(v)).join(';')}]`;
}

export function decodeArray(text: string): string[] {
  if (!text.startsWith('[') || !text.endsWith(']')) {
    throw new Error('invalid ArrayValue: missing brackets');
  }
  const inner = text.slice(1, -1);
  if (inner.length === 0) return [];
  return inner.split(';');
}

export const FlatKV = {
  pairSep: US,
  kvSep: GS,
  encode(record: FlatRecord): string {
    const pairs: string[] = [];
    for (const [key, raw] of Object.entries(record)) {
      pairs.push(`${key}${GS}${encodeValue(String(raw))}`);
    }
    const raw = pairs.join(US);
    // Transport-level: return URL-encoded frame so separators are safe over text transports
    return encodeURIComponent(raw);
  },
  decode(text: string): FlatRecord {
    const record: FlatRecord = {};
    if (text.length === 0) return record;
    // Transport-level: entire frame is URL-encoded; decode first
    const raw = decodeURIComponent(text);
    const pairs = raw.split(US);
    for (const pair of pairs) {
      if (pair.length === 0) continue;
      const idx = pair.indexOf(GS);
      if (idx <= 0) {
        continue;
      }
      const key = pair.slice(0, idx);
      const encVal = pair.slice(idx + 1);
      record[key] = decodeValue(encVal);
    }
    return record;
  },
  encodeValue,
  decodeValue,
  encodeArray,
  decodeArray,
  RS,
} as const;

export type RpcRequest = {
  id: string;
  method: string;
  args: Record<string, string>;
};

export type RpcResponseOk = {
  id: string;
  status: 'ok';
  result: Record<string, string>;
};

export type RpcResponseError = {
  id: string;
  status: 'error';
  message: string;
};

export function parseResponse(record: FlatRecord): RpcResponseOk | RpcResponseError {
  const type = record['type'];
  const id = record['id'] ?? '';
  const status = record['status'];
  if (type !== 'response') {
    throw new Error('not a response');
  }
  if (!id || id.length > 64) {
    throw new Error('invalid id');
  }
  if (status === 'ok') {
    const result: Record<string, string> = {};
    const reserved = new Set(['type', 'id', 'status', 'message', 'method']);
    // Prefer top-level keys (new format)
    for (const [k, v] of Object.entries(record)) {
      if (reserved.has(k)) continue;
      if (k.startsWith('result.')) continue; // handled below
      result[k] = v;
    }
    // Back-compat: also accept result.* keys
    for (const [k, v] of Object.entries(record)) {
      if (k.startsWith('result.')) {
        const kk = k.slice('result.'.length);
        if (!(kk in result)) result[kk] = v;
      }
    }
    return { id, status: 'ok', result };
  }
  if (status === 'error') {
    const message = record['message'] ?? 'error';
    return { id, status: 'error', message };
  }
  throw new Error('invalid response');
}

export function parseRequest(record: FlatRecord): RpcRequest {
  const type = record['type'];
  const id = record['id'];
  const method = record['method'];
  if (type !== 'request') {
    throw new Error('not a request');
  }
  if (!id || id.length > 64) {
    throw new Error('invalid id');
  }
  if (!method) {
    throw new Error('missing method');
  }
  const args: Record<string, string> = {};
  const reserved = new Set(['type', 'id', 'method', 'status', 'message']);
  // New format: top-level keys are arguments (excluding reserved)
  for (const [k, v] of Object.entries(record)) {
    if (reserved.has(k)) continue;
    if (k.startsWith('result.')) continue; // response-only
    if (k.startsWith('argument.')) continue; // handled below for back-compat
    args[k] = v;
  }
  // Back-compat: allow argument.*
  for (const [k, v] of Object.entries(record)) {
    if (k.startsWith('argument.')) {
      const kk = k.slice('argument.'.length);
      if (!(kk in args)) args[kk] = v;
    }
  }
  return { id, method, args };
}

export function buildResponseOk(res: RpcResponseOk): FlatRecord {
  const out: FlatRecord = { type: 'response', id: res.id, status: 'ok' };
  for (const [k, v] of Object.entries(res.result)) {
    out[k] = v;
  }
  return out;
}

export function buildResponseError(res: RpcResponseError): FlatRecord {
  const out: FlatRecord = { type: 'response', id: res.id, status: 'error', message: res.message };
  return out;
}
