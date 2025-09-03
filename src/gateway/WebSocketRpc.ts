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

export class RpcError extends Error {
  constructor(
    message: string,
    public readonly raw: string,
    public readonly id: string,
  ) {
    super(message);
    this.name = 'RpcError';
  }
}

export const WebSocketConfigSchema = z.object({
  port: z.number().int().min(1).max(65535).default(8765),
  keepAliveIntervalMs: z.number().int().min(0).default(60_000),
  keepAliveTimeoutMs: z.number().int().min(0).default(86_400_000),
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
  private readonly lastPong = new WeakMap<WebSocket, number>();
  private keepAliveTimer?: ReturnType<typeof setInterval>;
  private readonly pending = new Map<
    string,
    {
      resolve: (r: { record: Record<string, string>; flat: FlatRecord; raw: string }) => void;
      reject: (e: Error) => void;
      timer?: ReturnType<typeof setTimeout>;
    }
  >();

  constructor(private readonly config: WebSocketConfig) {
    this.wss = new WebSocketServer({ port: config.port });
    this.wss.on('connection', (ws) => this.onConnection(ws));
    log.info({ port: config.port }, 'WebSocket RPC listening');
    const { keepAliveIntervalMs } = this.config;
    if (keepAliveIntervalMs > 0) {
      this.keepAliveTimer = setInterval(() => this.tickKeepAlive(), keepAliveIntervalMs);
    }
  }

  register(method: string, handler: RpcHandler): void {
    this.handlers.set(method, handler);
  }

  close(): void {
    try {
      if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
      for (const ws of this.clients) {
        try {
          ws.terminate();
        } catch {
          /* noop */
        }
      }
      this.clients.clear();
      for (const [id, entry] of this.pending) {
        try {
          if (entry.timer) clearTimeout(entry.timer);
          entry.reject(new Error('server closed'));
        } catch {
          /* noop */
        }
        this.pending.delete(id);
      }
    } finally {
      try {
        this.wss.close();
      } catch {
        /* noop */
      }
    }
  }

  async waitForConnection(timeoutMs: number = 15000): Promise<void> {
    const existing = this.clients.values().next().value as WebSocket | undefined;
    if (existing) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no Resonite client connected')), timeoutMs);
      this.connectionWaiters.push((_ws) => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private onConnection(ws: WebSocket): void {
    log.info('client connected');
    this.clients.add(ws);
    this.lastPong.set(ws, Date.now());
    while (this.connectionWaiters.length > 0) {
      const fn = this.connectionWaiters.shift();
      try {
        fn && fn(ws);
      } catch {
        /* noop */
      }
    }
    ws.on('close', () => {
      this.clients.delete(ws);
      try {
        this.lastPong.delete(ws);
      } catch {
        /* noop */
      }
      log.info('client disconnected');
    });
    ws.on('pong', () => {
      this.lastPong.set(ws, Date.now());
    });
    ws.on('message', async (data: WebSocket.RawData) => {
      let text: string;
      if (typeof data === 'string' || data instanceof String) {
        text = String(data);
      } else if (Array.isArray(data)) {
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
          if (res.status === 'ok') entry.resolve({ record: res.result, flat: record, raw: text });
          else entry.reject(new RpcError(res.message, text, res.id));
        } catch (e) {
          const reason = e instanceof Error ? e.message : 'parse error';
          const preview = {
            type: record['type'],
            id: record['id'],
            status: record['status'],
            message: record['message'],
          } as const;
          const keys = Object.keys(record).slice(0, 16);
          log.warn({ reason, preview, keys, raw: text }, 'invalid response ignored');
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

  private tickKeepAlive(): void {
    const now = Date.now();
    const timeout = this.config.keepAliveTimeoutMs;
    for (const ws of this.clients) {
      const last = this.lastPong.get(ws) ?? 0;
      if (timeout > 0 && last > 0 && now - last > timeout) {
        try {
          ws.terminate();
        } catch {
          /* noop */
        }
        this.clients.delete(ws);
        continue;
      }
      try {
        ws.ping();
      } catch {
        /* noop */
      }
    }
  }

  async request(
    method: string,
    args: Record<string, string>,
    options?: { timeoutMs?: number; connectTimeoutMs?: number },
  ): Promise<Record<string, string>> {
    const { record } = await this.requestWithRaw(method, args, options);
    return record;
  }

  async requestWithRaw(
    method: string,
    args: Record<string, string>,
    options?: { timeoutMs?: number; connectTimeoutMs?: number },
  ): Promise<{ record: Record<string, string>; flat: FlatRecord; raw: string }> {
    let ws = this.clients.values().next().value as WebSocket | undefined;
    if (!ws) {
      const connectTimeout = options?.connectTimeoutMs ?? 15000;
      if (connectTimeout > 0) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error('no Resonite client connected')),
            connectTimeout,
          );
          this.connectionWaiters.push((_ws) => {
            clearTimeout(timer);
            resolve();
          });
        });
        ws = this.clients.values().next().value as WebSocket | undefined;
      }
      if (!ws) throw new Error('no Resonite client connected');
    }
    const id = Math.random().toString(36).slice(2, 10);
    const frame: FlatRecord = { type: 'request', id, method };
    for (const [k, v] of Object.entries(args)) frame[k] = v;
    const text = FlatKV.encode(frame);
    const timeoutMs = options?.timeoutMs ?? 15000;
    return await new Promise<{ record: Record<string, string>; flat: FlatRecord; raw: string }>(
      (resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(id);
          reject(new Error('request timeout'));
        }, timeoutMs);
        this.pending.set(id, { resolve, reject, timer });
        log.debug({ id, method }, 'sending request');
        ws.send(text);
      },
    );
  }
}

export function wsConfigFromEnv(): WebSocketConfig {
  const port = Number(process.env['RESONITE_WS_PORT'] ?? '8765');
  const keepAliveIntervalMs = Number(process.env['RESONITE_WS_KEEPALIVE_INTERVAL_MS'] ?? '60000');
  const keepAliveTimeoutMs = Number(process.env['RESONITE_WS_KEEPALIVE_TIMEOUT_MS'] ?? '86400000');
  return WebSocketConfigSchema.parse({ port, keepAliveIntervalMs, keepAliveTimeoutMs });
}
