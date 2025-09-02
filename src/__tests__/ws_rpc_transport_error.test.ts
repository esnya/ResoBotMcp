import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import WebSocket from 'ws';
import { FlatKV } from '../gateway/FlatKV.ts';
import { WebSocketRpcServer } from '../gateway/WebSocketRpc.ts';

function getFreePort(start = 19000, end = 20000): number {
  const port = Math.floor(Math.random() * (end - start)) + start;
  return port;
}

describe('WS RPC - Transport/Error Semantics', () => {
  describe('with ws server and a client', () => {
    let port: number;
    let server: WebSocketRpcServer;
    let client: WebSocket;

    beforeEach(async () => {
      port = getFreePort();
      server = new WebSocketRpcServer({ port, keepAliveIntervalMs: 0, keepAliveTimeoutMs: 0 });
      client = new WebSocket(`ws://127.0.0.1:${port}`);
      await new Promise<void>((resolve, reject) => {
        client.once('open', () => resolve());
        client.once('error', (e) => reject(e));
      });
    });

    afterEach(() => {
      try {
        client.close();
      } catch (e) {
        void e;
      }
      try {
        server.close();
      } catch (e) {
        void e;
      }
    });

    it('ignores wrong id response and then times out', async () => {
      client.on('message', (raw) => {
        const text = typeof raw === 'string' ? raw : raw.toString();
        const rec = FlatKV.decode(text);
        if (rec['type'] === 'request') {
          const wrongId = 'mismatch123';
          const frame = FlatKV.encode({ type: 'response', id: wrongId, status: 'ok' });
          client.send(frame);
        }
      });

      await expect(
        server.request('ping', { text: '' }, { timeoutMs: 150, connectTimeoutMs: 150 }),
      ).rejects.toThrow('request timeout');
    });

    it('rejects with "server closed" when server is closed mid-flight', async () => {
      client.on('message', () => {
        server.close();
      });
      await expect(
        server.request('ping', { text: '' }, { timeoutMs: 1000, connectTimeoutMs: 200 }),
      ).rejects.toThrow('server closed');
    });

    it('times out when connection drops before responding', async () => {
      client.on('message', () => {
        try {
          client.terminate();
        } catch (e) {
          void e;
        }
      });
      await expect(
        server.request('ping', { text: '' }, { timeoutMs: 150, connectTimeoutMs: 150 }),
      ).rejects.toThrow('request timeout');
    });
  });

  describe('with ws server only (no client)', () => {
    let port: number;
    let server: WebSocketRpcServer;

    beforeEach(() => {
      port = getFreePort();
      server = new WebSocketRpcServer({ port, keepAliveIntervalMs: 0, keepAliveTimeoutMs: 0 });
    });
    afterEach(() => {
      try {
        server.close();
      } catch (e) {
        void e;
      }
    });

    it('errors immediately when no client is connected (connect timeout)', async () => {
      await expect(
        server.request('ping', { text: '' }, { timeoutMs: 500, connectTimeoutMs: 50 }),
      ).rejects.toThrow('no Resonite client connected');
    });
  });
});
