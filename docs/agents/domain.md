# Domain Docs

Forge Loop uses domain docs to keep agent language, issue summaries, tests, and code names consistent.

## Layout

| Field | Value |
| --- | --- |
| Context Mode | single-context |
| Primary Context | `CONTEXT.md` if present; otherwise `.ai/project-context.md` |
| Context Map | `CONTEXT-MAP.md` if present |
| ADR Directory | `docs/adr/` |
| Out-of-Scope Directory | `.out-of-scope/` |

## Consumer Rules

- Read `CONTEXT.md`, `CONTEXT-MAP.md`, `.ai/project-context.md`, and nearby ADRs before requirement, design, diagnosis, TDD, architecture spike, and review work.
- Use canonical domain terms in requirement titles, task titles, test names, and code identifiers when practical.
- If a user uses a term that conflicts with the glossary, call it out and resolve the ambiguity before designing.
- Create or update domain language lazily when decisions crystallize; do not invent jargon for one-off implementation details.
- Write ADRs only when a decision is hard to reverse, surprising without context, and based on a real trade-off.

