# Configuration Pattern

This repository uses a consistent configuration pattern to ensure clarity, safety, and portability.

- Each constructor accepts a single `Config` object.
- `Config` is JSON-serializable and validated with zod.
- Provide `fromEnv()` helpers to parse and validate external input at the boundary.

Single source of truth: Defaults live in code. Do not duplicate default values in docs. See:

- OSC egress target: `src/gateway/OscSender.ts:80`
- WebSocket RPC: `src/gateway/WebSocketRpc.ts:184`
- OSC ingress: `src/gateway/OscReceiver.ts:37`
- Local asset path: `src/usecases/ReadLocalAsset.ts:37`

Notes
- OSC text address is fixed in code to `/resobot/text`.
- Avoid comments in config; let names and types carry intent. Use doc comments only when unavoidable.
