# Infinitum 全站 UI 改造与 Tailwind 落地设计

日期：2026-04-16

## 背景

`infinitum` 当前已经具备首页信息流、管理员登录、内容审核、任务监控、后台设置等完整功能，但整体界面仍然分成两种明显不同的产品气质：

- 首页使用偏纸媒/编辑部风格的视觉语言。
- 后台页面使用较朴素的表单和卡片布局。

这会让首页与后台看起来像两个独立产品，也不利于继续扩展筛选、审核、监控和配置能力。

本次改造以 `/Users/shawn/Documents/GitHub/lumina` 的文章列表页和管理页为参考，目标是把 `infinitum` 全站统一成更接近现代内容管理产品的界面体系，并同步完成 Tailwind 落地。

## 目标

1. 让首页与后台所有页面共享同一套视觉语言和布局骨架。
2. 让首页从“内容展示页”升级为“可操作的信息流工作台”。
3. 让后台四个页面形成统一的管理系统体验，而不是孤立页面。
4. 在不改变业务逻辑、接口、路由的前提下完成全站样式升级。
5. 在本项目内建立可持续扩展的 Tailwind 样式基础设施，作为后续页面的默认样式方案。
6. 在桌面端和移动端都保持稳定可用，不出现严重布局破碎。

## 非目标

1. 不改动现有 API、数据库、任务调度、数据结构和业务规则。
2. 不把 App Router 改写成 Pages Router。
3. 不新增复杂导航体系，例如完整侧边栏、权限系统或多层信息架构。
4. 不重做功能交互流程，只重组 UI 组织和视觉层级。
5. 不直接复制 `lumina` 的完整前端框架、路由结构或上下文逻辑。

## 现状概览

当前主要页面与入口如下：

- 首页：`src/app/page.tsx`，核心展示组件为 `src/components/feed/feed-panel.tsx`
- 登录页：`src/app/admin/login/page.tsx`
- 内容审核：`src/app/admin/content/page.tsx`
- 任务监控：`src/app/admin/monitor/page.tsx`
- 后台设置：`src/app/admin/settings/page.tsx`
- 全局样式：`src/app/globals.css`
- 首页样式：`src/components/feed/feed-panel.module.css`
- 后台样式：`src/components/admin/admin.module.css`

当前样式栈情况：

- `infinitum` 目前使用 `globals.css` + CSS Modules。
- 项目尚未安装 Tailwind，也没有 PostCSS/Tailwind 配置文件。
- `lumina` 使用 Tailwind 3，但当前项目的 Next.js 16 文档优先指向更新的 Tailwind 接入方式。

当前问题主要集中在：

- 全局 token 偏暖色纸面风，与参考项目的现代产品界面差异较大。
- 首页标题区和卡片层级偏“展示型”，信息密度较低。
- 后台四个页面的区块结构较散，缺乏统一的页面头、工具栏和状态表达。
- 按钮、输入框、提示条、空状态等基础交互元素缺少统一的系统感。

## 参考方向与选型结论

本次采用“更贴近 `lumina`”的方案，不保留当前 `infinitum` 的纸媒主视觉。最终方向定义为：

- 全站使用中性浅灰背景、白色表面、清晰边框和蓝色强调色。
- 首页与后台共享同一套设计 token。
- 页面整体气质偏“内容平台 + 管理后台”的现代产品风格。
- 首页保留信息流和聚合卡的业务结构，但视觉和布局向 `lumina /list` 靠拢。
- 后台页面保留当前轻量导航方式，但统一成同一套工作区语言。
- 样式实现层面采用 Tailwind 作为主方案，但不照搬 `lumina` 的 Tailwind 3 配置。

## Tailwind 落地选型

### 选型结论

本次采用以下策略：

1. 使用适配当前 Next.js 16 文档的 Tailwind 接入方式。
2. 借鉴 `lumina` 的视觉 token、布局密度和组件层级，但不直接迁移其前端框架。
3. 本轮涉及页面优先迁移为 Tailwind class 驱动。
4. 仅在确有必要时保留少量 CSS Modules 或全局补充样式。

### 不直接照搬 `lumina` Tailwind 配置的原因

- `lumina` 当前是 Tailwind 3 配置。
- 当前项目所依赖的 Next.js 16 文档优先推荐最新 Tailwind 接法：
  - 安装 `tailwindcss` 与 `@tailwindcss/postcss`
  - 在 PostCSS 中启用 `@tailwindcss/postcss`
  - 在 `src/app/globals.css` 中使用 `@import 'tailwindcss';`
- 因此本项目不应机械复制 `lumina/frontend/tailwind.config.js` 和 `lumina/frontend/postcss.config.js`，而应按当前框架文档建立新的 Tailwind 基线。

### 迁移策略

采用“主迁移，不一次性清零”的方式：

- 首页与后台四个页面在本轮内尽量迁移到 Tailwind。
- 原有 `feed-panel.module.css` 与 `admin.module.css` 可在过渡期保留，但目标是大幅收缩或删除。
- 全局保留 `src/app/globals.css`，用于：
  - 导入 Tailwind
  - 定义 CSS variables
  - 放置少量基础 reset 和 app 级全局规则
- 不在这次改造里把全仓所有历史样式一次性迁移完。

## 总体设计原则

### 1. 保持技术边界稳定

- 保留现有 App Router 结构。
- 保留现有客户端组件职责划分。
- 允许提炼少量通用布局组件、class 组合函数或共用样式变量，但不引入新的 UI 组件库依赖。
- 样式主实现从 CSS Modules 升级为 Tailwind + `globals.css` 变量系统。

### 2. 用统一骨架组织页面

所有页面都尽量由以下几层组成：

1. 页面容器
2. 页面头部区域
3. 工具栏或说明区
4. 内容卡片区
5. 页底操作区或空状态区

### 3. 优先统一“系统感”

这次改造不只换颜色，而是统一以下基础语言：

- 字体系统
- 色板
- 边框与圆角
- 面板阴影
- 按钮层级
- 表单状态
- 标签与提示条
- 列表卡片结构
- 空状态和加载状态

### 4. Tailwind 负责结构，CSS variables 负责主题

Tailwind 负责：

- 布局
- 间距
- 排版
- 边框
- 阴影
- 状态 class

CSS variables 负责：

- 品牌色
- 语义色
- 文本层级色
- 背景与边框基准值

这样可以兼顾 Tailwind 的开发效率与后续主题一致性。

## 视觉系统设计

### 全局 Tokens

在 `src/app/globals.css` 中重建全局变量，并作为 Tailwind 使用的设计基线，方向接近参考项目：

- `--bg-app`：浅灰应用背景
- `--bg-surface`：白色主面板背景
- `--bg-muted`：次级浅灰背景
- `--text-1`：主文本
- `--text-2`：次文本
- `--text-3`：弱化文本
- `--border` / `--border-strong`：基础和强调边框
- `--accent` / `--accent-soft` / `--accent-ink`：品牌蓝强调色
- `--danger` / `--success` / `--warning` / `--info`：状态色
- `--shadow-sm` / `--shadow-md`：轻量阴影
- `--radius-sm` / `--radius-md`：统一圆角

### 字体方向

- 正文与界面统一为更现代、清晰的无衬线或中文系统化字体栈。
- 移除当前偏纸媒的 display serif 主导风格。
- 需要保留少量 `mono` 用于标签、辅助信息和状态文本。
- Tailwind class 中的字体使用应围绕全局字体变量展开，而不是零散写死。

### 背景与表面

- 全站不再使用大面积纸张纹理和网格覆盖层。
- 应用背景以浅灰纯色或极轻渐变为主。
- 所有主要内容都承载在统一白色面板上。

## 首页改造设计

首页改造对象为 `src/components/feed/feed-panel.tsx`，并优先把页面样式从 CSS Modules 迁移到 Tailwind。

### 页面头

首页顶部改成应用式页面头，而不是当前报头式 masthead：

- 左侧显示产品标题、副标题和一句简短说明。
- 右侧放管理员入口与快捷动作。
- 已登录状态下显示：
  - 内容审核
  - 任务监控
  - 后台设置
  - 立即抓取
- 未登录状态下仅显示管理员登录入口。

### 筛选工具区

筛选区重组为连续工具栏：

- 第一层：快速时间范围切换按钮
- 第二层：排序、分组、来源、自定义起止日期
- 第三层：状态摘要，例如当前条数、当前时间范围、最近抓取状态

自定义日期不再作为松散附属区块，而是并入工具栏体系。

### 信息流卡片

首页的单条内容卡和聚合卡共享统一骨架：

- 标题区：标题 + 状态标签/分值标签
- 元信息区：来源、发布时间、质量分、分组等
- 摘要区：控制长度，提高列表密度
- 操作区：管理员可见操作放在卡片底部次级区域

与当前设计相比，新的卡片应：

- 标题更克制
- 元信息更紧凑
- 摘要更可扫读
- 留白更像产品界面而不是杂志版式

### 聚合卡与展开区

聚合卡在列表中保留“事件流”能力，但视觉上更靠近管理型卡片：

- 默认展示聚合摘要与少量预览项
- 点击展开后加载完整子条目
- 子条目使用嵌套子面板，而不是松散文本块
- 子条目继续保留来源、标题、摘要和管理员操作

### 底部操作区

- “加载更多”放入统一的页底操作区
- 空状态、抓取反馈、错误提示统一为系统消息样式

## 后台页面改造设计

后台改造对象主要为 `src/components/admin/*.tsx`，并优先把页面样式从 CSS Modules 迁移到 Tailwind。

### 共用后台壳层

所有后台页面共享以下结构：

1. 顶部标题区：标题、说明、跨页入口
2. 消息提示区：成功/失败反馈
3. 主体分区卡片：每个 section 为独立白色面板
4. 行内操作区：按钮主次明确

### 管理员登录页

登录页改造成更像后台入口页，而不是单纯表单：

- 居中布局
- 顶部保留品牌和后台说明
- 密码输入与提交按钮形成清晰主线
- 错误提示视觉与后台其他消息保持一致

### 内容审核页

内容审核页分成两个工作模式：

- 过滤内容
- 聚合管理

保留现有 tab，但更新为更统一的 segmented control 或产品化 tab 样式。

过滤内容列表：

- 强调来源、时间、质量分和过滤原因
- 操作按钮按主次排序
- 卡片信息结构一致，便于快速连续审阅

聚合管理列表：

- 聚合状态、内容数量、质量分更突出
- 预览子项使用统一嵌套列表
- “隐藏/恢复”“重生成摘要”“移出条目”形成稳定操作层级

### 任务监控页

任务监控页重组为三大区块：

1. 调度设置卡
2. 运行中任务列表
3. 最近任务列表

其中：

- 运行中任务卡片比历史任务更醒目
- 任务状态、触发方式、AI 调用数、错误摘要统一格式化
- 取消任务按钮只在可操作任务上显示

### 后台设置页

后台设置页是信息量最大的页面，保留当前功能但重组层级：

- 基础配置
- 黑名单
- 分组管理
- 信息源管理

每个 section 都应具备：

- section 标题
- 简短说明
- 表单内容区
- 底部操作区

长文本 prompt 区域需要更强可读性，避免整页像连续表单堆叠。

分组与信息源编辑区域保持可编辑，但视觉上应更接近“编辑卡片”或“编辑行”，而不是裸表单拼接。

## 交互与状态设计

### 按钮系统

需要明确至少四类按钮：

- 主按钮：关键提交动作
- 次按钮：辅助操作
- 文字按钮：导航或轻量跳转
- 危险按钮：删除、清空、隐藏等

需要建立可复用的按钮 class 策略，避免每个页面手写一套长 class 串。允许采用以下任一方式：

- 轻量 class 常量
- 小型样式组合函数
- 极少量通用展示组件

### 表单状态

输入框和下拉框统一支持：

- 默认态
- hover 态
- focus 态
- disabled 态

### 消息提示

成功与失败消息统一为系统提示条，不同页面不再各自定义视觉形式。

### Loading 与 Pending

保留现有请求逻辑，但在视觉上统一体现：

- 按钮禁用
- 文案变化
- 必要时轻量降低面板透明度或使用统一 busy 状态

## Tailwind 技术落地范围

### 基础设施

需要新增或调整：

- `package.json`：增加 Tailwind 相关依赖
- `postcss.config.mjs`：启用 `@tailwindcss/postcss`
- `src/app/globals.css`：导入 Tailwind，并保留全局变量和基础规则

### 组件迁移

本轮页面中，以下组件以 Tailwind 为主进行改造：

- `src/components/feed/feed-panel.tsx`
- `src/components/admin/admin-login-form.tsx`
- `src/components/admin/content-review-panel.tsx`
- `src/components/admin/admin-monitor-panel.tsx`
- `src/components/admin/admin-settings-panel.tsx`

### 过渡策略

- 旧 CSS Module 可以暂时保留，直到对应组件已迁移完成。
- 完成迁移后，应删除明显不再使用的样式类和文件内容。
- 如果某些复杂选择器或极少量全局规则用 Tailwind 表达成本过高，可以继续留在 `globals.css`。

## 响应式要求

### 首页

- 筛选工具区在窄屏下纵向排列
- 信息卡元信息允许多行换行
- 聚合预览项自动改为单列或两列

### 后台

- 表单区在小屏下统一改单列
- 行内操作按钮在窄屏下纵向堆叠
- 登录页保留层级但减少留白

## 实现范围

本次 UI 设计落地应至少覆盖以下文件：

- `package.json`
- `postcss.config.mjs`
- `src/app/globals.css`
- `src/components/feed/feed-panel.tsx`
- `src/components/feed/feed-panel.module.css`
- `src/components/admin/admin.module.css`
- `src/components/admin/admin-login-form.tsx`
- `src/components/admin/content-review-panel.tsx`
- `src/components/admin/admin-monitor-panel.tsx`
- `src/components/admin/admin-settings-panel.tsx`

如果实现过程中发现适合抽取共享布局组件，可新增轻量组件，但应控制范围，避免为了抽象而抽象。

`src/components/feed/feed-panel.module.css` 与 `src/components/admin/admin.module.css` 在本轮中不再视为长期方案，而是迁移中的过渡资产。

## 验收标准

### 视觉验收

1. 首页、登录页、内容审核、任务监控、后台设置五类页面明显属于同一套产品。
2. 首页整体风格明显接近 `lumina` 列表页，而不是当前纸媒风。
3. 后台整体风格明显接近 `lumina` 管理页，具备更强工具感和层级感。
4. 本轮改造页面已经以 Tailwind 作为主要样式实现方式。

### 功能验收

1. 不改变现有页面路由与主要交互流程。
2. 不影响首页筛选、抓取、展开聚合、加载更多等功能。
3. 不影响后台登录、审核、监控、设置等既有行为。
4. Tailwind 接入后，构建、开发与现有页面渲染保持正常。

### 适配验收

1. 桌面端布局完整。
2. 移动端无明显溢出、重叠、不可点区域。

## 风险与注意事项

1. `AdminSettingsPanel` 内容量较大，迁移到 Tailwind 时要注意不要破坏当前表单行为。
2. 首页聚合展开与后台按钮较多，迁移为 Tailwind class 时要特别注意不同状态下的视觉优先级与可维护性。
3. 由于本次不引入完整后台框架，统一感主要依赖页面头、卡片系统、Tailwind class 约定和全局 token，一致性必须严格执行。
4. 若过度内联长 class 串，可能降低可读性，因此需要适度提炼共享 class 策略。
5. `lumina` 使用的是 Tailwind 3，而当前项目将按更适配 Next.js 16 的方式接入，迁移时不能混用两套旧新配置习惯。

## 下一步

在本设计获批后，下一阶段应编写实现计划，拆解为：

1. Tailwind 基础设施接入与全局 token 重建
2. 首页信息流迁移到 Tailwind 并重构界面
3. 后台共用样式语言迁移到 Tailwind
4. 登录页、审核页、监控页、设置页逐页落地
5. 清理过渡 CSS Modules、补齐响应式和验收修正
