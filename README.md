# ResoBot MCP

Minimal MCP (Model Context Protocol) stdio server that connects AI tools to a Resonite bot via OSC first, with room to add WebSocket and HTTP bridges.

## Features

- MCP stdio server powered by `@modelcontextprotocol/sdk`
- Tool: `resonite.osc.send_text` – send generic UTF-8 text over OSC
- Strong TypeScript config and strict linting/formatting
- Vitest test setup with coverage

## Quick Start

- Install: `npm i`
- Dev (stdio): `npm run dev`
- Build: `npm run build`
- Lint fix + format: `npm run fix`
- Check (format + lint + types): `npm run check`
- Test: `npm run test`

## Environment

- `RESONITE_OSC_HOST` (default `127.0.0.1`)
- `RESONITE_OSC_PORT` (default `9000`)
- `RESONITE_OSC_ADDRESS` (default `/resobot/text`)
- `RESONITE_DATA_PATH` (required for `capture_camera`): Resonite data root that contains the `Assets/` directory where captured files are written.

Resonite side: receive a string at the configured OSC address and route to your UI or speech component.

## MCP Tool

- Name: `resonite.osc.send_text`
- Args:
  - `text` (string, required)
- Returns: literal text "delivered" (UDP best-effort)

## VS Code

This repo includes `.vscode/settings.json` with:

- ESLint (flat config) + Prettier
- Use workspace TypeScript
- Vitest Test Explorer configured to run `npm run test:watch`

Recommended extensions are in `.vscode/extensions.json`.

## Project Scripts

- `dev` – run MCP stdio server with tsx
- `probe` – optional, manual probe for Resonite side (WS/OSC)
- `integration` – run a consolidated end-to-end check against the MCP server
- `build` – type-check and emit to `dist`
- `fix` – Prettier write + ESLint --fix
- `check` – Prettier check + ESLint + TS typecheck
- `test`, `test:watch` – Vitest

## Roadmap

- WebSocket ingress (Resonite as client, message-oriented). Protocol: see `docs/PROTOCOL_WS_RPC.md`.
- HTTP ingress (Resonite-initiated GET/POST, text-only)
- Flat key-value codec (URL-encoded) for non-JSON transports

MIT © esnya

## Integration Probe (optional)

These manual checks require a running Resonite world wired to the OSC/WS ports.
They are not part of normal tests.

- Set expression via presets:
  - `npm run probe -- set-expression --eyesId winkL --mouthId smile_big`
- Set accent hue (0..360, normalized to 0..1 internally):
  - `npm run probe -- set-accent-hue --hue 200`
- Seed pose into the server (helps `move_relative`/`turn_relative` in your scene):
  - `npm run probe -- pose --x 0 --y 0 --z 0 --heading 90 --pitch 0`
- WS ping roundtrip (Resonite WS client must connect to the server):
  - `npm run probe -- ws:ping --text hello`
- Consolidated check (all tools, Resonite required):
  - `npm run integration`
  - Set `INTEGRATION_CAPTURE=1` to also test `capture_camera`
