# Minimal WebSocket RPC (Resonite ↔ Server)

Normative spec for message exchange between Resonite (client) and this server using a flat key–value codec over WebSocket text frames.

- Transport: WebSocket (text frames, UTF-8). Resonite is the client.
- Endpoint: `ws://<host>:<port>/` (port configurable, default 8765).
- Framing: 1 frame = 1 message.
- Encoding: FlatKV (see “FlatKV Codec”).

## Envelope

- Common fields
  - `type`: message type: `req` | `res`.
  - `id`: correlation id (ASCII `[A-Za-z0-9._-]{1,64}`) unique per request.

- Request (`type=req`)
  - `method`: method name (e.g., `bot.say`).
  - `arg.<name>`: argument values (strings). No global typing rules; methods decide semantics.

- Response (`type=res`)
  - `status`: `ok` | `error`.
  - When `status=ok`: `result.<name>` fields are returned.
  - When `status=error`: `message` contains a human-readable error description (no error code).

- Example (visual separators shown below; see FlatKV for actual encoding)
  - Request pairs: `type=req`, `id=abc123`, `method=bot.say`, `arg.text=Hello world!`
  - Success pairs: `type=res`, `id=abc123`, `status=ok`, `result.delivered=true`
  - Error pairs: `type=res`, `id=abc123`, `status=error`, `message=text required`

## Semantics

- For every `req`, the server MUST send one `res` with the same `id`.
- Requests MAY be processed concurrently; responses MAY arrive out-of-order.
- Clients SHOULD time out after a configured interval (e.g., 5000ms) and handle timeouts locally.

## Methods

- Application methods are intentionally not defined here. Define your own set under the above envelope (e.g., `bot.say`) and keep arguments/results flat.

## Errors

- No error codes. Respond with `status=error` and a readable `message`.

## Limits

- Messages SHOULD be ≤ 4 KiB. Larger messages MAY be rejected.
- Keys MUST be ASCII; values are arbitrary Unicode strings encoded per FlatKV.

---

## FlatKV Codec

Flat key–value serialization using ASCII control separators chosen for meaning.

- Pair separator: Unit Separator (US, `0x1F`). Separates individual key–value pairs.
- Key–value separator: Group Separator (GS, `0x1D`). Separates key from value.
- Record Separator (RS, `0x1E`) is reserved (not used over WS frames).

### Grammar (conceptual)

message := pair (US pair)\*

pair := key GS value

key := ASCII `[A-Za-z0-9._-]+` (no spaces)

value := percent-encoded UTF-8 text (see below)

### Percent-Encoding

- Values MAY contain any Unicode text. Encode by:
  1. UTF-8 bytes
  2. Percent-encode bytes as `%HH` (uppercase hex) for all bytes outside `[0x20..0x7E]` and for reserved control separators `US (0x1F)`, `GS (0x1D)`, `RS (0x1E)`, and `%` itself.
- Keys SHOULD be ASCII and SHOULD NOT require encoding. If needed, apply the same rule.

### Example

- Logical pairs: `type=req`, `id=abc123`, `method=bot.say`, `arg.text=Hello world!`
- Encoded (showing control names):
  - `type` GS `req` US `id` GS `abc123` US `method` GS `bot.say` US `arg.text` GS `Hello%20world%21`
- Hex bytes (excerpt): `74 79 70 65 1D 72 65 71 1F 69 64 1D 61 62 63 31 32 33 ...`

### Notes

- Keys are flat. Use dots to convey hierarchy (e.g., `arg.text`, `result.delivered`).
- Values are opaque strings to the transport; typing is method-specific.
