# Project Context

| Field | Value |
| --- | --- |
| Project Name | `infinitum` |
| Initialized At | `2026-04-29T06:27:06Z` |
| Git Branch | `main` |
| Agent Environment | `codex` |

## Tech Stack

- Node.js / JavaScript / TypeScript
- npm

## Detected Commands

- install: `npm install`
- dev: `npm run dev`
- test: `npm test`
- lint: `npm run lint`
- build: `npm run build`

## Architecture Summary

N/A

## Domain Language

Use this section as the project glossary. Prefer these terms in requirements, designs, task names, test names, code identifiers, and user-facing explanations.

| Term | Meaning | Avoid |
| --- | --- | --- |
| N/A | N/A | N/A |

If the project has a root `CONTEXT.md` or `CONTEXT-MAP.md`, treat it as the source of truth and summarize the relevant terms here.

## Architecture Decisions

- ADR directory: `docs/adr/`
- Write an ADR only when a decision is hard to reverse, surprising without context, and based on a real trade-off.
- Do not re-litigate accepted ADRs during design or review unless current evidence shows meaningful friction.

## Directory Notes

- `src/` exists
- `tests/` exists

## Development Rules

- 遵守项目既有代码风格。
- 优先使用项目已有框架、工具和测试方式。
- 不新增依赖，除非任务设计或人工确认允许。

## Testing Rules

- 优先运行本文件列出的检测命令。
- 无法运行测试时必须在 task result 或 test report 中说明原因。

## Open Questions

N/A

## Assumptions

- 初始化脚本只能基于文件探测项目上下文，无法替代人工补充架构说明。

## Risks

- 自动探测的命令可能不完整，需要项目维护者确认。

## Validation

- 初始化后由项目维护者检查本文件。
