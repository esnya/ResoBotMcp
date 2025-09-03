# Configuration Pattern

This repository uses a consistent configuration pattern to ensure clarity, safety, and portability.

- Each constructor accepts a single `Config` object.
- `Config` is JSON-serializable and validated with zod.
- Provide `fromEnv()` helpers to parse and validate external input at the boundary.

Explicit over defaults: Prefer no implicit defaults. Require explicit configuration at boundaries. When a default is unavoidable for operability, keep it centralized in code and make it clearly opt‑in. Do not duplicate default values in docs. See:

- Aggregated app config (env → typed): `src/server/config.ts`
- OSC egress target: `src/gateway/OscSender.ts`
- WebSocket RPC: `src/gateway/WebSocketRpc.ts`
- OSC ingress: `src/gateway/OscReceiver.ts`
- Local asset path: `src/usecases/ReadLocalAsset.ts`

Notes

- OSC text address is fixed in code to `/resobot/text`.
- Avoid comments in config; let names and types carry intent. Use doc comments only when unavoidable.
