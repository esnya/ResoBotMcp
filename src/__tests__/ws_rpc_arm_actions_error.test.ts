import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import WebSocket from 'ws';
import { FlatKV } from '../gateway/FlatKV.ts';
import { WebSocketRpcServer, RpcError } from '../gateway/WebSocketRpc.ts';

function getFreePort(start = 19000, end = 20000): number {
  // Not truly race-free, but good enough for unit tests in this repo.
  const port = Math.floor(Math.random() * (end - start)) + start;
  return port;
}

describe('WS RPC - Arm Actions (error paths)', () => {
  describe('with ws server and a client', () => {
    let port: number;
    let server: WebSocketRpcServer;
    let client: WebSocket;

    beforeEach(async () => {
      port = getFreePort();
      server = new WebSocketRpcServer({ port });
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

    it('rejects with RpcError when client responds status=error (arm_grab)', async () => {
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
      // Intentionally no response to simulate timeout
      await expect(
        server.request('arm_release', {}, { timeoutMs: 150, connectTimeoutMs: 150 }),
      ).rejects.toThrow('request timeout');
    });

    // arm-specific tests only in this suite
  });

  // No-client transport errors are covered in ws_rpc_transport_error.test.ts
});
