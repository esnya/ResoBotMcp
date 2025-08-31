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
- `RESONITE_OSC_ADDRESS` (default `/resonite/text`)

Resonite side: receive a string at the configured OSC address and route to your UI or speech component.

## MCP Tool

- Name: `resonite.osc.send_text`
- Args:
  - `text` (string, required)
  - `address` (string, optional, defaults to env)
  - `host` (string, optional, defaults to env)
  - `port` (number, optional, defaults to env)
- Returns: literal text "delivered" (UDP best-effort)

## VS Code

This repo includes `.vscode/settings.json` with:

- ESLint (flat config) + Prettier
- Use workspace TypeScript
- Vitest Test Explorer configured to run `npm run test:watch`

Recommended extensions are in `.vscode/extensions.json`.

## Project Scripts

- `dev` – run MCP stdio server with tsx
- `build` – type-check and emit to `dist`
- `fix` – Prettier write + ESLint --fix
- `check` – Prettier check + ESLint + TS typecheck
- `test`, `test:watch` – Vitest

## Roadmap

- WebSocket ingress (Resonite as client, message-oriented). Protocol: see `docs/PROTOCOL_WS_RPC.md`.
- HTTP ingress (Resonite-initiated GET/POST, text-only)
- Flat key-value codec (URL-encoded) for non-JSON transports

MIT © esnya
