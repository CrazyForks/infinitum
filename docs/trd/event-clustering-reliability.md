---
id: trd-event-clustering-reliability
type: trd
status: accepted
created_at: 2026-06-29
updated_at: 2026-06-29
sources:
  - AGENTS.md
  - prisma/schema.prisma
  - src/config/constants.ts
  - src/config/prompts.ts
  - src/lib/ai/provider.ts
  - src/lib/clusters/helpers.ts
  - src/lib/clusters/repository.ts
  - src/lib/clusters/service.ts
  - src/lib/ingestion/service.ts
related: []
---

# TRD: 事件聚合可靠性改造

## 背景和目标

Infinitum 的聚合链路目标不是把相似主题合并，而是把多来源报道归入同一具体事件。当前系统已经采用“事件签名 + 本地候选筛选 + LLM 判定 + 后置合并”的设计，能够避免大量主题级误合并，但仍存在两类长期风险：

- 漏聚合：LLM 一次性误判、事件签名不完整、不同来源表述差异过大，导致同一事件分裂成多个聚合组。
- 错聚合：同一公司、同一产品类别或相近主题被误认为同一事件，合并后影响 feed 展示、摘要、后续推荐和人工管理。

本方案的目标是把聚合从“LLM 判一次并立即改变结构”升级为“候选召回、证据裁决、状态沉淀、可复判、可回滚”的事件身份系统。

非目标：

- 不把 Infinitum 改成通用知识图谱或实体管理平台。
- 不追求完全自动化消除所有灰区判断；灰区应进入复判或人工审核。
- 不改变 public feed 的时间过滤语义；feed 仍以 `items.createdAt` 表示系统摄入时间窗口。
- 不用更复杂 prompt 取代结构性改造。

## 当前系统上下文

当前聚合链路包含三段：

1. 单条内容处理阶段生成摘要、质量分、标签和事件签名。
2. `assignItemToCluster` 根据 fingerprint、标题、候选分数和 LLM `matchClusterCandidate` 将 item 归入现有 cluster 或创建新 cluster。
3. 摄入批次末尾执行 `executeClusterMerge`，在 7 天窗口内选出 cluster pair，由 LLM `mergeClusters` 确认是否合并。

关键约束：

- 聚合候选窗口由 `CLUSTER_LOOKBACK_MS` 控制，当前为 7 天。
- `ContentCluster.fingerprint` 当前为唯一字段。
- `clusterMergeCleanPairCandidate` 已经能缓存 clean-clean pair，但只能表达“待复判候选”，不能完整表达判断历史、人工约束和失败语义。
- 当前 prompt 已要求只合并同一具体事件，但 prompt 不是可靠边界。
- 后台任务有同步 admin action 和 worker execution 两条路径，聚合相关改造必须覆盖两者。

## 设计原则

1. 召回可以更宽，自动执行必须更保守。
2. 明确事实边界：同一事件判断优先看主体、动作、对象、事件日期、来源时间窗和结果，不以主题相近为准。
3. LLM 只能作为证据提供者或裁决者之一，不能作为唯一状态来源。
4. 失败、空输出、拒绝合并、人工拆分都要沉淀为可查询状态，而不是丢在日志或单次任务结果里。
5. 自动错合并的成本高于短期漏合并；灰区默认不自动合并。

## 技术设计

### 分层架构

#### 1. Event Identity 层

负责生成和维护事件身份锚点。

输入：

- item event signature: `eventType`, `eventSubject`, `eventAction`, `eventObject`, `eventDate`
- title / translatedTitle / summary
- source, publishedAt, createdAt
- optional embedding / normalized entity aliases

输出：

- `eventFingerprint`: 稳定事件指纹，不直接作为全局唯一聚合键。
- `eventBucket`: 时间桶，优先使用 `eventDate`，缺失时使用 `publishedAt` 周期桶。
- `eventIdentityKey`: `eventFingerprint + eventBucket` 或等价结构。
- `identityConfidence`: 完整事件签名、高质量对象锚点、明确日期等证据得分。

#### 2. Candidate Recall 层

负责尽量捞出可能相关的 item/cluster，但不直接合并。

召回来源：

- 当前 fingerprint / title exact match。
- 事件签名本地打分。
- cluster merge pair 本地规则。
- 可选 embedding 相似召回。
- 已沉淀的 must-link / cannot-link。
- clean pair 预计算结果。

召回策略：

- 对完整事件签名候选保持现有严格本地评分。
- 对不完整签名候选允许进入低置信候选池，但禁止直接自动合并。
- 对跨主体关系型事件保留 bridge 逻辑，但要求 object/date/source time window 至少有一个强锚点。

#### 3. Decision Ledger 层

新增决策账本，记录每一次 item-cluster 或 cluster-cluster 判断。

它不是 feed 展示数据，而是聚合可靠性的状态源。

建议数据模型：

```prisma
enum ClusterDecisionKind {
  item_cluster
  cluster_pair
}

enum ClusterDecisionVerdict {
  approved
  declined
  ambiguous
  failed
}

enum ClusterDecisionSource {
  local_rule
  llm
  manual
  system
}

model ClusterDecision {
  id              String                @id @default(cuid())
  kind            ClusterDecisionKind
  source          ClusterDecisionSource
  verdict         ClusterDecisionVerdict
  leftItemId      String?
  rightItemId     String?
  leftClusterId   String?
  rightClusterId  String?
  pairKey         String
  inputHash       String
  modelName       String?
  promptHash      String?
  localScore      Int?
  confidence      Int?
  reasonCode      String?
  reasonText      String?
  attemptCount    Int                   @default(0)
  expiresAt       DateTime?
  createdAt       DateTime              @default(now())
  updatedAt       DateTime              @updatedAt

  @@index([kind, pairKey, inputHash])
  @@index([verdict, expiresAt])
  @@index([leftClusterId])
  @@index([rightClusterId])
  @@map("cluster_decisions")
}
```

`pairKey` 需要稳定、无方向。`inputHash` 由参与判断的 item/cluster 快照生成，内容变化后允许重新判断。

#### 4. Constraint 层

新增显式约束，用于沉淀人工和高置信系统判断。

建议数据模型：

```prisma
enum ClusterConstraintKind {
  must_link
  cannot_link
}

enum ClusterConstraintScope {
  item_item
  item_cluster
  cluster_cluster
  event_identity
}

model ClusterConstraint {
  id             String                 @id @default(cuid())
  kind           ClusterConstraintKind
  scope          ClusterConstraintScope
  leftId         String
  rightId        String
  pairKey        String
  reason         String?
  createdBy      String                 @default("system")
  createdAt      DateTime               @default(now())
  expiresAt      DateTime?

  @@unique([kind, scope, pairKey])
  @@index([expiresAt])
  @@map("cluster_constraints")
}
```

规则：

- 人工合并写入 `must_link`。
- 人工拆分、detach、split 写入 `cannot_link`。
- 明确 object/date hard conflict 可写入短 TTL `cannot_link`。
- 自动合并前必须检查 `cannot_link`。
- 复判时优先使用 `must_link`，但仍需处理目标 cluster 已删除或隐藏的情况。

#### 5. Execution 层

把“判定”和“执行合并”解耦。

自动执行等级：

| 等级 | 条件 | 动作 |
|---|---|---|
| `auto_merge` | 高置信 identity 命中，或本地强分 + LLM approved + 无 hard conflict + 无 cannot-link | 自动合并 |
| `provisional` | 有较强召回证据但缺少完整签名，或 LLM 与本地信号不一致 | 暂不合并，记录候选并进入复判 |
| `review` | LLM approved 但存在弱冲突、多主体桥接、跨时间桶或低置信对象 | 管理端展示人工审核 |
| `decline` | hard conflict、LLM declined、人工 cannot-link | 不合并，按 TTL 或 inputHash 控制复判 |
| `failed` | LLM 超时、空输出、解析失败、熔断 | 不标记为 clean，不消耗最终判断次数 |

## 数据和状态流

### Item 初次归组

1. 内容分析生成事件签名。
2. 生成 `eventFingerprint` 和 `eventBucket`。
3. 查找同 bucket 内 candidate cluster。
4. 本地评分得到 candidate set。
5. 检查 constraints。
6. 高置信 exact identity 可直接归组。
7. 中低置信候选进入 LLM match。
8. 写入 `ClusterDecision`。
9. 只有 `auto_merge` 或 must-link 才改变 `items.clusterId`。
10. 否则创建 singleton cluster，并等待 batch merge/recheck。

### Cluster 批量合并

1. 找出 dirty cluster 和有效 clean precomputed candidates。
2. 基于本地规则生成 pair。
3. 过滤 cannot-link。
4. 对 pair 调 LLM merge。
5. 写入每个 pair 的 decision。
6. 只有 approved 且满足自动执行等级的 pair 才合并。
7. ambiguous/review 写入审核候选。
8. failed 不更新 clean 状态，不阻断下次重试。

### 人工操作反馈闭环

- `moveItemToCluster` / 手动合并：写入 must-link。
- `detachItemFromCluster` / `splitClusterIntoSingletons`：写入 cannot-link。
- 人工修改后触发 affected cluster recompute。
- 后续自动任务必须尊重人工约束。

## 关键改造点

### 1. 修复 fingerprint 全局唯一风险

当前 `createContentCluster` 通过 `fingerprint` 全局 upsert。应避免不同时间发生的同类事件被写回旧 cluster。

可选方案：

1. 推荐：新增 `eventFingerprint` 和 `eventBucket` 查询索引；继续用带 bucket 的 `fingerprint` 兼容键承载唯一写入约束，避免聚合关闭源或人工拆分后的 singleton 因共享事件身份而冲突。
2. 兼容方案：保留 `fingerprint` 字段但改写为带 bucket 的值。
3. 低风险过渡：创建 cluster 前先按窗口查询；若 upsert 返回窗口外 cluster，则创建 `fingerprint-single/item` 临时 cluster，并异步迁移 schema。

推荐采用方案 1，因为它把事件身份和展示 cluster 解耦，后续可支持更清晰的复判。

### 2. LLM failure 不应标记为 clean

当 `mergeClusters` 调用失败、返回空内容或解析失败时：

- 写入 `ClusterDecision(verdict=failed)`。
- 不更新相关 cluster 的 `mergeInputHash`。
- 不增加 declined attempt。
- 下次任务仍可复判。

只有 LLM 成功返回明确 `approvedPairs` 或明确空数组时，才能写入 approved/declined。

### 3. Declined pair 使用分级 TTL，而不是永久沉默

LLM declined 可能是一时误判，尤其是输入摘要不足、模型 reasoning 被截断或候选 pair 太多时。

规则：

- 对 clean-clean declined pair 写入 `expiresAt`，按相同 `pairKey + inputHash` 的拒绝次数分级冷却。
- 第一次 declined 后 6 小时内不重复判定。
- 第二次 declined 后 24 小时内不重复判定。
- 第三次 declined 后 48 小时内不重复判定。
- 超过三次 declined 后，相同 `pairKey + inputHash` 不再进入自动判定。
- inputHash 变化、cluster itemCount 增长、summary 更新、人工操作后重置复判机会。

### 4. Hard conflict 和 cannot-link 优先级最高

以下情况禁止自动合并：

- eventDate 明确且不同。
- eventObject 强冲突，且无 relational bridge。
- 人工 cannot-link。
- 用户拆分后的同一 pair 在 constraint TTL 内再次出现。

LLM approved 不能覆盖这些 hard constraints，只能进入 review。

### 5. 增加灰区审核面

管理端内容审核已有 cluster 管理能力，应扩展为单入口审核，而不是新增平行后台。

新增视图建议：

- “疑似漏聚合”：provisional / ambiguous pair。
- “模型建议合并”：LLM approved 但未自动执行的 review pair。
- “自动拒绝原因”：object conflict、date conflict、no event anchor、cannot-link。

操作：

- 合并 pair。
- 永久/临时忽略 pair。
- 拆分并写入 cannot-link。
- 查看本地证据、LLM reason、来源条目。

## 接口和模块边界

### `src/lib/clusters/identity.ts`

新增事件身份构造：

- `buildEventFingerprint(signature)`
- `buildEventBucket(item)`
- `buildEventIdentityKey(signature, item)`
- `scoreEventIdentityConfidence(input)`

### `src/lib/clusters/decisions.ts`

新增决策账本服务：

- `recordClusterDecision(input)`
- `findLatestDecision(pairKey, inputHash)`
- `shouldRetryDecision(decision, now)`
- `markDecisionApplied(decisionId)`

### `src/lib/clusters/constraints.ts`

新增约束服务：

- `createMustLink(input)`
- `createCannotLink(input)`
- `findBlockingConstraint(pairKey)`
- `filterBlockedPairs(pairs)`

### `src/lib/clusters/service.ts`

保留主编排职责，但不直接承载全部判断历史。

调整点：

- `assignItemToCluster` 接入 identity/decision/constraint。
- `executeClusterMerge` 区分 failed、declined、ambiguous 和 approved。
- `mergeClustersInternal` 合并前二次检查 constraints。
- 手动 detach/split/merge 写入 constraints。

### `src/lib/ai/provider.ts`

保持 LLM provider 抽象，但需要区分三种结果：

- 成功且有明确 verdict。
- 成功但 ambiguous。
- 调用/解析失败。

当前 `mergeClusters` 只返回 `string[][]`，未来应改为结构化结果：

```ts
type ClusterMergeVerdict = {
  leftId: string;
  rightId: string;
  verdict: "approved" | "declined" | "ambiguous";
  confidence?: number;
  reason?: string;
};
```

兼容期可先在 provider 内把 `approvedPairs` 映射为 approved，其余输入 pair 映射为 declined。

## 兼容、迁移和回滚

### 迁移

1. 添加新表：`cluster_decisions`, `cluster_constraints`。
2. 添加 cluster identity 字段：`eventFingerprint`, `eventBucket`。
3. 回填现有 active cluster 的 identity 字段。
4. 对历史 fingerprint 冲突仅记录，不自动重组历史 cluster。
5. 新写入路径启用 identity key。

### 部署顺序

1. 先部署 schema 和只写不读的 decision/constraint 记录。
2. 再让 merge pass 使用 decision ledger。
3. 再切换 fingerprint 创建逻辑。
4. 最后增加管理端审核视图。

### 回滚

- 新表不影响旧 feed 读取，可保留。
- 若新裁决逻辑异常，可通过 feature flag 回退到旧 `assignItemToCluster` / `executeClusterMerge` 行为。
- 已执行的错误合并需要通过 manual split 恢复，并写入 cannot-link 防止再次合并。

建议 feature flags：

- `CLUSTER_DECISION_LEDGER_ENABLED`
- `CLUSTER_IDENTITY_BUCKET_ENABLED`
- `CLUSTER_REVIEW_QUEUE_ENABLED`
- `CLUSTER_EMBEDDING_RECALL_ENABLED`

## 可靠性和性能

### 可靠性

- LLM failure 不改变结构。
- 自动合并前做 constraints 二次检查。
- 合并操作保持事务边界，避免只移动部分 items。
- merge 后必须触发 `recomputeCluster` 和 `invalidateFeedCache()`。
- 人工操作优先级高于系统自动判断。

### 性能

- decision/constraint 查询必须按 `pairKey` 和 `inputHash` 命中索引。
- embedding 召回如引入，应离线预计算，不阻塞单条 item 处理。
- clean pair 预计算继续承担 CPU 密集型 pair scoring，主摄入链路只消费有限候选。
- 管理端 review queue 分页读取，不在 feed 请求中实时计算。

### 观测

任务 timeline 应继续暴露现有 cluster merge counters，并新增：

- `decisionsApproved`
- `decisionsDeclined`
- `decisionsAmbiguous`
- `decisionsFailed`
- `blockedByCannotLink`
- `mustLinkApplied`
- `reviewPairsCreated`
- `fingerprintBucketCollisions`
- `mergeRetriedAfterFailure`

日志需要包含 pairKey、decision id、reasonCode、inputHash 前缀，但不要记录完整正文。

## 测试策略

### 单元测试

- event fingerprint 和 bucket 构造。
- pairKey 无方向稳定性。
- decision retry / TTL 规则。
- constraint blocking 优先级。
- LLM parse failure 与 explicit declined 的区别。

### 集成测试

- 同主体同对象但相隔很久且无 eventDate 时，不应归入旧 cluster。
- LLM merge failure 后，下次 merge pass 仍会重试。
- LLM declined 后，在 TTL 内不重复打扰；inputHash 变化后可复判。
- 人工 split 后 cannot-link 阻止自动重新合并。
- 人工 merge 后 must-link 优先于普通 local scoring。
- hard date conflict 即使 LLM approved 也不自动合并。

### 回归测试

- 聚合关闭 source 的 item 仍保持 singleton 行为。
- 聚合拆条 child 仍可参与聚合。
- public feed cluster/single item mixing 不变。
- cluster recompute 后 feed cache 正确失效。
- admin 手动合并、拆分、移动 item 流程不破坏现有 API。

## 权衡和替代方案

### 方案 A：继续调 prompt 和阈值

优点：实现成本低。

缺点：无法解决 LLM 一时误判、失败语义丢失、人工反馈不沉淀、fingerprint 全局唯一等结构问题。

结论：只能作为短期补丁，不作为主方案。

### 方案 B：完全依赖 embedding 聚类

优点：召回率高，能覆盖不同表述。

缺点：主题相似会显著增加误合并风险，还需要向量存储、重算和阈值治理。

结论：可作为 Candidate Recall 的补充，不应直接决定自动合并。

### 方案 C：事件身份 + 决策账本 + 约束系统

优点：可解释、可复判、可回滚，能同时压低漏聚合和错聚合风险。

缺点：需要 schema、服务层和管理端协同改造。

结论：推荐方案。

## 已确认产品和策略决策

- `eventBucket` 粒度：有明确 `eventDate` 时按事件日期；缺失 `eventDate` 时按 `publishedAt` 周桶。无明确日期的同类事件跨周默认不自动归同一组。
- `declined` 复判节奏：第一次拒绝后 6 小时、第二次 24 小时、第三次 48 小时；超过三次后，相同输入不再进入自动判定。
- 人工 `cannot-link`：默认永久有效，管理员可手动删除；人工判断优先级高于后续模型判断。
- Review queue：第一阶段直接接入现有“内容审核 / 聚合管理”入口，展示未应用的 `approved` / `ambiguous` cluster pair，支持“合并”和“忽略并写入 cannot-link”，不新增平行后台。
- Embedding：第一阶段不引入，先打牢 event identity、decision ledger、constraint feedback 和人工复核闭环；后续如要扩大召回，再作为 Candidate Recall 的补充能力评估。

## 执行计划输入

推荐分阶段落地：

1. `Decision Ledger Foundation`：新增 schema、pairKey/inputHash helper、只写型 decision 记录，不改变现有行为。
2. `Safe Failure Semantics`：区分 LLM failed 和 declined；failed 不 mark clean，不消耗复判次数。
3. `Constraints Feedback Loop`：人工 merge/split/detach 写入 must-link/cannot-link，自动合并前检查 constraints。
4. `Identity Bucket Migration`：新增 event fingerprint/bucket，修复全局 fingerprint upsert 风险。
5. `Review Queue`：在现有内容审核入口展示 ambiguous/review pair。
6. `Recall Expansion`：在状态闭环稳定后再评估 embedding 或别名归一。

每个阶段都需要独立验证，并保持 public feed 行为不变。
