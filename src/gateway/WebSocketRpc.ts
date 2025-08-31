import { WebSocketServer, WebSocket } from 'ws';
import {
  FlatKV,
  FlatRecord,
  parseRequest,
  parseResponse,
  buildResponseOk,
  buildResponseError,
} from './FlatKV.js';
import { z } from 'zod';
import { scoped } from '../logging.js';

const log = scoped('ws-rpc');

export const WebSocketConfigSchema = z.object({
  port: z.number().int().min(1).max(65535).default(8765),
});
export type WebSocketConfig = z.infer<typeof WebSocketConfigSchema>;

export type RpcHandler = (
  args: Record<string, string>,
) => Promise<Record<string, string>> | Record<string, string>;

export class WebSocketRpcServer {
  private readonly wss: WebSocketServer;
  private readonly handlers = new Map<string, RpcHandler>();
  private readonly clients = new Set<WebSocket>();
  private readonly connectionWaiters: Array<(ws: WebSocket) => void> = [];
  private readonly pending = new Map<
    string,
    {
      resolve: (r: Record<string, string>) => void;
      reject: (e: Error) => void;
      timer?: ReturnType<typeof setTimeout>;
    }
  >();

  constructor(private readonly config: WebSocketConfig) {
    this.wss = new WebSocketServer({ port: config.port });
    this.wss.on('connection', (ws) => this.onConnection(ws));
    log.info({ port: config.port }, 'WebSocket RPC listening');
  }

  register(method: string, handler: RpcHandler): void {
    this.handlers.set(method, handler);
  }

  close(): void {
    this.wss.close();
  }

  private onConnection(ws: WebSocket): void {
    log.info('client connected');
    this.clients.add(ws);
    // Notify waiters for first client connection
    while (this.connectionWaiters.length > 0) {
      const fn = this.connectionWaiters.shift();
      try {
        fn && fn(ws);
      } catch {
        // ignore
      }
    }
    ws.on('close', () => {
      this.clients.delete(ws);
      log.info('client disconnected');
    });
    ws.on('message', async (data: WebSocket.RawData) => {
      // Accept both text and binary frames; coerce to UTF-8 string
      let text: string;
      if (typeof data === 'string' || data instanceof String) {
        text = String(data);
      } else if (Array.isArray(data)) {
        // Node ws can deliver an array of Buffers
        const buf = Buffer.concat(data as Buffer[]);
        text = buf.toString('utf8');
      } else if (data instanceof Buffer) {
        text = (data as Buffer).toString('utf8');
      } else if (data instanceof ArrayBuffer) {
        text = Buffer.from(data as ArrayBuffer).toString('utf8');
      } else {
        log.warn('unsupported WS frame type; ignoring');
        return;
      }
      let record: FlatRecord;
      try {
        record = FlatKV.decode(text);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'decode error';
        log.warn({ err: e }, 'failed to decode FlatKV');
        ws.send(FlatKV.encode({ type: 'response', id: '', status: 'error', message }));
        return;
      }
      const type = record['type'];
      if (type === 'response') {
        try {
          const res = parseResponse(record);
          const entry = this.pending.get(res.id);
          if (!entry) return;
          this.pending.delete(res.id);
          if (entry.timer) clearTimeout(entry.timer);
          if (res.status === 'ok') entry.resolve(res.result);
          else entry.reject(new Error(res.message));
        } catch {
          log.warn('invalid response ignored');
        }
        return;
      }
      let req;
      try {
        req = parseRequest(record);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'invalid request';
        const id = record['id'] ?? '';
        log.warn({ err: e, id }, 'invalid request');
        ws.send(FlatKV.encode({ type: 'response', id, status: 'error', message }));
        return;
      }
      log.debug({ id: req.id, method: req.method }, 'request received');
      const handler = this.handlers.get(req.method);
      if (!handler) {
        const resp = buildResponseError({
          id: req.id,
          status: 'error',
          message: 'method not implemented',
        });
        log.warn({ id: req.id, method: req.method }, 'method not implemented');
        ws.send(FlatKV.encode(resp));
        return;
      }
      try {
        const result = await handler(req.args);
        const resp = buildResponseOk({ id: req.id, status: 'ok', result });
        log.debug({ id: req.id, method: req.method }, 'response ok');
        ws.send(FlatKV.encode(resp));
      } catch (e) {
        const message = e instanceof Error ? e.message : 'internal error';
        const resp = buildResponseError({ id: req.id, status: 'error', message });
        log.error({ err: e, id: req.id, method: req.method }, 'handler error');
        ws.send(FlatKV.encode(resp));
      }
    });
  }

  async request(
    method: string,
    args: Record<string, string>,
    options?: { timeoutMs?: number; connectTimeoutMs?: number },
  ): Promise<Record<string, string>> {
    let ws = this.clients.values().next().value as WebSocket | undefined;
    if (!ws) {
      // Wait briefly for a client to connect
      const connectTimeout = options?.connectTimeoutMs ?? 3000;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('no Resonite client connected')), connectTimeout);
        this.connectionWaiters.push((_ws) => {
          clearTimeout(timer);
          resolve();
        });
      });
      ws = this.clients.values().next().value as WebSocket | undefined;
      if (!ws) throw new Error('no Resonite client connected');
    }
    const id = Math.random().toString(36).slice(2, 10);
    const record: FlatRecord = { type: 'request', id, method };
    // New format: put args at top-level (no 'argument.' prefix)
    for (const [k, v] of Object.entries(args)) record[k] = v;
    const text = FlatKV.encode(record);
    const timeoutMs = options?.timeoutMs ?? 10000;
    return await new Promise<Record<string, string>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('request timeout'));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      log.debug({ id, method }, 'sending request');
      ws.send(text);
    });
  }
}

export function wsConfigFromEnv(): WebSocketConfig {
  const port = Number(process.env['RESONITE_WS_PORT'] ?? '8765');
  return WebSocketConfigSchema.parse({ port });
}
