Design note: Minimal local resource whitelist (pre‑release)

Purpose

- Expose locally captured assets (currently from capture_camera) as MCP resources without leaking machine_id or real paths.
- Keep it simple: local only, no TTL, no hashing, no MIME checks yet.

Scope & Boundaries

- In scope: Whitelist of sanitized URIs; resources/list returns the whitelist; resources/read returns base64 blob.
- Out of scope (later): TTL/usage limits, MIME/type checks, thumbnails, SVG handling, hashing, EXIF stripping.

URI & Sanitization

- Input from tool: `local://<machine_id>/<filename>` (source dependent).
- Public resource URI: `local:///filename` (authority elided).
- Only basename is used; directory structure remains opaque.

Whitelist Model (minimal)

- Registry holds a Set of sanitized URIs (`local:///filename`).
- Only URIs granted by tools (e.g., capture_camera) are listed/readable.
- No expiry. Duplicate grants are idempotent.

MCP Interface

- A ResourceTemplate is registered at `local:///{filename}`.
  - list: enumerates current whitelist as Resources (name=filename, uri=`local:///filename`).
  - read: validates URI ∈ whitelist, reads from `${RESONITE_DATA_PATH}/Assets/<filename>` and returns `{ blob: base64 }`.

Error Model (minimal)

- Not granted or missing file: throw `Resource not found`.
- Non-`local:` URIs: throw `Invalid resource URI`.

Configuration

- Reuse existing `RESONITE_DATA_PATH` for asset root resolution (Assets subfolder).

Migration

- None yet (not wired). When integrated, tool `capture_camera` will return URIs instead of inline base64.

Test Strategy

- Unit: sanitize, grant/list, read success on known file, read fails on unknown.
