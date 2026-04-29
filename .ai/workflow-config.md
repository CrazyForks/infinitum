# Workflow Config

| Field | Value |
| --- | --- |
| Workflow Core Path | `.agent-workflow/forge-loop/core` |
| Workflow Core Storage | `local-cache` |
| Workflow Core Commit Policy | `do not commit .agent-workflow/; restore it with forge-loop upgrade` |
| Init Profile | `codex` |
| Adapter Commit Policy | `do not commit .forge-loop/ or .claude/skills/; regenerate with forge-loop init or upgrade` |
| Project Name | `infinitum` |
| Agent Environment | `codex` |
| Default Workflow | `feature-iteration` |
| Quick Workflow | `quick-iteration` |
| Max Parallel Subagents | 3 |
| Project Tier | auto |
| Default Stop Gate | H1 |
| Issue Tracker | local markdown or GitHub, configure in `docs/agents/issue-tracker.md` |
| Triage Labels | configure in `docs/agents/triage-labels.md` |
| Domain Docs Layout | configure in `docs/agents/domain.md` |
| Context Doc | `CONTEXT.md` or `.ai/project-context.md` |
| ADR Directory | `docs/adr/` |
| Out Of Scope Directory | `.out-of-scope/` |

## Slash Commands

| Command | Definition |
| --- | --- |
| `/forge` | `.forge-loop/commands/forge.md` |
| `/forge-quick` | `.forge-loop/commands/forge-quick.md` |
| `/forge-fix` | `.forge-loop/commands/forge-fix.md` |
| `/forge-spike` | `.forge-loop/commands/forge-spike.md` |
| `/forge-feature` | `.forge-loop/commands/forge-feature.md` |
| `/forge-bugfix` | `.forge-loop/commands/forge-bugfix.md` |
| `/forge-next` | `.forge-loop/commands/forge-next.md` |
| `/forge-implement` | `.forge-loop/commands/forge-implement.md` |
| `/forge-review` | `.forge-loop/commands/forge-review.md` |

## Core Files

- `.agent-workflow/forge-loop/core/AGENTS.core.md`
- `.agent-workflow/forge-loop/core/.ai/adapters/agent-entry.md`
- `.agent-workflow/forge-loop/core/.ai/adapters/resolver.md`
- `.agent-workflow/forge-loop/core/.ai/workflows/feature-iteration.md`
- `.agent-workflow/forge-loop/core/.ai/workflows/quick-iteration.md`

## Output Roots

- Requirements: `specs/requirements/`
- Designs: `specs/designs/`
- Contracts: `specs/contracts/`
- Plans: `tasks/plans/`
- Quick tasks: `tasks/quick/`
- Results: `tasks/results/`
- Long-term docs: `docs/`
- Agent config docs: `docs/agents/`
- Architecture decisions: `docs/adr/`
- Rejected or out-of-scope ideas: `.out-of-scope/`

## Update Policy

- 项目本地规则写入 `.ai/overrides.md`。
- 项目事实写入 `.ai/project-context.md`。
- 默认不要提交 `.agent-workflow/`；它是本地 workflow core 缓存。
- 默认不要提交 `.forge-loop/` 或 `.claude/skills/`；它们是工具适配缓存。
- 新环境缺失 core 时，运行 `npx @shawnxie666/forge-loop upgrade --project .` 恢复。
- 新环境缺失工具适配层时，重新运行对应 profile 的 `npx @shawnxie666/forge-loop init --project . --profile <profile>`。
- 只有初始化时显式使用 `--vendor-core`，才把 `.agent-workflow/` 作为可提交的 vendored core。
