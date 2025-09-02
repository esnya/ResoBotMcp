import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import WebSocket from 'ws';
import { FlatKV } from '../gateway/FlatKV.ts';
import { WebSocketRpcServer, RpcError } from '../gateway/WebSocketRpc.ts';

function getFreePort(start = 19000, end = 20000): number {
  // Not truly race-free, but good enough for unit tests in this repo.
  const port = Math.floor(Math.random() * (end - start)) + start;
  return port;
}

describe('WebSocket RPC error paths for arm_*', () => {
  let servers: WebSocketRpcServer[] = [];
  let clients: WebSocket[] = [];

  const trackServer = (s: WebSocketRpcServer): WebSocketRpcServer => {
    servers.push(s);
    return s;
  };
  const trackClient = (c: WebSocket): WebSocket => {
    clients.push(c);
    return c;
  };

  beforeEach(() => {
    servers = [];
    clients = [];
  });

  afterEach(() => {
    for (const c of clients) {
      try {
        c.close();
      } catch (e) {
        void e;
      }
    }
    for (const s of servers) {
      try {
        s.close();
      } catch (e) {
        void e;
      }
    }
  });

  it('rejects with RpcError when client responds status=error (arm_grab)', async () => {
    const port = getFreePort();
    const server = trackServer(new WebSocketRpcServer({ port }));
    const client = trackClient(new WebSocket(`ws://127.0.0.1:${port}`));
    await new Promise<void>((resolve, reject) => {
      client.once('open', () => resolve());
      client.once('error', (e) => reject(e));
    });

    client.on('message', (raw) => {
      const text = typeof raw === 'string' ? raw : raw.toString();
      const rec = FlatKV.decode(text);
      if (rec['type'] === 'request') {
        const id = rec['id'] ?? '';
        const method = rec['method'] ?? '';
        if (method === 'arm_grab') {
          const frame = FlatKV.encode({
            type: 'response',
            id,
            status: 'error',
            message: 'no free hand',
          });
          client.send(frame);
        }
      }
    });

    await expect(
      server.request('arm_grab', {}, { timeoutMs: 1000, connectTimeoutMs: 500 }),
    ).rejects.toBeInstanceOf(RpcError);

    await server
      .request('arm_grab', {}, { timeoutMs: 1000, connectTimeoutMs: 500 })
      .then(() => {
        throw new Error('unexpected success');
      })
      .catch((e) => {
        const err = e as RpcError;
        expect(err).toBeInstanceOf(RpcError);
        expect(err.message).toContain('no free hand');
        expect(typeof err.raw).toBe('string');
        expect(err.raw).toContain('status');
      });
  });

  it('times out if client does not respond (arm_release)', async () => {
    const port = getFreePort();
    const server = trackServer(new WebSocketRpcServer({ port }));
    const client = trackClient(new WebSocket(`ws://127.0.0.1:${port}`));
    await new Promise<void>((resolve, reject) => {
      client.once('open', () => resolve());
      client.once('error', (e) => reject(e));
    });

    // No response handler registered: server will time out waiting
    await expect(
      server.request('arm_release', {}, { timeoutMs: 150, connectTimeoutMs: 150 }),
    ).rejects.toThrow('request timeout');
  });

  it('errors immediately when no client is connected (connect timeout)', async () => {
    const port = getFreePort();
    const server = trackServer(new WebSocketRpcServer({ port }));
    await expect(
      server.request('arm_grab', {}, { timeoutMs: 500, connectTimeoutMs: 50 }),
    ).rejects.toThrow('no Resonite client connected');
  });

  it('ignores wrong id response and then times out', async () => {
    const port = getFreePort();
    const server = trackServer(new WebSocketRpcServer({ port }));
    const client = trackClient(new WebSocket(`ws://127.0.0.1:${port}`));
    await new Promise<void>((resolve, reject) => {
      client.once('open', () => resolve());
      client.once('error', (e) => reject(e));
    });

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
      server.request('arm_grab', {}, { timeoutMs: 150, connectTimeoutMs: 150 }),
    ).rejects.toThrow('request timeout');
  });

  it('rejects with "server closed" when server is closed mid-flight', async () => {
    const port = getFreePort();
    const server = trackServer(new WebSocketRpcServer({ port }));
    const client = trackClient(new WebSocket(`ws://127.0.0.1:${port}`));
    await new Promise<void>((resolve, reject) => {
      client.once('open', () => resolve());
      client.once('error', (e) => reject(e));
    });
    // When request arrives, immediately close the server before any response
    client.on('message', () => {
      server.close();
    });
    await expect(
      server.request('arm_grab', {}, { timeoutMs: 1000, connectTimeoutMs: 200 }),
    ).rejects.toThrow('server closed');
  });

  it('times out when connection drops before responding', async () => {
    const port = getFreePort();
    const server = trackServer(new WebSocketRpcServer({ port }));
    const client = trackClient(new WebSocket(`ws://127.0.0.1:${port}`));
    await new Promise<void>((resolve, reject) => {
      client.once('open', () => resolve());
      client.once('error', (e) => reject(e));
    });
    // Drop connection as soon as we receive the request
    client.on('message', () => {
      try {
        client.terminate();
      } catch (e) {
        void e;
      }
    });
    await expect(
      server.request('arm_release', {}, { timeoutMs: 150, connectTimeoutMs: 150 }),
    ).rejects.toThrow('request timeout');
  });
});
