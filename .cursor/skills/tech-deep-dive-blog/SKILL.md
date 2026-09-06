---
name: tech-deep-dive-blog
description: >-
  Writes engineering deep-dive blog posts with consistent depth: contradiction,
  tradeoffs, why/advantages/counterfactuals, call chains, self-contained code,
  observability, verification, and honest boundaries. Use when drafting or
  rewriting technical blog/series articles, Phase notes for external readers,
  post-implementation retrospectives, or when the user asks for blog structure
  aligned with personal-gpt blog/phase-1-*.md depth.
---

# Tech Deep-Dive Blog

把「做完功能之后的工程复盘」写成**对外可读、深度一致**的技术文。  
权威样例（若在本仓库）：`blog/phase-1-01-async-ingest.md`、`blog/phase-1-02-query-router.md`、`blog/phase-1-03-streaming-citations.md`。

详细模板见 [TEMPLATE.md](TEMPLATE.md)。完稿自检见 [DEPTH-CHECKLIST.md](DEPTH-CHECKLIST.md)。

---

## When to apply

- 用户要写 / 改 / 加深技术博客、系列篇、复盘文
- 要求「和 phase-1-0x 一样深」「对外发、读者看不到仓库」
- 要把某模块讲清楚：为什么、优势、不做会怎样、代码原理

**不要**用来写：纯 API 手册、changelog、面试题库口吻文、无代码的空谈架构。

---

## Non-negotiables（深度底线）

1. **代码为准**：先读实现再写；禁止发明未落地的能力。
2. **对外自洽（零仓库路径）**：读者**没有**你的 monorepo。正文禁止以仓库路径当引用（见下节硬规则）。文内须含完整核心代码；禁止「见某文件」代替实现。
3. **零基础术语**：本篇首次出现的黑话（BM25、RRF、Cypher、SSE…）须在 **§0**（或文内首次出现处）用「是什么 → 像什么 → 本项目怎么用」讲清；禁止甩缩写不解释。
4. **复盘语气**：开发后整理。禁止「面试官会问」「口述技巧」「简历亮点」等措辞。
5. **矛盾驱动**：开场是真实工程张力，不是功能清单。
6. **必答五问**（可独立成 §3，或织进取舍/实现）：
   - 这是什么（组件/层/机制）
   - 为什么这么做
   - 有什么优势
   - 不做会怎样（反事实表）
   - 原理如何对照代码数据流
7. **诚实边界**：写清没做 / 只做到「能用」/ 已知坑；不装生产完备。
8. **可验证**：给读者可操作的验证表或步骤（优先公开命令 / API，不写测试文件路径）。
9. **中文正文**（除非用户要求别的语言）；代码与标识符保持原样。

---

## 对外写作硬规则（路径 / 命名）

文章默认**对外发布**。写作时你可读仓库；**落笔时读者看不见仓库**。

| 禁止写进正文                                              | 改写成                                                                 |
| --------------------------------------------------------- | ---------------------------------------------------------------------- |
| `packages/...`、`apps/...`、`tests/...`、`src/...` 等路径 | 导出函数 / 模块职责名：`` `hybridSearch` ``、`` `resolveIntentPlan` `` |
| 「见 `foo/bar.ts`」「打开某某目录」                       | 文内贴控制流；或说「共享混合检索模块」                                 |
| 调用链里的 `apps/agent-service`                           | 「Agent 服务 · `invokeKbSearch`」                                      |
| 验证里的 `node tests/.../run-….mjs`                       | `` `yarn eval:phase-3` `` / 「跑 Phase 3.1 全量 UAT」                  |
| 架构图节点 `packages/shared`                              | 「共享逻辑层」                                                         |
| 表头「代码入口」填 `rrf.ts`                               | 「备注 / 关键符号」填函数名                                            |

**允许**出现在正文里的标识：

- 导出符号、类型、env 名、默认阈值（如 `ENABLE_RERANKER`、`RRF_K=60`）
- 对外 HTTP（`/api/chat`）、产品层服务名（Chat / Agent / 入库 worker）
- 公开脚本命令（`yarn test:regression:phase-3`）
- 验收产物**逻辑名**（FULL-FLOW Wave B、带日期 UAT 报告），不要仓库相对路径

**内部笔记例外**：仅 `PHASE-*-FACT-CHECK.md`、质量审阅清单等**明确标为作者内部**的文件可保留路径；深挖正文与系列总览**不适用例外**。

完稿前自检（可脚本化）：正文中不应再匹配 `packages/`、`apps/`、`tests/`（系列文相对链接 `./phase-3-….md` 除外）。

---

## Workflow

```
Task Progress:
- [ ] 1. 锁定主题与读者（外部工程师 / 系列第 N 篇）
- [ ] 2. 用 codegraph / 读源码列出真实调用链与常量（仅作者侧）
- [ ] 3. 列出本篇黑话 → 起草 §0（是什么 / 像什么 / 本项目）
- [ ] 4. 写出开场矛盾（2–3 个具体张力）
- [ ] 5. 起草 §「为什么 / 优势 / 不做 / 原理」
- [ ] 6. 方案取舍表（含「为何不选」）
- [ ] 7. 调用链 + 自包含核心代码（路径已 scrub）
- [ ] 8. 观测字段 / 验证 / 诚实边界 / 收束
- [ ] 9. 对照 DEPTH-CHECKLIST.md 补洞（含路径 / 术语门禁）
```

### Step 2 要点（读源码，不写进路径）

- 阈值、端口、重试次数、默认开关以代码为准。
- 灰区行为、失败降级、空库路径必须写对（易与直觉相反）。
- 系列文要标明本篇职责边界（例：路由只负责「要不要检」）。
- 落笔时把文件路径 scrub 成函数名 / 服务名。

### 五问 / 原理草稿标准

反事实表至少 4 行；原理用 `text` 数据流或短代码短路求值；优势要相对「常见极端做法」对比，不要空夸。

### Step 3 要点（§0）

每个本篇专用术语至少三行：是什么、像什么、本项目怎么用。总览篇可用短索引表链到各篇 §0。

---

## Article skeleton（必须覆盖的块）

顺序可微调，**块不能缺**（系列总览篇可省略实现代码，但须有架构与边界）：

| #   | 块                     | 作用                                          |
| --- | ---------------------- | --------------------------------------------- |
| 0a  | 标题 + 系列导航引文    | 第 N 篇、上下篇、自洽声明                     |
| 0b  | 零基础 §0              | 本篇黑话：是什么 → 像什么 → 本项目            |
| 1   | 开场矛盾               | 具体张力，不是Slogan                          |
| 2   | 本篇目标               | 一句话范围 + 不负责什么（无仓库路径）         |
| 3   | 为什么/优势/不做/原理  | 深度核心；可拆 3.x                            |
| 4   | 方案取舍               | 表 + 为何不选备选                             |
| 5   | 调用链                 | 纯文本流程；服务名 / 函数名，无 monorepo 路径 |
| 6   | 关键实现               | 完整核心代码，可运行理解                      |
| 7   | 观测（若有运行时行为） | 结构化日志字段 / 指标                         |
| 8   | 如何验证               | yarn / API / 验收逻辑名                       |
| 9   | 诚实边界               | 未做与风险                                    |
| 10  | 收束                   | 3–5 条因果链 + 下篇链接                       |

完整 Markdown 骨架：[TEMPLATE.md](TEMPLATE.md)。

---

## Tone & style

| 要                                 | 不要                           |
| ---------------------------------- | ------------------------------ |
| 「也曾想过」「事后整理」「根因是」 | 「面试常问」「亮点」「背下来」 |
| 「空库 → low_sim → direct」写死    | 含糊「一般会降级」             |
| `` `hybridSearch` `` / Agent 服务  | `packages/...`、`apps/...`     |
| §0 三句话解释 BM25                 | 缩写裸奔或「自行查阅」         |
| 经验阈值标明「需按语料重标」       | 假装最优解                     |
| 与上下游篇职责切开                 | 一篇写尽整条 RAG               |

---

## Series rules

- 第 0 篇：全景 + 目录 +「深挖篇自带代码」声明。
- 深挖篇：单决策/单机制；文首导航；文末链下一篇。
- 企业指标若写数字：必须实测或标明未测；禁止编造 P95/成本。

---

## Quality gate

完稿前打开 [DEPTH-CHECKLIST.md](DEPTH-CHECKLIST.md)，全部勾选再交付。  
若用户只要「略加深」，至少补齐：五问块、反事实、诚实边界、自包含代码。
