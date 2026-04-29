# Local AI Context

本目录是项目本地适配层，不保存共享核心。

| 文件 | 用途 |
| --- | --- |
| `workflow-config.md` | 共享核心路径、默认流程、产物目录 |
| `project-context.md` | 技术栈、命令、目录和项目事实 |
| `overrides.md` | 项目专属规则和限制 |

共享核心由 `workflow-config.md` 的 `Workflow Core Path` 指向。

## Commands

- Claude Code slash commands: `.claude/skills/*/SKILL.md`，默认本地生成并忽略提交。
- Cross-agent command definitions: `.forge-loop/commands/*.md`，默认本地生成并忽略提交。

Quick Lane commands write to `tasks/quick/`. Full Feature Iteration commands write to `specs/`, `tasks/plans/`, `tasks/results/`, and `docs/`.
