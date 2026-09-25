---
version: 1
name: Personal Emotion GPT
description: 企业知识库产品界面。暖象牙纸面配深褐侧栏，衬线标题，暮色陶红只作少量强调。模型在供应商设置里接入，在对话输入区切换。

colors:
  primary: "#b36b5c"
  primary-active: "#9a574a"
  primary-disabled: "#e8ddd6"
  ink: "#2c241f"
  body: "#52463f"
  body-strong: "#3a322c"
  muted: "#8a7d74"
  muted-soft: "#9a8f86"
  hairline: "#ebe4dc"
  hairline-soft: "#f0ebe4"
  canvas: "#f7f2ec"
  surface-soft: "#fffaf5"
  surface-card: "#f0e8df"
  surface-cream-strong: "#e8ddd3"
  surface-dark: "#1c1714"
  surface-dark-elevated: "#29231f"
  surface-dark-active: "#332c27"
  on-primary: "#ffffff"
  on-dark: "#f7f1eb"
  accent-teal: "#5db8a6"
  accent-teal-text: "#2f6f64"
  primary-text-on-light: "#8a4a34"
  error: "#a63d2f"

typography:
  display:
    fontFamily: "Instrument Serif, Georgia, serif"
    fontSize: 36px
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: -0.5px
  title:
    fontFamily: "Outfit, PingFang SC, sans-serif"
    fontSize: 16px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0
  body:
    fontFamily: "Outfit, PingFang SC, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: 0
  caption:
    fontFamily: "Outfit, PingFang SC, sans-serif"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0.8px
  code:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0

rounded:
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  pill: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px

layout:
  sidebar-width: 272px
  header-height: 56px
  content-max: 760px

components:
  app-shell:
    backgroundColor: "{colors.canvas}"
    sidebar: "{colors.surface-dark}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    padding: 8px 14px
  button-secondary:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
  mode-segment:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
  composer:
    backgroundColor: "{colors.surface-soft}"
    rounded: "{rounded.xl}"
  model-chip:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
  model-menu:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
  provider-card:
    backgroundColor: "{colors.surface-soft}"
    rounded: "{rounded.xl}"
---

## Overview

Personal Emotion GPT 是知识库工作台，不是营销站。页面气质是**夜里的树洞加暖纸**：侧栏用 `{colors.surface-dark}`，主区用 `{colors.canvas}`。标题用 Instrument Serif，正文和控件用 Outfit。强调色 `{colors.primary}` 只用于主按钮、选中描边和少量链接。

实现必须使用 `apps/web/app/globals.css` 里已有的 CSS 变量（`--color-primary`、`--color-canvas`、`--font-display` 等）。禁止在组件里新写一套 hex。

## 信息架构

每个产品页都落在同一套壳里：左侧固定导航，右侧纸面内容。导航项顺序保持：对话、Agent、知识库、设置。Chat 与 Agent 是同一对话壳上的分段控件，不是两套布局。

模型分两处，职责不能混：

1. **设置 · 模型供应商**：接入网关、保存 API key、添加自定义模型名、指定系统推理模型。Agent 默认与系统模型相同，只有用户主动打开时才单独指定。向量模型不出现在聊天模型列表里；更换向量模型必须说明需要重新索引。
2. **对话与 Agent 输入区**：在输入框工具条放一枚 `{component.model-chip}`。点开的菜单只列出设置里已经添加的模型，用来切换当前模式（Chat 或 Agent）下一次发送所用的模型。菜单底部用一条「管理模型」回到设置。对话里不出现 API key 输入框。

## Colors

以 `{colors.*}` 为准，并且与 `apps/web/app/globals.css` 的 `--color-*` 一一对应。禁止新增未写入该文件的色值。

| 令牌 | CSS 变量 | Hex | 用途 |
| --- | --- | --- | --- |
| canvas | --color-canvas | #f7f2ec | 主区底 |
| surface-soft | --color-surface-soft | #fffaf5 | 卡片、输入底 |
| surface-card | --color-surface-card | #f0e8df | 分段控件、模型胶囊底 |
| surface-cream-strong | --color-surface-cream-strong | #e8ddd3 | 菜单里的当前项 |
| surface-dark | --color-surface-dark | #1c1714 | 侧栏 |
| surface-dark-active | --color-surface-dark-active | #332c27 | 侧栏当前项 |
| primary | --color-primary | #b36b5c | 主按钮、选中强调 |
| ink | --color-ink | #2c241f | 标题与正文强色 |
| body | --color-body | #52463f | 说明 |
| muted | --color-muted | #8a7d74 | 次要标签、模型 id |
| hairline | --color-hairline | #ebe4dc | 1px 分隔与次按钮描边 |
| error | --color-error | #a63d2f | 错误 |
| accent-teal-text | --color-accent-teal-text | #2f6f64 | 已连接等成功状态文字 |

## Typography

- 页标题：`{typography.display}`，字重 400，不用粗体衬线。
- 控件与正文：`{typography.body}` / `{typography.title}`，字体 Outfit。
- 模型 id、密钥掩码：`{typography.code}`。
- 小节标签：`{typography.caption}`，可加大写字距，颜色用 muted。

## Components

**app-shell**：左侧栏宽 `{layout.sidebar-width}`，右侧纸面。内容阅读宽度不超过 `{layout.content-max}`，设置页可以稍宽，但卡片仍用同一圆角与描边。

**mode-segment**：Chat / Agent 胶囊，放在对话区顶栏。当前项是 `{colors.surface-soft}`，未选项落在 `{colors.surface-card}` 底上。

**composer** + **model-chip** + **model-menu**：输入区是一张浅色卡片。模型胶囊在输入框上方左侧。菜单从胶囊向上展开，宽度约 280px，当前项用 `{colors.surface-cream-strong}` 底，不使用价格标签。

**provider-card**：设置页里一家供应商一张卡片。标题加连接状态（已连接、地址、密钥掩码）。模型是卡片内的列表。添加模型是卡片底部的一行：模型名、该模型的 API key、提交。密钥不回显。

**button-primary / button-secondary**：主按钮陶红底白字。次按钮浅底、`{colors.hairline}` 描边。不要用纯黑作为唯一主按钮，侧栏里的深色已经承担对比。

## Do's and Don'ts

### Do

- 新页面先套 app-shell，再写内容。
- 颜色、圆角、字号引用本文件令牌或 `globals.css` 变量。
- 对话里的模型菜单只展示已配置模型，并标明它作用于当前的 Chat 或 Agent。
- 密钥只在设置页收集，掩码显示，不进对话气泡，不进前端日志。

### Don't

- 不要用 Claude 营销稿的色值 `#cc785c`、`#faf9f5`、`#141413`，也不要引入 Inter、Roboto、紫色渐变。
- 不要把 Chat 和 Agent 做成两套模型商店，或在列表上标价格。
- 不要在对话页填写 API key。
- 不要把向量模型、重排模型和聊天模型放进同一个下拉。
- 不要为设置页做全屏营销英雄区、价格卡或大面积陶红底。

## Responsive

- 小于 768px：侧栏收起，对话优先，模型菜单仍贴在输入区上方，宽度不超过屏幕减 32px。
- 可点区域至少 40px 高。输入与模型胶囊除外观缩放外，不改变信息结构。

## 实现对照

样式真源是 `apps/web/app/globals.css`。结构参考：

- `design/chat-ui-mock-v1.html`：对话壳
- `design/model-picker-mock.html`：输入区切换模型，以及设置页供应商卡片

以后新增页面或组件，先对照本文，再写界面。
