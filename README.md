# ResoBot MCP

Minimal MCP (Model Context Protocol) stdio server that connects AI tools to a Resonite bot via OSC, with room to add WebSocket and HTTP bridges.

## Features

- MCP stdio server powered by `@modelcontextprotocol/sdk`
- Tool: `set_text` — send generic UTF-8 text over OSC
- Strong TypeScript config and strict linting/formatting
- Vitest test setup with coverage

## Quick Start

- Install: `npm i`
- Dev (stdio): `npm run dev`
- Start: `npm start` (tsx)
- Lint fix + format: `npm run fix`
- Check (format + lint + types): `npm run check`
- Test: `npm run test`

## Environment

- `RESONITE_OSC_HOST` (default `127.0.0.1`)
- `RESONITE_OSC_PORT` (default `9000`)
- `RESONITE_WS_PORT` (default `8765`) — WebSocket RPC server port
- `RESONITE_OSC_LISTEN_HOST` (default `0.0.0.0`) — OSC ingress bind host
- `RESONITE_OSC_LISTEN_PORT` (default `9010`) — OSC ingress port
- `RESONITE_DATA_PATH` (required for `capture_camera`): Resonite data root that contains the `Assets/` directory where captured files are written.

OSC address for text egress is fixed to `/virtualbot/text` in code.

Resonite side: receive a string at the configured OSC address and route to your UI or speech component.

## Scope and Intended Use

- This repository targets a very limited, experimental use case. It intentionally hides most Resonite/Protoflux implementation details behind a small, explicit contract surface (addresses, schemas, and RPC names).
- Contracts live in code and docs. Breaking changes require a Migration note in PRs.

Key entry points:

- Aggregated app config (env → typed): `src/server/config.ts`
- Transport adapters: `src/gateway/`
- Tool contracts: `src/tools/contracts.ts`
- OSC ingress payload schemas: `src/schemas/osc.ts` (wired in `src/server/context.ts`)
- WS RPC protocol reference: `docs/PROTOCOL_WS_RPC.md`

## Protoflux (Resonite) Integration Outline

Implementation specifics belong in the world graph. This outline avoids duplicating protocol details and points to contracts.

- OSC egress (server → Resonite): addresses in `src/gateway/addresses.ts`
- OSC ingress (Resonite → server):
  - `/virtualbot/position` floats: `[x, y, z]`
  - `/virtualbot/rotation` floats: `[heading, pitch]`
  - `/virtualbot/arm/contact/meta` string: `[meta]`
  - `/virtualbot/arm/contact/grabbed` int/bool: `[0|1]` or `[true|false]`
- WS RPC: see `docs/PROTOCOL_WS_RPC.md` for request/response fields and error paths.

Suggested wiring:

- Add OSC Transmitter nodes for text and numeric channels matching `addresses.ts`.
- Add OSC Receiver nodes for the ingress channels above; feed pose and contact values into your rig.
- For RPC methods (e.g., `camera_capture`, `arm_grab`, `move_relative`), implement a Resonite WS client that encodes/decodes FlatKV frames per `docs/PROTOCOL_WS_RPC.md`.

## MCP Tools (minimal)

- `set_text`: send text via OSC.
- `capture_camera`: capture image; returns base64 + mimeType.

Other tools exposed: `set_expression`, `set_accent_hue`, `move_relative`, `turn_relative`, `get_pose`, `ping`, `arm_grab`, `arm_release`, `set_arm_position`, `get_arm_contact`, `set_lamp`.

- `wait_resonite`: waits until a Resonite WS client connects.

Contracts (source of truth) live in code: `src/tools/contracts.ts:1`

## VS Code

This repo includes `.vscode/settings.json` with:

- ESLint (flat config) + Prettier
- Use workspace TypeScript
- Vitest Test Explorer configured to run `npm run test:watch`

Recommended extensions are in `.vscode/extensions.json`.

## Project Scripts

- `dev` — run MCP stdio server with tsx
- `probe` — optional, manual probe for Resonite side (WS/OSC)
- `integration` — run a consolidated end-to-end check against the MCP server
- `build` — type-check only (no emit)
- `fix` — Prettier write + ESLint --fix
- `check` — Prettier check + ESLint + TS typecheck
- `test`, `test:watch` — Vitest

## Roadmap

- WebSocket ingress (Resonite as client, message-oriented). Protocol: see `docs/PROTOCOL_WS_RPC.md`.
- HTTP ingress (Resonite-initiated GET/POST, text-only)
- Flat key-value codec (URL-encoded) for non-JSON transports

MIT © esnya

## Integration Probe (optional)

These manual checks require a running Resonite world wired to the OSC/WS ports.
They are not part of normal tests.

Generic probe commands:

- `ws:call`: call Resonite WS-RPC methods (Resonite must connect to our server)
  - `npm run probe -- ws:call --method ping --arg text=hello`
  - `npm run probe -- ws:call --method camera_capture --arg fov=60 --arg size=512 --raw`
  - `npm run probe -- ws:call --method arm_grab`
  - `npm run probe -- ws:call --method arm_release`
- `osc:send`: send OSC to any address
  - `npm run probe -- osc:send --address /virtualbot/text --text "hello"`
  - `npm run probe -- osc:send --address /virtualbot/arm/position --floats 0.2,0.0,0.8`
  - `npm run probe -- osc:send --address /virtualbot/lamp/state --ints 2`
- `osc:listen`: print incoming OSC
  - `npm run probe -- osc:listen --host 0.0.0.0 --port 9010`
  - `npm run probe -- osc:listen --filter /virtualbot/position --durationMs 5000`

Convenience aliases retained:

- `set-expression`, `set-accent-hue`, `pose`, `ws:ping`, `expressions`

Consolidated check (all tools, Resonite required):

- `npm run integration`
- Set `INTEGRATION_CAPTURE=1` to also test `capture_camera`
