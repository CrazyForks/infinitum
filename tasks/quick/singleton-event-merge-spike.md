---
forge_loop: true
artifact: quick-task
slug: singleton-event-merge-spike
status: done
mode: quick
blocking: false
---

# Quick Task: singleton-event-merge-spike

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | quick |
| Request | 按 singleton merge candidate pass 方案实现聚合合并预筛，允许单条聚合进入 AI 复判，并避免多主体事件因 subject 不一致漏掉 |
| Owner | human |
| Created | 2026-04-29 |
| Risk | medium |
| Escalation | none |
| Model Hint | high |

## Scope

- 调整 `executeClusterMerge()` 的候选读取和本地预筛，让 7 天窗口内满足可聚合来源、processed 且 allowed/restored 条件的 singleton cluster 也能进入候选。
- 增加 deterministic pair scoring，先用本地规则筛出 singleton 额外候选；旧有 `itemCount >= 2` 聚合组仍直接进入 AI 候选。
- 将 `eventSubject` 作为加分信号而非硬门槛，允许 `OpenAI` / `微软` 这类多主体同一事件进入 AI 复判。
- 保留关键对象和日期冲突拒绝，降低“同主体同动作但不同对象”的误合风险。
- 保留现有合并目标倾向：AI 返回同组后按 `itemCount` 降序选择 target，优先把少条目并入多条目；都是 `1` 时不加业务偏好。

## Out of Scope

- 不修改 AI merge prompt。
- 不新增依赖。
- 不调整摘要生成策略和日报展示逻辑。

## Acceptance

- singleton cluster 在 object/action/date/text anchors 足够强时会进入 AI merge 判断。
- `itemCount >= 2` 的旧有聚合组仍直接进入 AI merge 判断，不受 pair score 收窄影响。
- 多主体同一事件不会因为 `eventSubject` 不一致在预筛阶段被挡掉。
- 同主体、同动作、同日期但关键对象冲突的 singleton pair 不会发送给 AI。
- merge target 继续优先选择 `itemCount` 更多的 cluster。

## Execution

- 新增 cluster merge pair score 常量：主阈值 `70`、灰区阈值 `55`、高置信阈值 `95`。
- 在 cluster helpers 中新增候选构建逻辑：
  - 中文 bigram / 英文词 tokenization。
  - subject/object/action/date/title/summary/latestPublishedAt 综合打分。
  - object/date 明显冲突直接拒绝。
  - relational object token 允许多主体合作/合同/协议等场景进入候选。
  - `itemCount >= 2` 的旧有聚合组先直接入选，singleton 再按 pair score 增补。
  - selected candidates 按 `itemCount`、best score、latestPublishedAt 排序。
- 在 merge pass 中移除旧的 `itemCount >= 2` 数据库过滤，改为先读取可聚合来源下的 recent active clusters，再由 candidate builder 保留 `itemCount >= 2` 并筛出 singleton 补充候选。
- 将 merge input hash 扩展到 title/summary/event fields，避免语义字段变化后复用旧 hash 跳过判断。
- 补充单元和集成测试覆盖正例、反例和 AI 调用边界。

### Changed Files

| File | Change |
| --- | --- |
| `src/config/constants.ts` | 新增 cluster merge AI pair score 阈值常量 |
| `src/lib/clusters/helpers.ts` | 新增 singleton merge candidate 预筛、保留 `itemCount >= 2` 直接入选、pair scoring、排序与更完整的 merge input hash |
| `src/lib/clusters/service.ts` | `executeClusterMerge()` 改为读取可聚合 recent clusters 并调用本地 candidate builder；允许 singleton 进入 AI 复判 |
| `tests/unit/cluster-merge-candidates.test.ts` | 覆盖 `itemCount >= 2` 直接入选、多主体 singleton 正例与 object conflict 反例 |
| `tests/integration/cluster-assignment.test.ts` | 覆盖 executeClusterMerge 对 singleton candidates 的 AI 调用与实际合并，以及冲突 pair 不调用 AI |
| `tests/integration/item-cleanup.test.ts` | 修正既有测试的 `ItemStatus` 类型和未使用 import，保证类型检查通过 |
| `tasks/quick/singleton-event-merge-spike.md` | 更新本 quick task 为实现结果记录 |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npx @shawnxie666/forge-loop route "聚合合并是不是应该增加下检测同主体动作事件的单条目聚合，防止内容遗漏？" --json` | pass | 初始路由为 Quick Lane spike，用于方案分析 |
| `npx tsc --noEmit` | pass | 类型检查通过 |
| `npm run lint` | pass | 通过；仍有既有 warning：`src/components/admin/admin-page-client.tsx:130` 的 `_props` unused |
| `npm test -- tests/unit/cluster-merge-candidates.test.ts` | pass | 单元候选筛选测试通过，覆盖 `itemCount >= 2` 直接入选 |
| `npm test -- tests/integration/cluster-assignment.test.ts` | pass | 聚合归组/合并集成测试通过 |
| `npm test -- tests/integration/item-cleanup.test.ts` | pass | 相关集成测试通过 |
| `git diff --check` | pass | 无 whitespace/error marker 问题 |
| `npx @shawnxie666/forge-loop validate --slug singleton-event-merge-spike` | pass | workflow artifact 校验通过 |

## Contract Compliance

| Contract Area | Compliant | Notes |
| --- | --- | --- |
| API | yes | 未修改 HTTP/API 契约；`executeClusterMerge()` 返回结构保持不变 |
| Types | yes | 扩展 helper 内部候选类型和 hash 输入类型；已通过 `npx tsc --noEmit` |
| Auth | N/A | 未触碰权限和 session 路径 |
| State | yes | cluster merge 仍通过既有 `mergeClustersInternal()` 移动 item、删除空 source cluster、刷新 stats/hash |

## Spec Compliance Review

| Field | Value |
| --- | --- |
| Required | yes |
| Reviewer | self |
| Result | pass |
| Notes | 实现覆盖 `itemCount >= 2` 旧有聚合组直接入选、singleton 进入 merge pass、本地 pair score 预筛、subject 非硬门槛、object/date 冲突拒绝、`itemCount` 多者作为 merge target 的要求 |

## Code Quality Review

| Field | Value |
| --- | --- |
| Required | yes |
| Reviewer | self |
| Result | pass |
| Notes | 预筛逻辑集中在 helpers，service 只负责读取窗口候选和调用 builder；未新增依赖；测试覆盖正反例和 AI 调用边界。剩余可调参数已抽到 constants |

## Result

done

## Follow-ups

- 上线后建议观察每轮 `candidates`、AI 返回 groups、`mergedCount` 与误合样本；若候选量或误合偏高，优先把主阈值从 `70` 上调到 `80`，或扩展 direct reject。
- 如果后续发现更多多主体事件形态，可扩展 relational object tokens，但不应把 subject 恢复为硬门槛。

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| 是否允许将 singleton cluster 纳入自动 merge 候选？ | human | no | 已确认：用户要求按该方案实现 |

## Assumptions

- “内容遗漏”指多个单条 cluster 未归并，导致聚合摘要/日报候选不能把同一事件的多来源内容一起覆盖。
- 当前 merge pass 的 7 天窗口保持不变，只改变窗口内 AI 候选组的本地收窄方式。

## Risks

- 语义 hash 扩展后，已有 cluster 可能在部署后首次 merge pass 重新进入判断；这是预期行为，因为候选语义和筛选逻辑已变化。
- pair score 是首版保守阈值，需要结合线上候选量和误合/漏合样本继续校准。
- 本地预筛只决定 singleton 是否额外发给 AI；`itemCount >= 2` 旧有聚合组仍直接发给 AI，最终是否合并仍由 AI merge group 与现有 `mergeClustersInternal()` 执行路径决定。

## Validation

- 已通过类型检查、lint、新增/相关测试和 Forge Loop artifact 校验验证。
- Completion claim is based on fresh command results recorded in Commands Run.
