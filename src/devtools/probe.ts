import { loadOscTargetFromEnv, OscSender } from '../gateway/OscSender.js';
import { wsConfigFromEnv, WebSocketRpcServer } from '../gateway/WebSocketRpc.js';
import { SetExpression } from '../usecases/SetExpression.js';
import { SetAccentHue } from '../usecases/SetAccentHue.js';
import { z } from 'zod';

type Command =
  | { kind: 'ws:ping'; text: string }
  | { kind: 'osc:set-expression'; eyesId?: string; mouthId?: string }
  | { kind: 'osc:set-accent-hue'; hue: number }
  | { kind: 'osc:pose'; x: number; y: number; z: number; heading: number; pitch: number }
  | { kind: 'osc:expression-seq'; delayMs: number };

function parseArgs(argv: string[]): Command {
  const [cmd, ...rest] = argv;
  const kv: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (!token) continue;
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = rest[i + 1];
      const val = next && !next.startsWith('--') ? (i++, next) : 'true';
      kv[key] = val;
    }
  }
  switch (cmd) {
    case 'ws:ping':
    case 'ws-ping': {
      const text = kv['text'] ?? 'hello';
      return { kind: 'ws:ping', text };
    }
    case 'osc:set-expression':
    case 'set-expression': {
      const eyesId = kv['eyesId'];
      const mouthId = kv['mouthId'];
      const cmd: { kind: 'osc:set-expression'; eyesId?: string; mouthId?: string } = {
        kind: 'osc:set-expression',
      };
      if (eyesId) cmd.eyesId = eyesId;
      if (mouthId) cmd.mouthId = mouthId;
      return cmd;
    }
    case 'osc:set-accent-hue':
    case 'set-accent-hue': {
      const hue = Number(kv['hue']);
      if (!Number.isFinite(hue)) throw new Error('hue is required');
      return { kind: 'osc:set-accent-hue', hue };
    }
    case 'osc:expression-seq':
    case 'expression-seq':
    case 'expressions': {
      const delayMs = Number(kv['delayMs'] ?? '300');
      return { kind: 'osc:expression-seq', delayMs: Number.isFinite(delayMs) ? delayMs : 300 };
    }
    case 'osc:pose':
    case 'pose': {
      const x = Number(kv['x'] ?? '0');
      const y = Number(kv['y'] ?? '0');
      const z = Number(kv['z'] ?? '0');
      const heading = Number(kv['heading'] ?? '0');
      const pitch = Number(kv['pitch'] ?? '0');
      return { kind: 'osc:pose', x, y, z, heading, pitch };
    }
    default:
      throw new Error(
        'usage: probe <ws:ping|osc:set-expression|osc:set-accent-hue|osc:expression-seq> [--text|--eyesId|--mouthId|--hue|--delayMs]',
      );
  }
}

async function main(): Promise<void> {
  const cmd = parseArgs(process.argv.slice(2));
  if (cmd.kind === 'ws:ping') {
    const cfg = wsConfigFromEnv();
    const server = new WebSocketRpcServer(cfg);
    try {
      const res = await server.request('ping', { text: cmd.text }, { timeoutMs: 5000 });
      const parsed = z.object({ text: z.string() }).parse(res);
      console.log(parsed.text);
    } finally {
      server.close();
    }
    return;
  }
  const oscSender = new OscSender(loadOscTargetFromEnv());
  try {
    if (cmd.kind === 'osc:expression-seq') {
      const uc = new SetExpression(oscSender);
      const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
      const steps: Array<{ eyesId?: string; mouthId?: string }> = [
        { eyesId: 'winkL', mouthId: 'smile_big' },
        { eyesId: 'sparkle', mouthId: 'smile_big' },
        { eyesId: 'surprised', mouthId: 'line' },
        { eyesId: 'closed', mouthId: 'line' },
        // end with neutral (mouth uses 'line' as neutral equivalent)
        { eyesId: 'neutral', mouthId: 'line' },
      ];
      for (const s of steps) {
        await uc.execute(s);
        await sleep(cmd.delayMs);
      }
      console.log('sequence delivered');
      return;
    }
    if (cmd.kind === 'osc:pose') {
      const host = process.env['RESONITE_OSC_LISTEN_HOST'] ?? '127.0.0.1';
      const port = Number(process.env['RESONITE_OSC_LISTEN_PORT'] ?? '9010');
      const ingress = new OscSender({ host, port, address: '/virtualbot/position' });
      await ingress.sendNumbers('/virtualbot/position', cmd.x, cmd.y, cmd.z);
      await ingress.sendNumbers('/virtualbot/rotation', cmd.heading, cmd.pitch);
      ingress.close();
      console.log('pose delivered');
      return;
    }
    if (cmd.kind === 'osc:set-expression') {
      const uc = new SetExpression(oscSender);
      await uc.execute({ eyesId: cmd.eyesId, mouthId: cmd.mouthId });
      console.log('delivered');
      return;
    }
    if (cmd.kind === 'osc:set-accent-hue') {
      const uc = new SetAccentHue(oscSender);
      await uc.execute({ hue: cmd.hue });
      console.log('delivered');
      return;
    }
  } finally {
    oscSender.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
import 'dotenv/config';
