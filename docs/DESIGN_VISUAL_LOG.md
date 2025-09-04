# Visual Log (Session HTML)

Purpose: Generate a per-session, single-file HTML visual log under a configurable `logs/` directory. It contains two views: a time-ordered timeline (newest first) and a position-based 2D path view in Resonite coordinates (+Z forward, +X right, +Y up).

Scope and boundaries:

- Input events: pose updates from OSC ingress and `set_text` tool invocations.
- Output: one HTML file per server session, named by local timestamp. Output references CDN assets (D3, hexbin) for the map to keep the file small; no runtime flags. If a fully self-contained/offline variant is needed, we can add an alternative build in the future.
- Performance: write debounced; frequent pose updates are buffered. `set_text` is coalesced while appending to avoid noisy partials.
- Independence: no changes to transports or business logic; only minimal hooks in context and tools.

Public API/contract:

- Config (env → typed):
  - `VISUAL_LOG_DIR` (default: `logs/`)
  - `VISUAL_LOG_FLUSH_MS` (default: 1000)
  - `VISUAL_LOG_TEXT_COALESCE_MS` (default: 500)
- Recording:
  - `recordPose(pose)`
  - `recordText(text)` (coalesces rapid successive calls)
  - `close()` flushes pending changes

Error model:

- Non-fatal I/O errors are logged and do not affect main flows.
- Directory creation is attempted at init; failure is logged and disables further writes.

Encoding/units:

- Timestamps: epoch milliseconds (number).
- Coordinates: Resonite world coordinates as-is: `{ x, y, z, heading, pitch }`.

Placement:

- Code: `src/usecases/VisualLogSession.ts`
- Hooks: `src/server/context.ts` (pose), `src/server/tools.ts` (set_text)
- Config: `src/server/config.ts`

Libraries:

- HTML template is generated server-side with a tiny internal template helper (no heavy runtime dependency). No minify toggle exposed.
- Frontend uses vanilla JS; D3 and hexbin are loaded via CDN for the map. No CSS reset is included.

Test strategy:

- Unit-test text coalescing and event ordering (no filesystem).
- I/O paths are thin; rely on integration/probe to visually inspect output when a Resonite client is available.

Migration:

- Purpose: add independent session HTML logs.
- Impact: none on public APIs. Minimal extra imports in `context.ts`/`tools.ts`.
- Rollback: remove hooks and file; feature is isolated.
