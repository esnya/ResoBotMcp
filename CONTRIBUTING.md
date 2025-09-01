# Contributing

Please read and follow `AGENTS.md`.

Key points:

- Design-first: write a short design note before coding (purpose, boundaries, API/contract, errors, encoding/units) and link it in PRs.
- No phantom APIs: do not call or document interfaces that are not implemented.
- Contracts: align with `docs/PROTOCOL_WS_RPC.md` and other specs. Breaking changes require a Migration note.
- Consistency: keep defaults (ports/addresses) centralized and in sync across code, tools, and docs.
- Quality gates: `npm run check` (format/lint/typecheck) and `npm test` must pass in CI.

PR labels used by policy checks:

- `breaking`: mark PRs with breaking changes; requires a filled Migration section.
- `allow-large-pr`: temporarily allow >800 changed lines when splitting is impractical (justify in PR body).
- `skip-policy`: bypass policy checks in emergencies (explain why in the PR body).

Thank you for contributing!
