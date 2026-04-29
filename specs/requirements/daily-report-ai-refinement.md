---
forge_loop: true
artifact: requirement
slug: daily-report-ai-refinement
status: ready
gate: H1
blocking: false
---

# Requirement: daily-report-ai-refinement

| Field | Value |
| --- | --- |
| Status | ready |
| Owner | human |
| Created | 2026-04-29 |
| Source | user request: 增加日报内容 AI 微调功能，支持继续对话以微调部分内容结构，优先考虑流式 API 同 session 共享上下文 |
| Related Docs | `src/components/daily/daily-report-detail.tsx`, `src/components/daily/daily-report.api.ts`, `src/lib/daily-report/service.ts`, `src/lib/daily-report/types.ts`, `src/lib/ai/provider.ts`, `prisma/schema.prisma`, `docs/agents/domain.md` |
| Issue Source | N/A |

## Domain Language

| Term | Meaning / Source |
| --- | --- |
| AI 日报 | 当前 `DailyReport` 领域对象，包含 `summaryJson`、`renderedMarkdown`、来源引用和发布状态；来源：`src/lib/daily-report/types.ts`, `prisma/schema.prisma` |
| 日报详情页 | `/daily/[date]` 渲染 `DailyReportDetail`，管理员可重新生成、发布、撤回和删除；来源：`src/components/daily/daily-report-detail.tsx` |
| 微调 | 管理员在现有日报基础上通过自然语言指令修改部分内容结构或文案，不重新抓取候选内容；来源：user request |
| 继续对话 | 同一微调会话内多轮追加指令，后续轮次可复用前文指令、草稿和模型上下文；来源：user request |
| 流式 API | 微调结果以增量文本或结构化事件返回给前端，便于管理员实时观察生成过程；来源：user request |

## Background

当前 AI 日报由后台任务一次性生成。生成服务会读取候选文章，调用 `AiProvider.generateDailyReport` 产出 JSON，再保存为 `DailyReport.summaryJson` 与 `renderedMarkdown`。管理员在日报详情页只能重新生成整篇、发布、撤回或删除。

用户希望新增一个面向管理员的 AI 微调能力：在已有日报基础上继续对话，让模型按指令调整部分内容结构，并优先使用流式 API 在同一 session 中共享上下文。

## Problem

整篇重新生成成本高、反馈慢，而且无法表达“只调整某个段落/某个章节结构/保留其他内容不变”的编辑意图。缺少会话上下文时，多轮微调需要反复提交完整日报和历史指令，既浪费 token，也容易让模型忘记上一次修改目标。

## Goal

让管理员能在日报详情页对草稿日报发起 AI 微调会话，通过多轮对话对指定内容结构或文案做局部修改，并将确认后的结果保存回日报草稿，同时保留来源引用和发布安全边界。

## Target Users

拥有管理员权限、负责发布 AI 日报的运营/编辑用户。

## User Stories

| ID | As a | I want | So that |
| --- | --- | --- | --- |
| US1 | 管理员 | 在日报详情页输入微调指令并看到流式生成过程 | 可以快速判断模型是否按预期调整内容 |
| US2 | 管理员 | 在同一个微调会话里继续追问或补充指令 | 可以在不重新解释上下文的情况下逐步打磨日报 |
| US3 | 管理员 | 只保存确认后的微调结果 | 避免未确认的 AI 输出直接覆盖可发布内容 |
| US4 | 管理员 | 微调后仍保留日报来源引用、状态和导出/发布能力 | 确保编辑体验不破坏现有日报发布链路 |
| US5 | 管理员 | 先通过对话确认改法，再显式生成候选稿 | 避免每次沟通都产生一版完整文档 |
| US6 | 管理员 | 通过关键词或候选编号召回未入选来源并加入本 session 上下文 | 可以在不全量重生成日报的前提下补充必要背景 |
| US7 | 管理员 | 在对话跑偏或上下文过长时开启新对话 | 可以从当前已保存日报现状重新开始，避免旧上下文污染 |

## In Scope

- 日报详情页管理员可见的 AI 微调入口。
- 日报详情页底部居中的悬浮 AI 微调入口，点击后打开对话框。
- 微调对话框，支持输入指令、展示同 session 的多轮消息和流式生成状态。
- 对话模式与候选生成模式分离：普通发送只产生助手回复；管理员显式点击生成候选稿后才生成可保存文档。
- 支持通过关键词从同日报日期的未入选候选中召回来源，并手动加入当前 session 的 source registry。
- 支持在弹窗内开启新对话；新对话清空当前前端 session 状态，不删除数据库旧 session。
- 后端管理员 API，用于创建或延续日报微调 session，并以流式响应返回模型输出。
- 微调输出必须能落回现有 `DailyReportContent` 结构，经过校验后才允许保存。
- 保存微调结果时更新 `summaryJson`、`renderedMarkdown`、`generatedAt` 或等价更新时间，并失效日报缓存。
- 微调只允许管理员对非 failed 的日报执行；公开读者不可见。
- 微调失败时保留原日报内容，并向前端返回可理解错误。

## Out of Scope

- 不做面向公开读者的评论、反馈或协作编辑。
- 不做多人实时协同编辑、人工 diff 审批流或版本对比 UI。
- 不重新跑候选内容抓取、聚类或全量日报生成任务。
- 不改变日报自动生成、发布、撤回、删除的既有语义。
- 不要求本阶段支持跨日期复用同一个微调会话。
- 不新增非 AI 的富文本编辑器能力。

## Out-of-Scope References

- N/A；已检查 `.out-of-scope/README.md`，没有命中已拒绝事项。

## Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| AC1 | 管理员发起微调 | 管理员打开一篇非 failed 日报详情页 | 输入“把安全与风险放到今日大事前，并压缩开头摘要”一类消息并发送 | 页面出现流式助手回复，用于继续确认改法；不会直接覆盖或生成候选稿 |
| AC2 | 同 session 继续对话 | 同一日报已有一个未关闭的微调 session，且上一轮对话已完成 | 管理员继续输入“再把结尾改得更像行动建议” | 后端在同 session 上追加消息，不要求前端重新提交完整历史；普通对话不会生成候选稿 |
| AC3 | 结构校验 | 模型返回候选内容 | 后端解析微调结果 | 只有符合 `DailyReportContent` 结构、章节字段和来源 ID 约束的结果可进入保存态；非法输出返回错误且不覆盖日报 |
| AC4 | 保存确认结果 | 管理员确认一个微调候选 | 点击保存 | `summaryJson`、`renderedMarkdown` 和缓存版本更新；刷新详情页后显示保存后的内容 |
| AC5 | 权限边界 | 未登录或非管理员用户访问微调 API | 发起微调或保存请求 | 请求被拒绝，不暴露草稿微调能力 |
| AC6 | 发布安全 | 日报已发布 | 管理员尝试保存微调结果 | 系统禁止直接覆盖已发布日报，并提示先撤回为草稿后再保存 |
| AC7 | 成本可观察 | 管理员执行一轮或多轮微调 | 请求完成或失败 | 系统记录至少可排查的模型、日报日期、session 标识和失败原因；若已有 AI usage 口径可接入，应计入微调调用 |
| AC8 | 召回未入选源 | 当前日报只包含已入选来源 | 管理员输入关键词或 `#候选编号` 召回来源 | 返回同日期候选中尚未进入当前 session registry 的匹配来源，不自动发送给 AI |
| AC9 | 加入召回来源 | 管理员从召回结果中选择来源 | 点击加入 | session registry 追加新来源，并分配大于现有最大值的 report-local `sourceNumber` |
| AC10 | 悬浮入口 | 管理员打开日报详情页 | 查看页面底部 | AI 微调入口位于页面正中底部，正文顶部不再插入微调面板 |
| AC11 | 开启新对话 | 当前弹窗已有对话、召回来源或未保存候选稿 | 管理员点击“新对话”并确认 | 前端清空当前 `sessionId`、消息、候选稿和临时来源状态；下一次发送或召回会基于当前已保存日报创建新 session |

## Risks

| Risk | Impact | Likelihood | Mitigation |
| --- | --- | --- | --- |
| 流式 API 与当前 OpenAI-compatible chat completions 封装不匹配 | 需要改 `AiProvider` 接口和 API route，可能影响现有生成调用 | medium | H2 设计中隔离新增 streaming 方法，不改现有同步方法语义；补 provider 单元测试 |
| “同 session 共享上下文”的存储边界不清 | 可能导致上下文丢失、token 成本过高或服务重启后不可恢复 | medium | H2 明确 session 存储策略：优先服务端持久化或 provider session id；不可用时有降级方案 |
| 微调输出破坏来源引用 | 日报来源统计、导出和引用可信度下降 | medium | 保存前复用 `parseDailyReportContent` 和来源 ID 校验，禁止生成不存在的 sourceIds |
| 已发布日报被静默改写 | 公开内容被非预期修改 | medium | 默认禁止直接覆盖已发布日报，必须先撤回为草稿后再保存 |
| 多轮流式中断 | 管理员看到半截结果或 session 状态不一致 | medium | 只把完整校验通过的候选作为可保存结果；中断时保留原日报 |
| API 权限遗漏 | 草稿内容或编辑能力泄露 | low | 复用现有 admin session 校验，添加 API 测试 |

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| 已发布日报保存微调结果时，是保持 published、回退 draft，还是禁止直接保存？ | human | no | 默认禁止直接覆盖已发布日报，必须先撤回为草稿后再保存 |
| 微调历史是否需要长期可审计保存，还是只保存当前 session 临时上下文和最终结果？ | human | no | 默认先做最小可排查记录，完整版本审计不进本期 |
| “同 session 共享上下文”是否必须绑定特定模型供应商的原生 session，还是允许服务端持久化消息作为兼容方案？ | human | no | 默认优先原生 session，兼容方案为服务端消息历史 |

## Assumptions

- 本期只面向管理员，不改变公开读者体验。
- 本期微调对象是整篇日报 JSON 结构中的局部内容，而不是逐字富文本编辑。
- 可以新增内部管理员 API 和必要的数据表/字段，但需要在 H2 设计中确认迁移方案。
- 流式输出用于编辑体验；最终保存仍以完整、校验通过的 `DailyReportContent` 为准。
- 模型供应商保持 OpenAI-compatible 优先，但不能让现有非流式日报生成能力退化。
- 发布态日报不允许被微调保存直接覆盖；管理员需要先撤回为草稿。

## Validation

- H1：本需求与 review 无阻塞问题后由人类确认。
- H2：设计必须明确 API contract、session 存储、发布态保存规则、流式降级策略和数据迁移。
- 实现后至少运行 `npm test`、相关 daily report/provider 单元或集成测试，并用管理员详情页手动验证一轮流式微调和保存。
