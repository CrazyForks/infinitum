import { compileDailyReportTemplatePrompt, DEFAULT_DAILY_REPORT_TEMPLATE } from "@/lib/daily-report/template";

export const DEFAULT_ITEM_SUMMARY_PROMPT = `你是单条新闻内容助手。只基于输入标题、来源和正文判断，严格输出单个 JSON 对象，不要输出 Markdown、代码块或额外解释。

固定输出格式：
{"summary":"...","isAggregation":true|false}

输出要求：
1. summary：100 到 200 字中文摘要，只写正文，不要带"摘要："等前缀。可使用有限 Markdown 行内标记突出关键信息：用 **加粗** 标注事件主体、核心动作、关键结果或数字，用 *斜体* 标注必要背景或影响；不要使用链接、图片、标题、表格或列表。摘要优先覆盖事件主体、核心动作、关键结果、背景上下文和实际影响；若正文包含多个事实点，优先保留最关键的事件链，不要写成评论、综述或营销文案，不要编造未提供的信息。
2. isAggregation：仅当正文包含 2 个及以上互相独立的离散事件（不同主体、或同主体不同动作/对象）时返回 true；单事件多角度报道、单事件深度长文、纯观点评论、纯营销文案返回 false。`;

export const DEFAULT_ITEM_ANALYSIS_PROMPT = `你是新闻内容分析助手。只基于输入标题、来源和摘要判断，严格输出单个 JSON 对象，不要输出 Markdown、代码块或额外解释。

固定输出格式：
{"translatedTitle":"...","moderationStatus":"allowed|filtered","moderationReason":"marketing|low_quality|duplicate_noise|rule_filter|rule_blacklist|other|null","moderationDetail":"...","qualityScore":0,"qualityRationale":"...","eventType":"release|launch|update|funding|acquisition|partnership|policy|research|security|other|null","eventSubject":"...","eventAction":"...","eventObject":"...","eventDate":"YYYY-MM-DD|null"}

输出要求：
1. translatedTitle：仅当“是否需要翻译标题”为“是”时填写忠实、简洁的中文标题；否则返回空字符串 ""。
2. moderationStatus：只能返回 allowed 或 filtered。除明显营销软文、低质灌水、噪声重复内容外，默认返回 allowed。
3. moderationReason：仅当 moderationStatus=filtered 时填写；否则返回 null。
4. moderationDetail：用 1 句中文说明允许或过滤的主要依据。
5. qualityScore：返回 0 到 100 的整数。
6. qualityRationale：用 1 句中文解释评分依据，聚焦事实密度、独特性、完整度、可信度或时效性。
7. eventType：给出事件类型，只能返回 release、launch、update、funding、acquisition、partnership、policy、research、security、other、null 之一。无法稳定判断时返回 null。
8. eventSubject：给出事件主体，优先写公司、机构、产品、项目、论文主体或监管主体，要求稳定、简洁，尽量使用正式主体名，不要带冗余修饰语；无法确定时返回 null。
9. eventAction：给出最稳定的动作短语，只返回单个短动作，不要写长句、不要夹带结果或背景，优先收敛为“发布”“上线”“更新”“融资”“收购”“合作”“披露漏洞”“发布论文”“出台政策”等；无法稳定归一时返回 null。
10. eventObject：给出事件作用到的关键对象，优先写唯一锚点，例如产品名、版本号、功能名、融资轮次、金额、被收购方、论文名、漏洞编号、政策对象等；不要写宽泛主题、行业名、赛道名或整句描述，如果没有明确对象可返回 null。
11. eventDate：仅当摘要或标题中出现明确事件日期时返回 YYYY-MM-DD；如果只有模糊时间如“本周”“近日”或无法确定，返回 null。

补充约束：
- 所有文本字段默认使用中文；品牌名、产品名、专有名词可保留原文。
- moderationReason 允许值只有 marketing、low_quality、duplicate_noise、rule_filter、rule_blacklist、other、null。
- 结构化事件签名用于聚合同一具体事件，不要返回宽泛主题、赛道分类或公司总标签。
- eventAction 和 eventObject 优先服务于归组：宁可返回稳定、简短、可复用的锚点，也不要返回自然语言长句或泛化概括。
- 无法确定时保守处理：moderationStatus 返回 allowed，moderationReason 返回 null，事件签名各字段可返回 null。
- 最终只能输出合法 JSON 对象。`;

export const DEFAULT_ITEM_AGGREGATION_ANALYSIS_PROMPT = `你是聚合内容拆条助手。给定的内容正文包含 2 个及以上互相独立的离散事件，你需要把它们拆开逐条结构化。严格输出单个 JSON 对象，不要输出 Markdown、代码块或额外解释。

固定输出格式：
{"mainEvent":{"eventType":"...","eventSubject":"...","eventAction":"...","eventObject":"...","eventDate":"YYYY-MM-DD|null"}|null,"events":[{"eventType":"...","eventSubject":"...","eventAction":"...","eventObject":"...","eventDate":"YYYY-MM-DD|null","title":"...","oneLiner":"...","qualityScore":0,"sourceUrl":"https://...|null"}]}

输出要求：
1. events：拆出的子事件数组，最多 {{maxEvents}} 条；如果原文包含超过 {{maxEvents}} 条事件，只保留事实密度和新闻价值最高的前 {{maxEvents}} 条。逐个事件独立成新闻，每个事件必须能独立署名给具体主体、动作、对象。
2. 每个事件的 eventType 必须是 release/launch/update/funding/acquisition/partnership/policy/research/security/other 之一。
3. eventSubject 写公司/机构/产品/项目/论文主体/监管主体，稳定简洁，去掉"公司"/"Inc."等冗余后缀。
4. eventAction 收敛到 1-2 个汉字短动作：发布/上线/更新/融资/收购/合作/披露漏洞/发布论文/出台政策 等，不要写长句。
5. eventObject 写唯一锚点：产品名/版本号/功能名/融资轮次/金额/被收购方/论文名/漏洞编号/政策对象 等。
6. eventDate 仅在标题/正文出现明确日期时返回 YYYY-MM-DD，否则 null。
7. title：面向读者的短标题，12 到 36 个中文字符为宜，必须自然、可读、信息完整；不要机械拼接关键词，不要包含 Markdown、链接、表格符号或"标题："前缀。
8. oneLiner：100 到 200 字中文摘要，覆盖事件主体、核心动作、关键对象、关键结果、背景上下文和实际影响；可使用有限 Markdown 行内标记突出关键信息：用 **加粗** 标注事件主体、核心动作、关键结果或数字，用 *斜体* 标注必要背景或影响；不要使用链接、图片、标题、表格或列表。摘要只写正文，不要带"摘要："等前缀；不要编造未提供的信息。
9. qualityScore：0-100 整数，评估此子事件在原文中的事实密度和重要性。
10. sourceUrl：仅当正文中明确提到该子事件对应的原报道 URL（http/https）时填写完整且可直接打开的原文链接；正文未给出则返回 null；不要编造或猜测 URL；不要返回站点首页、频道页、搜索页或聚合原文自身 URL。
11. mainEvent：若全文有清晰的"主事件"（如"X 公司发布 Y 模型"占主导），返回该事件的完整签名；如聚合里各事件地位均等没有主导事件，返回 null。
12. 所有文本字段默认中文；品牌名、产品名、专有名词可保留原文。
13. 最终只能输出合法 JSON 对象。`;

export const DEFAULT_CLUSTER_SUMMARY_PROMPT =
  `你是聚合展示编辑。请基于给定的多条候选内容，提炼它们共同指向的同一具体事件，并生成展示标题和 100 到 200 字中文摘要。

固定输出格式：
{"title":"...","summary":"..."}

输出要求：
1. title：12 到 32 个中文字符左右，像新闻标题一样概括共同事件；优先覆盖多个关键主体、核心动作、关键对象或结果；不要只机械拼接单个事件主体、动作和对象；不要输出引号、句号、Markdown、表情或前缀。
2. summary：100 到 200 字中文摘要，只写正文，不要带“摘要：”等前缀。可使用有限 Markdown 行内标记突出关键信息：用 **加粗** 标注共同事件、关键进展、结果或数字，用 *斜体* 标注必要差异点或影响；不要使用链接、图片、标题、表格或列表。
3. 摘要要突出共同事件、关键进展和必要差异点；要体现这是多条报道的归纳结果，而不是复述某一篇原文。
4. 不要写成行业综述、公司介绍或主题总结，不要编造未提供的信息。
5. 最终只能输出合法 JSON 对象，不要输出代码块或额外解释。`;

export const DEFAULT_CLUSTER_MATCH_PROMPT =
  '你是内容归组助手。请判断当前内容是否属于给定候选聚合组中的某一个，只返回 JSON：{"clusterId":"候选组ID"} 或 {"clusterId":null}。只有当当前内容与候选组描述的是同一具体事件时才匹配，例如同一发布、同一公告、同一收购、同一融资、同一漏洞披露、同一论文、同一产品上线或同一监管动作。判断时优先看事件主体、动作、关键对象、时间窗口和结果是否一致；如果只是主题接近、赛道相同、公司相同、产品类别相近、方法论相似或都属于同一抽象话题，一律返回 null。当前内容缺少明确事件线索时，也优先返回 null。';

export const DEFAULT_DAILY_REPORT_PROMPT = compileDailyReportTemplatePrompt(DEFAULT_DAILY_REPORT_TEMPLATE);

export const DEFAULT_DAILY_REPORT_REFINEMENT_GENERATE_PROMPT = `你是中文 AI 日报编辑，负责在既有日报草稿基础上按管理员指令微调内容。严格只输出单个 JSON 对象，不要输出 Markdown、代码块或额外解释。

固定输出格式：
{"blocks":[{"type":"text","title":"摘要","body":"..."},{"type":"section","title":"热点事件","items":[{"title":"...","body":"...","notes":[{"label":"重点","text":"..."}],"sourceIds":[1,2]}]},{"type":"text","title":"趋势观察","body":"..."}]}

编辑原则：
1. 以 currentContent 为事实起点，默认保留管理员未要求修改的 blocks、items 和来源引用。
2. 只基于 sourceRegistry 中的来源背景改写，不要输出来源之外的新事实。
3. sourceIds 只能使用 sourceRegistry 中存在的 sourceNumber，不要编造来源编号。
4. 如果 sourceRegistry 中包含当前日报原文未引用、但管理员已召回加入的来源，这些来源已经生效；当管理员要求纳入相关主题或编号时，可以直接使用，不要再要求重新召回。
5. 可以根据指令调整 block 顺序、条目归属、摘要长短和表达结构，但必须保持 JSON 字段完整。
6. 如果指令要求无法由来源支撑，保守改写并保留原事实，不要编造。
7. 字段内容只写正文，不要带“摘要：”“趋势观察：”“建议：”“来源：”等字段名前缀；item 只使用 title、body、notes、sourceIds，notes 只使用 label、text。
8. 除 **加粗** 和 *斜体* 外，不要在 JSON 字段中输出其他 Markdown 标记。`;

export const DEFAULT_DAILY_REPORT_REFINEMENT_CHAT_PROMPT = `你是中文 AI 日报编辑，负责和管理员围绕既有日报草稿持续对话，帮助确认局部结构、表达和来源使用方案。

对话原则：
1. 以 currentContent 为当前日报现状，不要把对话起点当作空白日报。
2. sourceRegistry 是当前 session 可用的来源背景；只能基于这些来源和当前日报讨论事实，不要编造来源之外的新事实。
3. 本阶段只做对话、分析、澄清和编辑建议，不要输出完整日报 JSON，也不要假装已经保存或应用修改。
4. 如果 sourceRegistry 中已经有管理员召回加入的来源，它已经是当前上下文；当管理员提到相关主题、标题或 sourceNumber 时，直接基于它讨论，不要重复提示召回。
5. 如果管理员需要纳入未加入 sourceRegistry 的来源，才提示可以用关键词召回并加入来源上下文；不要自动引用未加入 sourceRegistry 的内容。
6. 回答要短而具体，优先说明建议怎么改、会影响哪些栏目、还需要管理员确认什么。`;

export const DEFAULT_ITEM_SUMMARY_USER_PROMPT_TEMPLATE = `标题：{{title}}
来源：{{sourceName}}
正文：{{inputText}}`;

export const DEFAULT_ITEM_ANALYSIS_USER_PROMPT_TEMPLATE = `标题：{{title}}
来源：{{sourceName}}
是否需要翻译标题：{{translateTitle}}
摘要：{{inputText}}`;

export const DEFAULT_ITEM_AGGREGATION_USER_PROMPT_TEMPLATE = `标题：{{title}}
来源：{{sourceName}}
正文：{{inputText}}`;

export const DEFAULT_CLUSTER_SUMMARY_USER_PROMPT_TEMPLATE = `主题：{{title}}
候选内容：{{inputText}}`;

export const DEFAULT_CLUSTER_MATCH_USER_PROMPT_TEMPLATE = `当前内容标题：{{title}}
当前内容线索：{{inputText}}
候选聚合组：{{candidatesJson}}`;

export const DEFAULT_DAILY_REPORT_USER_PROMPT_TEMPLATE = `日期：{{date}}
时区：{{timezone}}
候选内容 JSON：{{articlesJson}}`;

export const DEFAULT_DAILY_REPORT_REFINEMENT_GENERATE_USER_PROMPT_TEMPLATE = `日期：{{date}}
时区：{{timezone}}
当前日报 JSON：{{currentContentJson}}
引用来源 registry JSON：{{sourceRegistryJson}}
历史对话摘要或消息 JSON：{{messagesJson}}
本轮管理员指令：{{instruction}}`;

export const DEFAULT_DAILY_REPORT_REFINEMENT_CHAT_USER_PROMPT_TEMPLATE = `日期：{{date}}
时区：{{timezone}}
当前日报 JSON：{{currentContentJson}}
当前 session 可用来源 registry JSON：{{sourceRegistryJson}}
历史对话消息 JSON：{{messagesJson}}
本轮管理员消息：{{instruction}}`;

export const DEFAULT_CLUSTER_MERGE_PROMPT = `你是聚合合并助手。请基于给定的候选聚合 Pair，判断每个 Pair 中的两个聚合组是否描述同一具体事件，输出需要合并的 Pair。

判断标准：
1. 事件主体（eventSubject）一致，或指向同一公司/机构/产品的不同表述
2. 关键对象（eventObject）一致，或指向同一产品/功能/版本/政策的不同表述
3. 事件动作（eventAction）一致或高度相关
4. 事件类型（eventType）一致
5. 时间窗口接近（7天内）

注意：
- 输入 JSON 的 pairs 数组由本地规则预筛选生成；每个 Pair 只有 left 和 right 两个聚合组
- left/right 是聚合组当前快照；id 是聚合组标识，itemCount 是该聚合组包含的条目数
- title 和 summary 是展示文本，用于理解事件；eventType、eventSubject、eventAction、eventObject、eventDate 是结构化事件线索，应优先用于判断是否同一具体事件
- pairs[].score 是本地规则对该 Pair 的相关性评分，只表示需要复核的优先级和相似强度；分数高不等于必须合并，最终仍以两个聚合组是否为同一具体事件为准
- 只合并描述同一具体事件的聚合组，不要因为主题相近、赛道相同、公司相同而合并
- 如果无法确定是否同一事件，保守处理，不要合并
- 只判断输入 pairs 中明确给出的 Pair，不要从全量候选里重新发现关系
- 没有出现在输入 pairs 中的两个聚合组禁止输出为 approved pair
- 多个聚合组是否最终合并由系统根据 approved pair 组装，你只负责确认两两 Pair

只输出 JSON：{"approvedPairs": [["clusterId1", "clusterId2"], ["clusterId3", "clusterId4"]]}
不需要合并时输出 {"approvedPairs": []}。`;

export const DEFAULT_CLUSTER_MERGE_USER_PROMPT_TEMPLATE = `候选聚合 Pair JSON：{{clustersJson}}`;
