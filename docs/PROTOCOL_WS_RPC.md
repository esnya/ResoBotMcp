# Minimal WebSocket RPC (Resonite ↔ Server)

Normative spec for message exchange between Resonite (client) and this server.

- Transport: WebSocket (text frames, UTF-8). Resonite is the client.
- Endpoint: `ws://<host>:<port>/` (port configurable, default 8765). Optional `?token=...`.
- Framing: 1 frame = 1 message. No batching required.
- Encoding: flat key-value using `application/x-www-form-urlencoded` rules (URL-encoded pairs joined with `&`).

## Envelope

- Common fields
  - `v`: protocol version (string). Current: `1`.
  - `t`: message type: `req` | `res`.
  - `id`: correlation id (ASCII `[A-Za-z0-9._-]{1,64}`) unique per request.

- Request (`t=req`)
  - `m`: method name (e.g., `sys.ping`).
  - `a.<name>`: argument values (strings). Booleans: `true|false`. Numbers: decimal string.

- Response (`t=res`)
  - `ok`: `true|false` (string literal).
  - When `ok=true`: `r.<name>` result fields.
  - When `ok=false`: `code` (slug), optional `msg` (human text).

- Example
  - Request: `v=1&t=req&id=abc123&m=bot.say&a.text=Hello%20world%21`
  - Success: `v=1&t=res&id=abc123&ok=true&r.delivered=true`
  - Error: `v=1&t=res&id=abc123&ok=false&code=invalid_args&msg=text%20required`

## Semantics

- For every `req`, the server MUST send one `res` with the same `id`.
- Requests MAY be processed concurrently. Responses MAY arrive out-of-order.
- Clients SHOULD time out after a configured interval (e.g., 5000ms) and handle `timeout` locally.

## Methods

- `sys.ping`
  - Args: none
  - Result: `r.server` (string `<name>/<version>`), `r.now` (string ms since epoch)

- Application methods are out of scope of this spec; they follow the same envelope pattern (e.g., `bot.say` with `a.text`).

## Errors

- `invalid_method`: unknown `m`.
- `invalid_args`: missing/invalid `a.*`.
- `unauthorized`: token missing/invalid.
- `rate_limited`: retry later.
- `internal`: unexpected error.

## Limits

- Max message size SHOULD be ≤ 4 KiB. Servers MAY reject larger messages.
- Keys MUST be ASCII; values are URL-encoded UTF-8 strings.

## Authentication

- Optional `?token=...` on the WS URL. Servers MAY also accept `a.token` for explicit calls.

## Versioning

- Clients MUST send `v`. Servers MUST echo `v` in responses. Incompatible versions MAY result in connection close.
