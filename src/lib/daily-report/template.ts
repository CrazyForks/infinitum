export type DailyReportTemplateNote = {
  label: string;
  required: boolean;
  instruction: string;
};

export type DailyReportTemplateTextBlock = {
  type: "text";
  title: string;
  bodyInstruction: string;
};

export type DailyReportTemplateSectionBlock = {
  type: "section";
  title: string;
  description: string;
  item: {
    bodyInstruction: string;
    notes: DailyReportTemplateNote[];
  };
};

export type DailyReportTemplateBlock = DailyReportTemplateTextBlock | DailyReportTemplateSectionBlock;

export type DailyReportTemplateConfig = {
  headlineInstruction: string;
  recentTopicRules: string[];
  blocks: DailyReportTemplateBlock[];
  globalRules: string[];
};

export const DAILY_REPORT_SYSTEM_ROLE_PROMPT =
  "你是中文 AI 新闻日报编辑。请只基于输入候选内容生成一份 Briefing 型 AI 日报。最终响应必须是单个合法 JSON 对象；不要输出代码块、Markdown 文档、前后说明或任何 JSON 之外的文本。JSON 字段内仅在模板规则允许时使用有限行内 Markdown。";

export const DEFAULT_DAILY_REPORT_HEADLINE_INSTRUCTION =
  "基于最终输出的“热点事件”栏目全部条目生成标题主题，在 64 字限制内尽量覆盖每个热点事件的核心主体或动作；主题数量不固定，不强行凑数，也不要从其他栏目或趋势观察中提炼抽象主题；用“、”分隔；不要包含日期、年份、日报、AI 日报、Markdown、引号或尾随标点；会与“MM-DD日报 | ”前缀合成最终标题。";

export const DEFAULT_DAILY_REPORT_RECENT_TOPIC_RULES = [
  "如果候选内容与最近 7 天已写主题只是同一事件的重复报道，不要再次写入。",
  "如果确有新动作、新数据、新影响或状态变化，可以写入，但必须写成后续进展，避免重复介绍背景。",
  "不要因为同一公司、同一模型或同一抽象主题相似就机械过滤；判断重点是是否有新的事实增量。",
];

export const DEFAULT_DAILY_REPORT_TEMPLATE: DailyReportTemplateConfig = {
  headlineInstruction: DEFAULT_DAILY_REPORT_HEADLINE_INSTRUCTION,
  recentTopicRules: DEFAULT_DAILY_REPORT_RECENT_TOPIC_RULES,
  blocks: [
    {
      type: "text",
      title: "摘要",
      bodyInstruction:
        "约 100-180 字。概括本期 AI 领域最关键的事项和主线变化，优先覆盖重大发布、模型/产品进展、产业合作、安全风险、开源工具或关键数据。格式固定为“{{date}} AI 领域呈现...，值得关注的信息：...”，例如：“2026-04-29 AI 领域呈现多线并进格局，值得关注的信息：...”。可使用有限 Markdown 行内标记突出关键信息：用 **加粗** 标注事件主体、关键变化、数字或结论，用 *斜体* 标注必要背景或不确定性；不要使用链接、图片、标题、表格或列表。",
    },
    {
      type: "section",
      title: "热点事件",
      description:
        "输出 3-5 条。优先综合参考 candidateScore、sourceCount、itemCount 和日期相关性；在新闻价值接近时优先选择更热、多源确认、eventDate 明确等于日报日期，或能从 publishedAt/正文判断发生于日报日期的事项。不要机械按日期或热度排序。",
      item: {
        bodyInstruction:
          "每条正文约 120-260 字。覆盖事件主体、动作、结果、背景与影响；可使用有限 Markdown 行内标记：**加粗** 用于主体、关键结果、数字或建议，*斜体* 用于背景或不确定性。",
        notes: [
          {
            label: "重点",
            required: true,
            instruction: "不超过 30 字，说明为什么值得关注。",
          },
        ],
      },
    },
    {
      type: "section",
      title: "变更与实践",
      description: "输出 2-5 条。聚焦产品、模型、工程实践和生态变化。每条只覆盖一个独立事件或实践变化；不要为了压缩篇幅把无关更新并列到同一条。",
      item: {
        bodyInstruction: "每条正文约 80-180 字。说明变化内容、适用对象、实践价值或可能影响。",
        notes: [],
      },
    },
    {
      type: "section",
      title: "安全与风险",
      description: "可为空；有相关内容时输出 1-5 条。聚焦安全事件、漏洞、滥用风险、合规风险或模型行为风险；不要输出 severity、riskLevel、风险级别等风险等级字段。",
      item: {
        bodyInstruction: "每条正文约 80-180 字。说明风险事件主体、背景和影响范围。",
        notes: [
          { label: "影响", required: true, instruction: "说明受影响对象。" },
          { label: "建议", required: true, instruction: "说明建议动作。" },
        ],
      },
    },
    {
      type: "section",
      title: "开源与工具",
      description: "可为空；有相关内容时输出 1-5 条。聚焦值得开发者关注的开源项目、工具链、框架或工程资产。",
      item: {
        bodyInstruction: "每条正文约 80-180 字。概括工具或项目的核心变化。",
        notes: [
          { label: "适用场景", required: true, instruction: "说明为什么值得关注或适用场景。" },
        ],
      },
    },
    {
      type: "section",
      title: "数据与洞察",
      description: "可为空；有相关内容时输出 1-5 条。聚焦关键数据、趋势、研究结论或生态变化信号。",
      item: {
        bodyInstruction: "每条正文约 80-180 字。概括数据、趋势或研究结论。",
        notes: [
          { label: "数据", required: true, instruction: "列出关键数字或数据点。" },
          { label: "意义", required: true, instruction: "说明这些数据代表的趋势或意义。" },
        ],
      },
    },
    {
      type: "text",
      title: "趋势观察",
      bodyInstruction:
        "约 80-140 字。不要复述摘要或逐条回顾事件；从本期信息中提炼 1 条后续趋势、潜在影响或需要继续观察的判断，说明它可能如何影响普通用户、开发者、内容创作者、企业采购或日常工作流。只基于输入信息给出谨慎判断，不引入输入之外的新事实。可使用有限 Markdown 行内标记突出关键信息。",
    },
  ],
  globalRules: [
    "每个条目只描述一个独立事件、产品、漏洞、模型、政策或研究成果；不同主体、不同产品或不同事件不要合并成一条。",
    "多个来源只能用于同一事件的互证；如果只是主题相近但事实不同，应拆成不同条目或只保留最相关来源。",
    "只使用输入候选内容和合法来源编号，不编造事实、来源或输入之外的信息。",
    "每个 section item 的 sourceIds 必须至少包含 1 个合法候选编号；无法确定合法编号时不要输出该条。",
    "同一事件只出现一次，避免跨栏目重复。",
    "正文只写内容本身，不要带栏目名、字段名或标签前缀。",
    "除模板允许的加粗和斜体外，不要输出链接、图片、标题、表格、列表或其他 Markdown 结构。",
  ],
};

function cloneDefaultTemplate() {
  return JSON.parse(JSON.stringify(DEFAULT_DAILY_REPORT_TEMPLATE)) as DailyReportTemplateConfig;
}

function nonEmptyText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeNote(note: Partial<DailyReportTemplateNote>): DailyReportTemplateNote {
  return {
    label: nonEmptyText(note.label, "要点"),
    required: note.required !== false,
    instruction: nonEmptyText(note.instruction, "写清楚该要点内容。"),
  };
}

export function normalizeDailyReportTemplateConfig(value: unknown): DailyReportTemplateConfig {
  if (!isObject(value)) {
    return cloneDefaultTemplate();
  }

  const input = value as Partial<DailyReportTemplateConfig>;
  const sourceBlocks = Array.isArray(input.blocks) && input.blocks.length > 0
    ? input.blocks
    : cloneDefaultTemplate().blocks;

  return {
    headlineInstruction: nonEmptyText(input.headlineInstruction, DEFAULT_DAILY_REPORT_TEMPLATE.headlineInstruction),
    recentTopicRules:
      Array.isArray(input.recentTopicRules) && input.recentTopicRules.length > 0
        ? input.recentTopicRules.filter((rule): rule is string => typeof rule === "string" && Boolean(rule.trim())).map((rule) => rule.trim())
        : [...DEFAULT_DAILY_REPORT_TEMPLATE.recentTopicRules],
    blocks: sourceBlocks.map((block, index) => {
      const defaultBlock = DEFAULT_DAILY_REPORT_TEMPLATE.blocks[index] ?? DEFAULT_DAILY_REPORT_TEMPLATE.blocks[0];
      if (block.type === "section") {
        const defaultSection = defaultBlock.type === "section" ? defaultBlock : DEFAULT_DAILY_REPORT_TEMPLATE.blocks.find((entry) => entry.type === "section") as DailyReportTemplateSectionBlock;
        return {
          type: "section",
          title: nonEmptyText(block.title, defaultSection.title),
          description: nonEmptyText(block.description, defaultSection.description),
          item: {
            bodyInstruction: nonEmptyText(block.item?.bodyInstruction, defaultSection.item.bodyInstruction),
            notes: Array.isArray(block.item?.notes) ? block.item.notes.map(normalizeNote) : [],
          },
        };
      }
      const defaultText = defaultBlock.type === "text" ? defaultBlock : DEFAULT_DAILY_REPORT_TEMPLATE.blocks[0] as DailyReportTemplateTextBlock;
      return {
        type: "text",
        title: nonEmptyText(block.title, defaultText.title),
        bodyInstruction: nonEmptyText(block.bodyInstruction, defaultText.bodyInstruction),
      };
    }),
    globalRules:
      Array.isArray(input.globalRules) && input.globalRules.length > 0
        ? input.globalRules.filter((rule): rule is string => typeof rule === "string" && Boolean(rule.trim())).map((rule) => rule.trim())
        : [...DEFAULT_DAILY_REPORT_TEMPLATE.globalRules],
  };
}

function assertNonEmptyText(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label}不能为空。`);
  }
}

function withDailyReportTemplateCompatibilityDefaults(template: Record<string, unknown>): Record<string, unknown> {
  return {
    ...template,
    headlineInstruction: nonEmptyText(template.headlineInstruction, DEFAULT_DAILY_REPORT_TEMPLATE.headlineInstruction),
    recentTopicRules: Array.isArray(template.recentTopicRules)
      ? template.recentTopicRules
      : [...DEFAULT_DAILY_REPORT_TEMPLATE.recentTopicRules],
  };
}

export function validateDailyReportTemplateConfig(templateInput: unknown): DailyReportTemplateConfig {
  if (!isObject(templateInput)) {
    throw new Error("日报模板配置必须是 JSON 对象。");
  }
  const template = templateInput as DailyReportTemplateConfig;
  if (!Array.isArray(template.blocks) || template.blocks.length === 0) {
    throw new Error("日报模板至少需要 1 个 block。");
  }
  assertNonEmptyText(template.headlineInstruction, "标题规则");
  if (!Array.isArray(template.recentTopicRules)) {
    throw new Error("历史主题去重规则必须是数组。");
  }
  for (const [index, block] of template.blocks.entries()) {
    const label = `第 ${index + 1} 个 block`;
    if (block.type === "text") {
      assertNonEmptyText(block.title, `${label}标题`);
      assertNonEmptyText(block.bodyInstruction, `${label}正文要求`);
      continue;
    }
    if (block.type === "section") {
      assertNonEmptyText(block.title, `${label}栏目名`);
      assertNonEmptyText(block.description, `${block.title}栏目要求`);
      if (!isObject(block.item)) throw new Error(`${block.title} 缺少条目配置。`);
      assertNonEmptyText(block.item.bodyInstruction, `${block.title}条目正文要求`);
      if (!Array.isArray(block.item.notes)) throw new Error(`${block.title} 要点配置必须是数组。`);
      for (const note of block.item.notes) {
        assertNonEmptyText(note.label, `${block.title}要点标签`);
        if (typeof note.required !== "boolean") throw new Error(`${block.title}.${note.label} 必填设置必须是布尔值。`);
        assertNonEmptyText(note.instruction, `${block.title}.${note.label} 要求`);
      }
      continue;
    }
    throw new Error(`${label} type 必须是 text 或 section。`);
  }
  if (!Array.isArray(template.globalRules)) {
    throw new Error("内容全局规则必须是数组。");
  }
  return template;
}

export function parseDailyReportTemplateJson(value: string | null | undefined): DailyReportTemplateConfig | null {
  if (!value?.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("日报模板 JSON 格式不合法。");
  }
  if (!isObject(parsed) || !Array.isArray((parsed as Partial<DailyReportTemplateConfig>).blocks)) {
    throw new Error("日报模板 JSON 必须包含 blocks 数组。");
  }
  const input = withDailyReportTemplateCompatibilityDefaults(parsed);
  validateDailyReportTemplateConfig(input);
  const template = normalizeDailyReportTemplateConfig(input);
  validateDailyReportTemplateConfig(template);
  return template;
}

function buildBlockExample(block: DailyReportTemplateBlock) {
  if (block.type === "text") {
    return { type: "text", title: block.title, body: "..." };
  }
  return {
    type: "section",
    title: block.title,
    items: [
      {
        title: "...",
        body: "...",
        notes: block.item.notes.map((note) => ({ label: note.label, text: "..." })),
        sourceIds: [1, 2],
      },
    ],
  };
}

export function compileDailyReportTemplatePrompt(templateInput: DailyReportTemplateConfig): string {
  const template = validateDailyReportTemplateConfig(normalizeDailyReportTemplateConfig(templateInput));
  const outputShape = {
    headline: "GPT-5.6 有限预览、Mythos 5 白名单恢复",
    blocks: template.blocks.map(buildBlockExample),
  };
  const lines = [
    DAILY_REPORT_SYSTEM_ROLE_PROMPT,
    "",
    "固定输出格式：",
    JSON.stringify(outputShape),
    "",
    "通用结构规则：",
    "1. 最终 JSON 顶层必须包含 headline 字段。",
    "2. section block 的 items 为空数组时会在渲染时自动隐藏；有 items 时，每个 item 必须包含 title、sourceIds，建议包含 body。",
    "3. sourceIds 必须是至少包含 1 个合法候选编号的数字数组，只使用输入候选内容中的合法来源编号；不要使用空数组、字符串、URL、标题或不存在的编号。",
    "4. item.title 写事件标题；item.body 写正文或轻量看点；body 为空字符串或缺失时会按紧凑模式只展示标题和来源。",
    "5. notes 只按栏目配置输出 label/text；无配置时输出空数组。",
    "",
    "输出要求：",
  ];

  let index = 1;
  lines.push(`${index}. headline 字段：${template.headlineInstruction}`);
  index += 1;
  for (const block of template.blocks) {
    if (block.type === "text") {
      lines.push(`${index}. text block「${block.title}」：type 固定为 "text"，title 固定为“${block.title}”；body 字段：${block.bodyInstruction}`);
      index += 1;
      continue;
    }
    const noteRules = block.item.notes.length > 0
      ? block.item.notes
        .map((note) => `${note.label}${note.required ? " 必填" : " 可选"}：${note.instruction}`)
        .join("；")
      : "输出空数组";
    lines.push(`${index}. section block「${block.title}」：${block.description}；body 字段：${block.item.bodyInstruction} notes 要求：${noteRules}`);
    index += 1;
  }

  for (const rule of template.globalRules) {
    if (!rule.trim()) continue;
    lines.push(`${index}. ${rule.trim()}`);
    index += 1;
  }

  if (template.recentTopicRules.length > 0) {
    lines.push("", "历史主题去重规则：");
    for (const [ruleIndex, rule] of template.recentTopicRules.entries()) {
      if (!rule.trim()) continue;
      lines.push(`${ruleIndex + 1}. ${rule.trim()}`);
    }
  }

  return lines.join("\n");
}

export function stringifyDailyReportTemplate(template: DailyReportTemplateConfig) {
  return JSON.stringify(validateDailyReportTemplateConfig(normalizeDailyReportTemplateConfig(template)), null, 2);
}

export const DEFAULT_DAILY_REPORT_TEMPLATE_JSON = stringifyDailyReportTemplate(DEFAULT_DAILY_REPORT_TEMPLATE);
