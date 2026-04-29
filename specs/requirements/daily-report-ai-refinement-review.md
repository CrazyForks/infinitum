---
forge_loop: true
artifact: requirement-review
slug: daily-report-ai-refinement
status: ready
gate: H1
blocking: false
---

# Requirement Review: daily-report-ai-refinement

| Field | Value |
| --- | --- |
| Status | ready |
| Reviewer | Codex |
| Requirement | `specs/requirements/daily-report-ai-refinement.md` |
| Recommendation | Pass with Assumptions |

## Requirement Clarity

| Check | Result | Notes |
| --- | --- | --- |
| Goal is clear | pass | 目标集中在管理员对已有 AI 日报做多轮 AI 微调并保存确认结果。 |
| Target users are clear | pass | 目标用户是负责发布 AI 日报的管理员/编辑用户。 |
| Problem is specific | pass | 现有详情页只能重新生成整篇，无法用对话局部调整内容结构。 |

## Scope Review

| Check | Result | Notes |
| --- | --- | --- |
| In Scope exists | pass | 覆盖 UI 入口、流式 API、session、结构校验、保存和权限。 |
| Out of Scope exists | pass | 排除了公开读者反馈、协同编辑、版本对比、全量重新生成和富文本编辑器。 |
| Hidden scope identified | pass | 发布态保存、session 持久化、AI usage 计量和供应商兼容性已显式记录。 |

## Acceptance Review

| Acceptance ID | Testable | Ambiguity | Notes |
| --- | --- | --- | --- |
| AC1 | yes | no | 可通过详情页手动验证流式候选内容。 |
| AC2 | yes | no | 可通过 API/session id 或后端日志验证续聊是否复用上下文。 |
| AC3 | yes | no | 可用单元测试覆盖合法/非法 `DailyReportContent`。 |
| AC4 | yes | no | 可用集成测试或手动刷新验证保存和缓存失效。 |
| AC5 | yes | no | 可用 API 权限测试覆盖。 |
| AC6 | yes | no | 需求采用保守默认：已发布日报禁止直接覆盖，需先撤回为草稿。 |
| AC7 | yes | no | 可通过日志或 AI usage 记录验证，具体计量口径可在设计阶段细化。 |

## Risk Review

| Risk | Severity | Action |
| --- | --- | --- |
| 发布态日报被静默改写 | medium | 已用保守默认收敛：禁止直接覆盖已发布日报，H2 设计需落到 API/UI。 |
| 流式 API 与当前 provider 抽象不匹配 | medium | H2 设计中隔离新增接口，避免破坏现有生成链路。 |
| session 上下文策略不清 | medium | H2 明确原生 provider session 与服务端消息历史的优先级和降级。 |
| 来源引用被模型改坏 | medium | 实现中保存前复用结构和 sourceIds 校验。 |

## Must Clarify

- N/A

## Should Clarify

- 微调历史是否需要长期审计，还是只保留当前 session 的最小排查记录。
- AI usage 是否需要把流式微调拆成独立统计桶，还是先作为模型调用日志记录。

## Can Assume

- 微调能力只对管理员开放。
- 微调保存前必须经过结构校验，不能把流式半成品写回日报。
- “同 session 共享上下文”可以优先使用模型原生 session；若当前 provider 不支持，则用服务端消息历史模拟。
- 已发布日报禁止被微调保存直接覆盖。

## Open Questions

| Question | Blocking | Recommendation |
| --- | --- | --- |
| 已发布日报保存微调结果时，是保持 published、回退 draft，还是禁止直接保存？ | no | assume 禁止直接覆盖，需先撤回为草稿 |
| 微调历史是否需要长期可审计保存？ | no | defer to H2 unless compliance/audit matters now |
| 是否必须绑定特定模型供应商的原生 session？ | no | assume provider-compatible fallback is acceptable |

## Assumptions

- 当前 review 依据用户请求和本轮读取的日报详情、日报服务、AI provider 与 Prisma 模型代码。
- 未发现 `.out-of-scope/` 中已有拒绝项。

## Risks

- 若用户后续希望允许直接修改 published 日报，需要回到 H1/H2 调整发布态语义。
- 需求涉及 API contract 和可能的数据模型变更，不能按 Quick Lane 直接实现。

## Validation

- 已用 `npx @shawnxie666/forge-loop route ... --json` 路由，结果为 `lane=feature`、`risk=medium`、`contractImpact=external`、`modelTier=high`。
- 已检查 `docs/agents/domain.md`、`.out-of-scope/README.md`、`src/components/daily/daily-report-detail.tsx`、`src/lib/daily-report/service.ts`、`src/lib/ai/provider.ts`、`prisma/schema.prisma`。
