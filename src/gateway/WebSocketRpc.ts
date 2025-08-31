import { WebSocketServer, WebSocket } from 'ws';
import { FlatKV, FlatRecord, parseRequest, buildResponseOk, buildResponseError } from './FlatKV.js';
import { z } from 'zod';

export const WebSocketConfigSchema = z.object({
  port: z.number().int().min(1).max(65535).default(8765),
});
export type WebSocketConfig = z.infer<typeof WebSocketConfigSchema>;

export type RpcHandler = (args: Record<string, string>) => Promise<Record<string, string>>;

export class WebSocketRpcServer {
  private readonly wss: WebSocketServer;
  private readonly handlers = new Map<string, RpcHandler>();

  constructor(private readonly config: WebSocketConfig) {
    this.wss = new WebSocketServer({ port: config.port });
    this.wss.on('connection', (ws) => this.onConnection(ws));
  }

  register(method: string, handler: RpcHandler): void {
    this.handlers.set(method, handler);
  }

  close(): void {
    this.wss.close();
  }

  private onConnection(ws: WebSocket): void {
    ws.on('message', async (data: WebSocket.RawData) => {
      if (typeof data !== 'string' && !(data instanceof String)) {
        return;
      }
      const text = String(data);
      let record: FlatRecord;
      try {
        record = FlatKV.decode(text);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'decode error';
        ws.send(FlatKV.encode({ type: 'response', id: '', status: 'error', message }));
        return;
      }
      let req;
      try {
        req = parseRequest(record);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'invalid request';
        const id = record['id'] ?? '';
        ws.send(FlatKV.encode({ type: 'response', id, status: 'error', message }));
        return;
      }
      const handler = this.handlers.get(req.method);
      if (!handler) {
        const resp = buildResponseError({
          id: req.id,
          status: 'error',
          message: 'method not implemented',
        });
        ws.send(FlatKV.encode(resp));
        return;
      }
      try {
        const result = await handler(req.args);
        const resp = buildResponseOk({ id: req.id, status: 'ok', result });
        ws.send(FlatKV.encode(resp));
      } catch (e) {
        const message = e instanceof Error ? e.message : 'internal error';
        const resp = buildResponseError({ id: req.id, status: 'error', message });
        ws.send(FlatKV.encode(resp));
      }
    });
  }
}

export function wsConfigFromEnv(): WebSocketConfig {
  const port = Number(process.env['RESONITE_WS_PORT'] ?? '8765');
  return WebSocketConfigSchema.parse({ port });
}
