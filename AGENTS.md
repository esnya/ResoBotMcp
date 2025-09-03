# Agents Guide

Authoritative, concise rules for contributors (≤200 lines).

## Priorities

- Naming is design. Prefer precise, domain‑driven names.
- Keep it simple: YAGNI, DRY, high cohesion, low coupling.
- Static safety first. Intent must be clear from code, not comments.

## Architecture

- Bounded contexts: Gateway(transport), UseCases(app), Types(shared).
- Transports: defined in protocol docs; keep command and telemetry concerns separate.
- MCP: stdio server via `@modelcontextprotocol/sdk`.

Protocol specifics live in `docs/PROTOCOL_WS_RPC.md` (do not duplicate here).

## Ubiquitous Language

- ResoniteLink: boundary to the Resonite world.
- OSC text egress: outbound text channel via OSC.
- SendTextViaOsc: deliver text to the world.
- Ingress: WS/HTTP receivers from Resonite (future).
- FlatKV: flat key=value codec (see Protocol docs for encoding rules).

## Design‑First Principles

- Design first: Before coding, write a short design note (purpose, boundaries, public API/contract, error model, encoding/units). Link it in the PR.
- No phantom APIs: Never call or depend on interfaces that are not designed and implemented. If needed, stub behind an interface or guard with a feature flag.
- Single source of truth: Contracts live in docs/specs. Code, tests, and tools follow them exactly. Breaking changes require a Migration note.
- Avoid hidden defaults: Keep integration defaults (e.g., endpoints) in one place and aligned across code and tools.
- Explicit over defaults: Do not rely on omitted inputs or default parameters. Require explicit values at boundaries; if a default is unavoidable, make it opt‑in and centralized.
- Non‑interfering observability: Logs and outputs must not collide with protocol transports. Return concise, human‑useful results from tools.
- Readiness and timeouts: For external dependencies, wait with bounded timeouts and fail with actionable messages.

## Configuration Pattern

- Each constructor takes a single `Config` object.
- `Config` is a plain, JSON‑serializable record validated by zod.
- Provide `fromEnv()` (parse/validate) and `toJSON()` (or plain object) helpers.
- Treat config/submodels so they can be passed as‑is (model_dump analogue).
- No comments in config. Express intent via field names and types.

See `docs/CONFIGURATION.md` for patterns and examples.

## Code Style

- No enums: use union literals.
- No `any` in production code. Allow only in `*.d.ts` and tests.
- Public APIs: explicit param/return types.
- No unused vars; prefix `_` for intentionally unused params.
- Empty `catch` blocks are forbidden. If suppression is truly necessary, disable the rule line‑by‑line with an ESLint directive including a short reason; do not leave comment‑only blocks.
- Access env as `process.env['NAME']`.
- JSON must be formatted (Prettier). No comments in JSON.

## Tooling

- TypeScript: `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`.
- ESLint (flat) type‑aware + Prettier. Run `npm run check` before commit.
- Tests: Vitest (+ coverage). Keep fast and deterministic.
- Test policy:
  - Unit tests must be hermetic: no real Resonite client/process required; no external network dependencies.
  - Do not include tests that require a live Resonite WS client in CI. Use devtools for manual verification instead.
  - For WS RPC, use in‑process stubs (e.g., `ws` client) to exercise error paths and success parsing.

## VS Code Policy

- Keep `.vscode` in version control.
- Use workspace TypeScript (`typescript.tsdk`).
- Prettier is the formatter; ESLint fixes on save. Ensure no divergence from project config.

## Docs Policy

- Do not document what code already makes obvious.
- Prefer pointing to directories/modules over repeating implementation.
- Keep this guide concise and non‑redundant; move extended notes to `docs/`.
- MCP tool docs are minimal: one‑line description. If argument names convey intent, omit per‑field explanations and obvious constraints. Let zod contracts and concise error messages guide usage. Favor short, actionable errors (include raw/protocol snippets when helpful) to help LLMs self‑correct while conserving context length.

## Security

- Do not use pre‑commit hooks or client‑side Git automations.

## Project Layout

- `src/gateway/`: transport adapters.
- `src/usecases/`: application use cases.
- `src/types/`: ambient declarations and shared types.
- `src/__tests__/`: unit tests.
- `docs/`: extended guidance not needed daily.

## Scripts

- `dev`: start MCP stdio server.
- `fix`: Prettier write then ESLint --fix (auto‑fix first).
- `check`: Prettier check, ESLint, TS type‑check.
- `test`, `test:watch`: run tests.

### Manual Integration/Probe (real client)

- Use `probe` and `integration` only when a real Resonite client/world is available. Not run in CI.
- Examples:
  - `npm run probe -- ws:call --method arm_grab`
  - `npm run probe -- ws:call --method arm_release`
  - `npm run probe -- ws:call --method ping --arg text=hello`
  - `npm run integration` (optional end‑to‑end sweep; expects Resonite wiring if WS/OSC paths are exercised)

## Review

- Prefer small, cohesive changes. Rename early when names clarify intent.
- If code needs comments to understand, redesign it. Only doc comments allowed where unavoidable.
