# Resonite WebSocket Client (High-level)

This document describes what the Resonite side needs to implement to use the minimal WebSocket RPC from a world or bot. It avoids Protoflux specifics.

- Connect to `ws://<server-host>:<port>/` where `<port>` matches the server configuration (default `8765`).
- A message is one text frame carrying a FlatKV-encoded record (see `docs/PROTOCOL_WS_RPC.md`).

## Send a Request

- Generate a correlation id `id` (ASCII `[A-Za-z0-9._-]{1,64}`) unique per in-flight request.
- Build pairs:
  - `type=request`
  - `id=<id>`
  - `method=<methodName>` (e.g., `ping`)
  - Add each argument as a top-level key, e.g., `text=Hello` (none for `ping`).
- Encode with FlatKV (pair sep US 0x1F, key/value sep GS 0x1D, percent-encoding).
- Send as a single WebSocket text frame.

## Receive a Response

- Wait for a text frame.
- Decode FlatKV into key–value pairs.
- Match `type=response` and `id=<same id>`.
- If `status=ok`: read result fields from top-level keys (all keys except `type/id/status/message`).
- If `status=error`: read `message` and handle locally (log, UI, retry, etc.).
- Apply a timeout (e.g., 5000 ms) if no response arrives; treat as local error and cancel/ignore late responses.

## Example (ping)

- Request pairs: `type=request`, `id=abc123`, `method=ping`, `text=Hello world!`
- Response pairs on success: `type=response`, `id=abc123`, `status=ok`, `text=Hello world!`

## Notes

- Keep messages small (≤ 4 KiB recommended).
- Keys are ASCII; values are arbitrary Unicode text percent-encoded by the FlatKV rules.
- Maintain a small table of pending `id -> continuation` if multiple concurrent requests are used.
