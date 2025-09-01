Design note: Minimal local resource whitelist (pre‑release)

Purpose

- Future: expose locally captured assets (from `capture_camera`) as MCP resources without leaking `machine_id` or real paths.
- Current: do not expose MCP resources; return only the sanitized filename from the tool. Keep it simple: local only, no TTL, no hashing, no MIME checks yet.

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

- Deferred (not registered). The design keeps a `ResourceTemplate` for `local:///{filename}` ready to be wired when needed.
  - list: would enumerate whitelist as Resources (name=filename, uri=`local:///filename`).
  - read: would validate URI ∈ whitelist, read from `${RESONITE_DATA_PATH}/Assets/<filename>` and return `{ blob: base64 }`.

Error Model (minimal)

- Not granted or missing file: throw `Resource not found`.
- Non-`local:` URIs: throw `Invalid resource URI`.

Configuration

- Reuse existing `RESONITE_DATA_PATH` for asset root resolution (Assets subfolder).

Migration

- Current behavior: `capture_camera` returns the sanitized filename only (no data). `local:///` prefix is fixed and implied.
- Future migration (if enabling MCP resources): return `local:///filename` and document consumers to read via MCP resources.

Test Strategy

- Unit: sanitize, grant/list, read success on known file, read fails on unknown.
