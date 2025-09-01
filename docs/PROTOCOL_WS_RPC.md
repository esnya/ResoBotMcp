# Minimal WebSocket RPC (Resonite <-> Server)

Normative spec for message exchange between Resonite (client) and this server using a flat key-value codec over WebSocket text frames.

- Transport: WebSocket (text frames, UTF-8). Resonite is the client.
- Endpoint: `ws://<host>:<port>/` (port configurable, default 8765).
- Framing: 1 frame = 1 message.
- Encoding: Entire frame MUST be URL percent-encoded (encodeURIComponent). After decoding the frame (decodeURIComponent), payload is FlatKV.

## Envelope

- Common fields
  - `type`: message type: `request` | `response`.
  - `id`: correlation id (ASCII `[A-Za-z0-9._-]{1,64}`) unique per request.

- Request (`type=request`)
  - `method`: method name (e.g., `ping`).
  - Arguments: top-level keys other than `type/id/method/status/message` are treated as arguments

- Response (`type=response`)
  - `status`: `ok` | `error`.
  - When `status=ok`: results are returned as top-level keys other than `type/id/status/message`.
  - When `status=error`: `message` contains a human-readable error description (no error code).

- Example (visual separators shown below; see FlatKV for actual encoding)
  - Request pairs: `type=request`, `id=abc123`, `method=ping`, `text=Hello world!`
  - Success pairs: `type=response`, `id=abc123`, `status=ok`, `text=Hello world!`
  - Error pairs: `type=response`, `id=abc123`, `status=error`, `message=text required`

## Semantics

- For every `req`, the server MUST send one `res` with the same `id`.
- Requests MAY be processed concurrently; responses MAY arrive out-of-order.
- Clients SHOULD time out after a configured interval (e.g., 5000ms) and handle timeouts locally.

## Methods

- Application methods are intentionally not defined here. Define your own set under the above envelope (e.g., `bot.say`) and keep arguments/results flat.

## Errors

- No error codes. Respond with `status=error` and a readable `message`.

## Limits

- Messages SHOULD be <= 4 KiB. Larger messages MAY be rejected.
- Keys MUST be ASCII; values are arbitrary Unicode strings encoded per FlatKV.

---

## FlatKV Codec

Flat key-value serialization using ASCII control separators chosen for meaning.

- Pair separator: Unit Separator (US, `0x1F`). Separates individual key-value pairs.
- Key-value separator: Group Separator (GS, `0x1D`). Separates key from value.
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

- Logical pairs: `type=req`, `id=abc123`, `method=bot.say`, `text=Hello world!`
- Encoded (showing control names):
  - `type` GS `req` US `id` GS `abc123` US `method` GS `bot.say` US `text` GS `Hello%20world%21`
- Hex bytes (excerpt): `74 79 70 65 1D 72 65 71 1F 69 64 1D 61 62 63 31 32 33 ...`

### Notes

- Keys are flat. Use dots to convey hierarchy only when needed (e.g., `pose.x`).
- Values are opaque strings to the transport; typing is method-specific.

### ArrayValue (convention)

- When passing vectors or fixed-size lists, encode as C#-style array text: `[v0;v1;v2]`.
- Parser splits on `;` inside surrounding brackets. Whitespace is not significant.
- Example: `vector=[0.0;1.0;0.0]`.
