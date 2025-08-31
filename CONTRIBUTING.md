# Contributing

Please read and follow `AGENTS.md`.

Key points:

- Design-first: write a short design note before coding (purpose, boundaries, API/contract, errors, encoding/units) and link it in PRs.
- No phantom APIs: do not call or document interfaces that are not implemented.
- Contracts: align with `docs/PROTOCOL_WS_RPC.md` and other specs. Breaking changes require a Migration note.
- Consistency: keep defaults (ports/addresses) centralized and in sync across code, tools, and docs.
- Quality gates: `npm run check` (format/lint/typecheck) and `npm test` must pass in CI.

Thank you for contributing!

