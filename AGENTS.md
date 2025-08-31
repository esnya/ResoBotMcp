# Agents Guide

Authoritative, concise rules for contributors (≤200 lines).

## Priorities

- Naming is design. Prefer precise, domain-driven names.
- Keep it simple: YAGNI, DRY, high cohesion, low coupling.
- Static safety first. Intent must be clear from code, not comments.

## Architecture

- Bounded contexts: Gateway(transport), UseCases(app), Types(shared).
- Transports: OSC now; WebSocket/HTTP ingress later.
- MCP: stdio server via `@modelcontextprotocol/sdk`.

## Ubiquitous Language

- ResoniteLink: boundary to the Resonite world.
- OscTextSender: OSC text egress.
- SendTextViaOsc: deliver text to the world.
- Ingress: WS/HTTP receivers from Resonite (future).
- FlatCodec: key=value URL-encoded serialization (future).

## Configuration Pattern

- Each constructor takes a single `Config` object.
- `Config` is a plain, JSON-serializable record validated by zod.
- Provide `fromEnv()` (parse/validate) and `toJSON()` (or plain object) helpers.
- Treat config/submodels so they can be passed as-is (model_dump analogue).
- No comments in config. Express intent via field names and types.

See `docs/CONFIGURATION.md` for patterns and examples.

## Code Style

- No enums: use union literals.
- No `any` in production code. Allow only in `*.d.ts` and tests.
- Public APIs: explicit param/return types.
- No unused vars; prefix `_` for intentionally unused params.
- Access env as `process.env['NAME']`.
- JSON must be formatted (Prettier). No comments in JSON.

## Tooling

- TypeScript: `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`.
- ESLint (flat) type-aware + Prettier. Run `npm run check` before commit.
- Tests: Vitest (+ coverage). Keep fast and deterministic.

## VS Code Policy

- Keep `.vscode` in version control.
- Use workspace TypeScript (`typescript.tsdk`).
- Prettier is the formatter; ESLint fixes on save. Ensure no divergence from project config.

## Docs Policy

- Do not document what code already makes obvious.
- Prefer pointing to directories/modules over repeating implementation.
- Keep this guide concise and non-redundant; move extended notes to `docs/`.

## Security

- Do not use pre-commit hooks or client-side Git automations.

## Project Layout

- `src/gateway/`: transport adapters.
- `src/usecases/`: application use cases.
- `src/types/`: ambient declarations and shared types.
- `src/__tests__/`: unit tests.
- `docs/`: extended guidance not needed daily.

## Scripts

- `dev`: start MCP stdio server.
- `fix`: Prettier write then ESLint --fix (auto-fix first).
- `check`: Prettier check, ESLint, TS type-check.
- `test`, `test:watch`: run tests.

## Review

- Prefer small, cohesive changes. Rename early when names clarify intent.
- If code needs comments to understand, redesign it. Only doc comments allowed where unavoidable.
