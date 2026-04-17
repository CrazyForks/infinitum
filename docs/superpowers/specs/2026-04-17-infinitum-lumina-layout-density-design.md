# Infinitum Lumina Layout Density Design

## Goal

在已经完成 Tailwind 落地的基础上，将 `infinitum` 的整站布局、字体、导航与信息密度进一步向 `Lumina` 靠拢，目标不是只做“风格参考”，而是让首页与后台页在骨架、顶部导航、列表密度、字体气质上都明显接近 `Lumina` 的文章列表页与后台页面。

本轮范围覆盖：

- 顶部共享 Header
- 首页信息流列表
- 内容审核页
- 任务监控页
- 后台设置页
- 登录页的壳层跟随
- 全站字体与全局设计 token

不在本轮范围内：

- 数据结构与接口语义变更
- 新增业务功能
- 评论、详情页、导出页等当前 `infinitum` 不具备的 `Lumina` 专属能力

## Reference Baseline

本轮以 `Lumina` 的以下部分为主要参考：

- `frontend/pages/list.tsx`
- `frontend/components/AppHeader.tsx`
- `frontend/pages/admin.tsx`
- `frontend/styles/globals.css`

参考重点不是逐文件照搬，而是抽取以下设计语言：

1. 顶部固定导航优先级高
2. 页面首屏避免过高 Hero
3. 筛选控件紧凑、贴近列表
4. 列表项信息密集、便于扫描
5. 整体色彩克制，灰底白卡片，轻边框弱阴影
6. 字体统一为 `LXGW WenKai Mono`

## Product Direction

### Desired Feel

`infinitum` 本轮应从“偏宽松的管理工作台”进一步收紧为“编辑型信息面板”：

- 更少装饰性留白
- 更高首屏有效信息量
- 更紧凑的筛选条与列表卡片
- 更统一的全站导航
- 更接近 `Lumina` 的浅灰底 + 白卡片 + 细分隔语言

### What Should Change Visibly

用户进入应用后的第一感受应发生以下变化：

1. 顶部不再是分散的页面快捷入口，而是一条统一的全站导航栏。
2. 首页不再是偏 Hero 式首页，而更像一张可工作的文章列表页。
3. 卡片高度整体降低，同屏可见的信息条目增多。
4. 页面字体明显切换为 `Lumina` 同款书写感字体。
5. 后台页不再各自像独立工作台，而是同一套后台布局下的不同视图。

## Global Shell

### Shared Header

新增或重构一个全站共享顶部 Header，应用于首页与后台页。

#### Layout

- Header 固定在页面顶部
- 左侧：
  - 产品名 `Infinitum`
  - 可附带很轻的副标识，但不做大 Hero 处理
- 中间：
  - 常用导航
  - 导航项固定为：
    - `主页`
    - `审核`
    - `管理`
- 右侧：
  - icon 按钮区
  - 根据登录态显示：
    - 未登录：登录按钮
    - 已登录：登出按钮
  - 如有必要可保留轻量管理 icon，但不新增业务动作

#### Interaction

- 当前所在页面导航高亮
- Header 在移动端可折行或横向压缩，但不隐藏核心导航
- Header 不应挤占过多纵向空间，应明显比当前页面首屏更紧凑

### Shared Page Rhythm

全站页面节奏统一为：

1. Header
2. 紧凑页面标题区
3. 筛选区 / 操作区
4. 主内容列表或表单区

原则：

- 页面标题区高度收缩
- 页面说明只保留一小段
- 主内容尽快进入可操作状态

## Typography

### Font Choice

全站切换为和 `Lumina` 一致的主字体：

- `LXGW WenKai Mono`

实施要求：

- 在 `infinitum` 本地静态资源中引入字体文件
- 不仅通过 CSS 变量命名模拟，而是真正落地同款字体资源

### Typography Rules

- `body`、标题、筛选 label、卡片元信息统一基于该字体体系
- 标题不做过大尺寸堆叠
- 元信息字号偏小但清晰
- `mono` 风格 label 用于日期、状态、计数、筛选说明

目标效果：

- 首页列表和后台页看起来都更像 `Lumina` 的编辑后台，而不是默认 SaaS 风格

## Global Style Tokens

`src/app/globals.css` 中的核心 token 要整体向 `Lumina` 靠拢。

### Color Direction

- 页面背景：偏浅灰
- 卡片背景：白色
- 次级区域：非常浅的灰
- 文本：
  - 主文本近黑
  - 次文本中灰
  - 辅助文本更浅
- 强调色：
  - 使用 `Lumina` 风格的克制蓝
- 危险 / 成功状态：
  - 保留现有语义，但视觉上贴近 `Lumina` 的柔和浅底方案

### Shape and Depth

- 边框比当前更重要
- 阴影比当前更弱
- 圆角比当前略收紧
- 卡片之间依赖边框和间距而不是厚重阴影区分

### Density

- 输入框高度适当降低
- 按钮高度适当降低
- 卡片 padding 收紧
- 区块之间垂直间距整体下降一档

## Homepage Feed

### Primary Goal

首页改造目标是尽量接近 `Lumina` 的文章列表页，而不是保留当前偏“产品首页 + 工作台概览”的结构。

### Structure

首页重组为以下层级：

1. 共享 Header
2. 紧凑标题与一句说明
3. 顶部筛选区
4. 信息流列表

### Header Area

首页不再保留大幅 Hero 结构。

保留内容：

- 小标题或轻量标题
- 一句说明文字
- 管理员状态信息可弱化保留

移除方向：

- 大块展示型概览卡片
- 过多不直接服务列表浏览的首屏内容

### Filter Area

筛选区参考 `Lumina list` 页，紧贴列表顶部，改成高密度工具条。

#### 第一行优先项

- 时间范围
- 排序
- 刷新
- 管理员动作（若用户为管理员）

#### 第二行细分项

- 自定义起止日期
- 分组过滤
- 来源过滤

#### Styling

- 筛选条为单独白卡片
- 标签与控件更紧凑
- 控件高度降低
- 控件间距更小
- 整体更像编辑部工具栏而不是表单面板

### Feed List Cards

#### General Principle

列表项从“展示型卡片”改为“判断型卡片”。

要求：

- 单卡高度下降
- 重要信息集中
- 一屏显示更多条目

#### Card Content Hierarchy

每条卡片应包含：

1. 标题
2. 元信息行
   - 来源
   - 发布时间
   - 分组 / 来源域 / 类型等必要信息
3. 摘要
   - 限制更紧，避免大段文本拉高卡片
4. 指标与状态
   - 评分
   - 条目数
   - 来源数
5. 管理员操作区
   - 如当前用户为管理员

#### Cluster vs Single

- `cluster` 与 `single` 共用同一视觉语言
- 只在局部信息上区分，不做两套截然不同的卡片系统
- `cluster` 预览子项保留，但默认更紧凑

#### Visual Tone

- 标题更直接
- 元信息横向串联
- 弱化装饰性大标签
- 提升内容扫描速度

## Review Page

### Goal

内容审核页改成更接近 `Lumina admin` 的高密度管理列表，而不是当前偏工作台卡片模式。

### Preserve

- `过滤内容`
- `聚合管理`

### Change

- 顶部使用共享 Header
- 页面标题区缩小
- tab 区更像 `Lumina` 风格分段导航
- 审核条目改为紧凑列表卡片

#### Filtered Items

每条内容需集中展示：

- 标题
- 来源
- 时间
- 过滤原因
- 分数
- 摘要短预览
- 行内操作按钮

#### Cluster Management

每个 cluster 展示：

- 标题
- 状态
- 内容数
- 分数
- 子项紧凑预览
- 隐藏 / 恢复 / 重生成 / 移出条目操作

原则：

- 同屏可见 cluster 数量增加
- 减少大块空白与过高卡片

## Monitor Page

### Goal

任务监控页继续保留三块功能，但视觉密度与列表组织向 `Lumina admin` 靠拢。

### Preserve

- 调度设置
- 运行中任务
- 最近任务

### Change

- 共享 Header
- 标题区收紧
- 调度设置卡更紧凑
- 运行中任务与最近任务更像后台记录列表

#### Running Tasks

保留突出性，但不使用过度装饰。

每条任务尽量单卡展示：

- 任务名
- 状态
- 触发方式
- 类型
- AI 调用
- 错误摘要
- 操作按钮

#### Recent Tasks

- 与运行中任务共用视觉语言
- 但强调程度略低

## Settings Page

### Goal

后台设置页继续保留原有功能，但视觉上更像 `Lumina admin` 的 section panel，而不是松散表单堆叠。

### Preserve Sections

- 基础配置
- 黑名单
- 分组管理
- 信息源管理

### Change

- 共享 Header
- 页面标题区收紧
- 四个 section 作为连续后台面板呈现
- 输入控件更紧凑
- textarea 更易读
- 信息源与分组条目更像管理行

### Density Rules

- section padding 收紧
- 表单项间距收紧
- 列表型编辑区减少“空盒子感”
- 按钮行更集中

## Login Page

登录页不做大幅业务结构改变，但应跟随新的共享视觉系统：

- 字体切换为 `LXGW WenKai Mono`
- 顶部 header 同体系
- 间距、边框、阴影与首页/后台一致
- 整体不再像独立登录壳层

## Accessibility

必须保持：

- 顶部导航可键盘访问
- icon 按钮具有可访问名称
- 页面标题层级合理
- 各筛选控件 label 清晰
- 后台区域标题仍可通过可访问查询命中

## Testing Strategy

### Structural Tests

需要补或更新测试，至少覆盖：

- 顶部共享 Header 导航存在：
  - `主页`
  - `审核`
  - `管理`
- 登录态按钮在不同页面上仍可访问
- 首页存在紧凑筛选区与列表结构
- 后台各页保留原命名 region / 标题结构

### Regression Tests

不能破坏现有行为：

- feed 过滤、排序、分页、cluster 展开
- 审核动作
- 调度保存与任务取消
- 设置保存、OPML 导入、RSS 自动填充、信息源编辑

### Final Verification

实现完成后应至少运行：

- 相关组件测试
- `npm run lint`
- `npm run build`
- `npm test`

## Implementation Scope Control

本轮只做“布局、密度、字体、共享骨架”层面的高保真适配，不做：

- 新增业务功能
- 路由结构调整
- API 协议变更
- 与 `Lumina` 无关的扩展性重构

## Success Criteria

完成后应满足：

1. 全站存在统一的 `Lumina` 风格顶部 Header。
2. 首页列表明显更接近 `Lumina` 文章列表页，信息密度显著提升。
3. 后台页在字体、导航、间距和信息密度上明显属于同一套系统。
4. 全站字体切换为与 `Lumina` 一致的 `LXGW WenKai Mono`。
5. 现有核心业务行为与测试不被破坏。
