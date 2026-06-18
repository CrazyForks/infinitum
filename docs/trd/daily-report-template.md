# 日报模板可配置化（Daily Report Template）

> Issue: [#8 建议日报模版格式模版可以调整](https://github.com/shawnxie94/infinitum/issues/8)
> 状态: 草案（待评审）
> 范围: Stage 1 — Prompt 自由配置 + 渲染解耦

---

## 1. 背景与目标

### 1.1 问题

当前 AI 日报的输出结构在代码层是**强类型 + 常量**硬编码（5 个固定栏目、5 套 item 类型、Prompt 写死 JSON Schema）。由于用户订阅源差异较大（参见 #8），希望可调整模板。

### 1.2 核心思路

两件事：

1. **Prompt 自由配置** — 用户在 `PromptConfig.daily_report` 里直接编辑 systemPrompt，自定义栏目名/字段/数量/首尾标题
2. **渲染/校验/导出解耦** — 不再依赖 `DAILY_REPORT_SECTION_NAMES` 常量，改为遍历 `content.sections` 的实际 key

### 1.3 用户可配置范围

通过修改 `PromptConfig.daily_report` 的 systemPrompt：

- 栏目名 / 顺序 / 数量 / item 字段 — 全部自由
- item 形态 — top/action/risk/tool/insight 5 种参考，自由组合
- 首尾段落标题 — `openingLabel` / `closingLabel`，1–20 字

### 1.4 目标

- 管理员可在 Prompt 配置页直接编辑 daily_report 的 systemPrompt
- 改栏目 / 字段 / 首尾标题后，模型输出和前端展示都跟着变
- 渲染 / 校验 / 质量 / 导出 / RSS 不写死 5 栏
- 已有日报数据**无影响**（content 自包含，老数据首尾标题 fallback 到 "摘要" / "今日观察"）

### 1.5 非目标

- UI 表单拖排栏目（用户直接改 prompt 即可）
- 按"组/订阅"绑定不同模板
- 模板版本管理 / 导入导出
- 强制 item 字段约束（itemType 枚举化）

---

## 2. 关键决策

| 决策点 | 选择 | 理由 |
|---|---|---|
| 配置位置 | 复用现有 `PromptConfig`（type=`daily_report`） | 不多一层概念 |
| 内部 key | `Record<string, DailyReportItem[]>` | 不写死字面量 key |
| 渲染时读谁 | `content.sections` 的 key | 自包含，模板/Prompt 改了不影响历史 |
| item 形态约束 | 只校验 `topic` + `sourceIds` | 其余字段交给 prompt |
| 老数据兼容 | 完全无影响 | 渲染不查常量、不查 prompt |
| 新增表 / UI / API | 零 | 极简实现 |
| 首尾标题位置 | 存到 `DailyReportContent` 可选字段 | 与 sections 一致；不存全局配置（避免老数据被全局污染 + 改 prompt 才能改标题 + 零新存储） |

---

## 3. 设计方案

### 3.1 Prompt 端

默认 prompt 保持 5 栏示例，措辞改为"以下为参考示例，可调整"，固定格式中加 `openingLabel` / `closingLabel` 字段提示。用户改 systemPrompt 即可，不引入"栏目拼装"工厂。

### 3.2 类型（`src/lib/daily-report/types.ts`）

```ts
// 删：DAILY_REPORT_SECTION_NAMES、DailyReportSectionName

export type DailyReportItem = {
  topic: string;
  sourceIds: number[];
  [key: string]: unknown;  // 任意字段
};

export type DailyReportContent = {
  openingLabel?: string;     // 缺省 → DEFAULT_OPENING_LABEL
  openingSummary: string;
  sections: Record<string, DailyReportItem[]>;
  closingLabel?: string;     // 缺省 → DEFAULT_CLOSING_LABEL
  closingThought: string;
};

export const DEFAULT_OPENING_LABEL = "摘要";
export const DEFAULT_CLOSING_LABEL = "今日观察";
```

现存的 `DailyReportTopItem/ActionItem/...` 保留（向后兼容），但 `DailyReportItem` 为通用形态。

### 3.3 校验（`src/lib/daily-report/validator.ts`）

遍历 `Object.entries(sectionsInput)`：

- 每条 item 必须有 `topic`（≥4 字）和 `sourceIds`（≥1 个合法）
- `openingLabel` / `closingLabel` 缺省不报错；有值时 ≤20 字
- `openingSummary` ≥40 字、`closingThought` ≥30 字
- 所有 section 合计 ≥1 条 item

不再校验"必须存在今日大事/变更与实践"硬约束；不再按 itemType 限制字段；保留所有用户自定义字段。

### 3.4 渲染（`src/lib/daily-report/renderer.ts`）

```ts
const openingHeading = escapeMarkdown(content.openingLabel ?? DEFAULT_OPENING_LABEL);
const closingHeading = escapeMarkdown(content.closingLabel ?? DEFAULT_CLOSING_LABEL);

const lines = [`# ${title}`, "", `> ${DAILY_REPORT_AI_NOTICE}`, "",
  `## ${openingHeading}`, "", content.openingSummary, ""];

for (const [sectionName, items] of Object.entries(content.sections)) {
  if (items.length === 0) continue;
  lines.push(`## ${escapeMarkdown(sectionName)}`, "");
  for (const item of items) {
    lines.push(`### ${escapeMarkdown(item.topic)}`);
    lines.push(...renderItemBody(item));
    const sourceLines = formatSources(item.sourceIds, sourcesByNumber);
    if (sourceLines.length > 0) lines.push("", "**来源：**", ...sourceLines);
    lines.push("");
  }
}
lines.push(`## ${closingHeading}`, "", content.closingThought, "");
```

`renderItemBody(item)` 通用化：

```ts
function renderItemBody(item: DailyReportItem): string[] {
  const fieldOrder = ["summary", "whyImportant", "action", "affected", "reason", "keyNumbers"];
  const lines: string[] = [];
  const pushed = new Set<string>();
  for (const key of fieldOrder) {
    const v = item[key];
    if (typeof v === "string" && v.trim()) { lines.push(escapeMarkdown(v)); pushed.add(key); }
  }
  for (const [key, value] of Object.entries(item)) {
    if (pushed.has(key) || key === "topic" || key === "sourceIds") continue;
    if (typeof value === "string" && value.trim()) lines.push(`**${escapeMarkdown(key)}：** ${escapeMarkdown(value)}`);
    else if (value != null) lines.push(`**${escapeMarkdown(key)}：** ${escapeMarkdown(String(value))}`);
  }
  return lines;
}
```

**对老 itemType 兼容**（duck typing 顺序处理）：
- top: summary → whyImportant
- action: action
- risk: affected → action
- tool: reason
- insight: reason → keyNumbers

### 3.5 质量评分（`src/lib/daily-report/quality.ts`）

`computeSectionFillRate` 遍历 `content.sections` 的实际 key，bucketMap 动态聚合。导出（`export.ts`）和 service（`service.ts` 的 `getSectionSourceIds` 等）同样改为遍历 `content.sections`。

### 3.6 流程

```
1. 用户改 prompt → 保存（现有 POST/PATCH /api/admin/settings/prompt-configs）
2. service.generateDailyReport → 读 promptConfig.systemPrompt → 调模型
3. parseDailyReportContent（通用校验）→ 存 summaryJson
4. renderDailyReportMarkdown（遍历 content.sections + fallback）→ 渲染/RSS/导出
```

---

## 4. 文件改造清单

| 文件 | 改动 |
|---|---|
| `src/lib/daily-report/types.ts` | 删 `DAILY_REPORT_SECTION_NAMES` / `DailyReportSectionName`；`sections` 改 `Record<string, DailyReportItem[]>`；新增 `DailyReportItem` 通用类型；`DailyReportContent` 加 `openingLabel?` / `closingLabel?` 可选字段 + `DEFAULT_OPENING_LABEL` / `DEFAULT_CLOSING_LABEL` 兜底常量 |
| `src/lib/daily-report/validator.ts` | 重写 `parseDailyReportContent` 通用化；额外校验 `openingLabel` / `closingLabel` ≤20 字，缺省不报错 |
| `src/lib/daily-report/renderer.ts` | 遍历 `content.sections`；新增 `renderItemBody` 通用渲染；首尾标题读 `content.openingLabel ?? DEFAULT_OPENING_LABEL` |
| `src/lib/daily-report/quality.ts` | `computeSectionFillRate` 遍历 `content.sections` |
| `src/lib/daily-report/export.ts` | `buildFallbackMarkdown` 遍历 + `renderItemBody`；首尾同样 fallback |
| `src/lib/daily-report/service.ts` | `getSectionSourceIds` 等辅助函数遍历 `content.sections` |
| `src/config/prompts.ts` | 默认 prompt 加"可调整"说明 + `openingLabel` / `closingLabel` 字段提示 |
| `src/lib/settings/core.ts` | 同步副本 + `upgradeLegacyDailyReportPrompt`（见 §6） |
| `tests/unit/daily-report.test.ts` | fixture 改 `Record<string, ...>` 形式 + 新增 4 类用例 |
| `tests/integration/daily-report-service.test.ts` | fixture 改通用形式 + "自定义栏目" / "老 5 栏继续渲染" |
| `tests/integration/daily-report-quality.test.ts` | fixture 改通用形式 |
| `tests/integration/admin-daily-report-api.test.ts` | fixture 改通用形式 |
| `tests/components/daily-report-detail.test.tsx` | fixture 改通用形式 + 5 栏 markdown 快照 |

**无新增**：表、UI 子 Tab、CRUD API、模板表相关 service。

---

## 5. 风险与错误

| 场景 | 行为 | 风险等级 |
|---|---|---|
| 模型输出 sections 缺 key | 无影响（动态 key） | — |
| 模型输出全空 sections | Validator 抛"所有 section ≥1 条 item" | 低 |
| 模型某条缺 topic/sourceIds | Validator 抛对应错误 | — |
| 老 5 栏日报渲染 | duck typing 字段渲染，**展示完全一致** | 中（format 守门） |
| 用户改 prompt 改了字段名拼写 | 通用渲染会输出 `**impacted：** ...` 仍能看 | — |
| Validator 通用化放过非法结构 | 保留 `topic` + `sourceIds` 强校验；其他靠 prompt | 中 |
| 字段渲染顺序用户不可控 | 通用化按"已知字段顺序表"输出；用户改 prompt 即可调 | 中 |
| 质量评分 bucket 跨用户不一致 | `sectionFillRate` 反映用户实际栏目，不强制 5 桶 | 中 |
| AGENTS.md / 旧文档说"5 栏固定"误导 | PR 4 更新文档 | 低 |

---

## 6. 生产环境兼容（关键）

### 6.1 升级策略

生产 DB 里 `prompt_configs` 表通常有 1 条 `type=daily_report, isDefault=true` 的默认 systemPrompt。**用特征字符串识别"未改过的旧默认"**，自动升级；用户改过的永远不动。

```ts
// src/lib/settings/core.ts
const LEGACY_DAILY_REPORT_PROMPT_MARKER =
  '"今日大事":[{"topic":"...","summary":"...","whyImportant":"...","sourceIds":[1,2]}]';

async function upgradeLegacyDailyReportPrompt(tx, fileConfig) {
  const sampling = getDefaultPromptSampling(PromptConfigType.daily_report);
  await tx.promptConfig.updateMany({
    where: {
      type: PromptConfigType.daily_report,
      isDefault: true,
      systemPrompt: { contains: LEGACY_DAILY_REPORT_PROMPT_MARKER },  // 旧 5 栏指纹
    },
    data: {
      systemPrompt: resolveSystemPromptByType(PromptConfigType.daily_report, fileConfig),
      maxTokens: sampling.maxTokens,
      temperature: sampling.temperature,
      topP: sampling.topP,
    },
  });
}
```

在 `ensureRuntimeConfigSeeded` 事务里调用，幂等。

### 6.2 三种生产场景

| 场景 | DB 现状 | 升级后 | 用户感知 |
|---|---|---|---|
| A. 未改过默认 | systemPrompt 是旧 5 栏硬编码 | 自动升级到新默认 | 无（5 栏输出行为不变） |
| B. 改过默认 | systemPrompt 是用户写的 | 跳过，保留用户原文 | 完全无影响 |
| C. 改过 prompt 没改 systemPrompt | systemPrompt 旧 + prompt 用户改的 | 只升 systemPrompt，保留 prompt | systemPrompt 措辞微调 |

### 6.3 老数据 summaryJson 兼容

`openingLabel` / `closingLabel` 缺省走 `?? DEFAULT_*_LABEL` 兜底；5 栏字段走 duck typing 渲染。**老数据 100% 兼容，无数据迁移**。

### 6.4 运维操作

部署新代码 → 下次启动自动检测并升级未改过的默认 prompt（事务里 updateMany，幂等、可回滚）。日志：`[seed] upgraded N legacy daily_report systemPrompt(s)`。

### 6.5 测试用例

`tests/integration/admin-settings-service.test.ts` 新增：
- 未改过默认 systemPrompt → 升级后含"可调整"措辞
- 改过默认 systemPrompt → 升级后内容不变
- 非默认 systemPrompt → 升级后内容不变
- systemPrompt 为 null → 升级后仍为 null
- 升级幂等性（跑两次种子后内容稳定）

---

## 7. 测试策略

**单元测试**（`tests/unit/daily-report.test.ts`）：fixture 改通用 Record 形式 + "自定义栏目渲染" / "未知字段保留" / "validator 通用化" / "首尾标题配置化"（含 / 缺省 / >20 字）4 类用例。

**集成测试**：
- `tests/integration/daily-report-service.test.ts` — fixture 改通用 + "用自定义栏目 prompt 生成 → content.sections 反映新栏目" + "老 5 栏数据继续渲染"
- `tests/integration/daily-report-quality.test.ts` — fixture 改通用 + 验证 `sectionFillRate` 跨栏目聚合
- `tests/integration/admin-daily-report-api.test.ts` — fixture 改通用

**组件测试**（`tests/components/daily-report-detail.test.tsx`）：5 栏 markdown 快照（向后兼容）+ "自定义栏目" 渲染快照。

**回归**：`npm run test` / `npm run lint` / `npm run build` / 手动 admin 编辑 prompt → 触发生成。

---

## 8. 实施切片

### PR 1: 类型与 validator/renderer 解耦（核心）
- types.ts / validator.ts / renderer.ts / export.ts 改造
- 跑现有测试，必要时修 fixture
- 风险：中

### PR 2: 质量评分 / service 适配
- quality.ts / service.ts 辅助函数
- 跑现有测试
- 风险：低

### PR 3: 默认 prompt 措辞调整 + 生产环境升级逻辑
- `src/config/prompts.ts` 措辞 + 同步 `src/lib/settings/core.ts`
- 新增 `upgradeLegacyDailyReportPrompt`（§6）
- 新增测试：自定义栏目 / 首尾标题配置化 / 5 条生产兼容升级场景
- 风险：中

### PR 4: 文档与发布
- 更新 AGENTS.md（移除"5 栏"硬约束）
- CHANGELOG（标注默认 prompt 微调 + 新能力）
- 在 #8 留 closing comment，附 PR 链接 + §6 升级说明
- 风险：低

---

## 9. 参考

- Issue: https://github.com/shawnxie94/infinitum/issues/8
- 现状代码：
  - `src/lib/daily-report/types.ts:1-11, 84-91`
  - `src/lib/daily-report/renderer.ts:60-90`
  - `src/lib/daily-report/validator.ts:1-123`
  - `src/lib/daily-report/quality.ts:1-142`
  - `src/lib/daily-report/export.ts:1-30`
  - `src/config/prompts.ts:73-90`
  - `src/lib/settings/core.ts:64-90`
