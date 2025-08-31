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

export const FlatKV = {
  pairSep: US,
  kvSep: GS,
  encode(record: FlatRecord): string {
    const pairs: string[] = [];
    for (const [key, raw] of Object.entries(record)) {
      pairs.push(`${key}${GS}${encodeValue(String(raw))}`);
    }
    return pairs.join(US);
  },
  decode(text: string): FlatRecord {
    const record: FlatRecord = {};
    if (text.length === 0) return record;
    const pairs = text.split(US);
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
    for (const [k, v] of Object.entries(record)) {
      if (k.startsWith('result.')) {
        result[k.slice('result.'.length)] = v;
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
  for (const [k, v] of Object.entries(record)) {
    if (k.startsWith('argument.')) {
      args[k.slice('argument.'.length)] = v;
    }
  }
  return { id, method, args };
}

export function buildResponseOk(res: RpcResponseOk): FlatRecord {
  const out: FlatRecord = { type: 'response', id: res.id, status: 'ok' };
  for (const [k, v] of Object.entries(res.result)) {
    out[`result.${k}`] = v;
  }
  return out;
}

export function buildResponseError(res: RpcResponseError): FlatRecord {
  const out: FlatRecord = { type: 'response', id: res.id, status: 'error', message: res.message };
  return out;
}
