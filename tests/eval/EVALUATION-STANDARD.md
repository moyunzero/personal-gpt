# Personal GPT 知识库评价标准

> **用途**：对外展示项目质量底座 · 立项/路演「可测、可门禁」亮点 · 生产级知识库验收与持续运营标准  
> **基线版本**：v3.0 + Phase 3.1（混合检索 · 记忆 · Graph demo · 意图路由）  
> **最后更新**：2026-08-23（增补企业级 L1–L5 框架 · 简历表述模板）

---

## 0. 个人项目 vs 企业级：评价维度差异

| 视角     | 个人 / 原型项目    | 企业级知识库                             |
| -------- | ------------------ | ---------------------------------------- |
| 成功标准 | 「能跑通、能演示」 | **用数据证明**检索、生成、性能、业务价值 |
| 检索     | 肉眼看像对的       | Recall@K、MRR、Hit Rate、A/B 对比        |
| 生成     | 模型看起来聪明     | Faithfulness、幻觉率、引用对齐           |
| 工程     | 本地 dev 可用      | P95 延迟、QPS、Token 成本、SLO           |
| 业务     | 很少量化           | 效率提升、ROI、培训周期、工单下降        |
| 运营     | 无流量             | MAU、CSAT、问题解决率、知识贡献率        |

本文档 **两层并存**：

1. **企业级 L1–L5**（§2）— 对外路演、简历、生产 SLO 的通用语言。
2. **工程基建 + P0/P1/P2**（§3–§4）— 本仓库 Golden、回归、UAT 的可执行门禁。

**层间映射**（避免两套口径打架）：

| 企业级层次             | 核心问题             | 本仓库工程层  | 主要指标 ID                |
| ---------------------- | -------------------- | ------------- | -------------------------- |
| **（基建）数据与入库** | 传得进、索引一致？   | L0 入库       | E-01 · E-02                |
| **L1 检索质量**        | 能否找到相关文档？   | L2 检索       | R-01–R-04 · I-01 · G-01    |
| **L2 生成质量**        | 答案准不准、真不真？ | L3 生成与引用 | Gen-01–03 · G-02           |
| **L3 性能与成本**      | 快不快、贵不贵？     | L4 性能子集   | Lat-01–02 · S-01 · Cost-01 |
| **L4 业务价值**        | 值不值得做？         | 产品/业务侧   | Biz-01–03（需业务数据）    |
| **L5 用户与运营**      | 用得好不好？         | L4 运营子集   | Ops-01–03 · L5-01–03       |

---

## 1. 定位与原则

### 1.1 我们在评价什么

知识库产品的用户价值可以拆成一句话：

**在正确权限与语料边界内，用可引用的证据，稳定、快速地回答用户问题。**

因此评价必须覆盖 **检索 → 生成 → 性能 → 业务 → 运营**（企业 L1–L5），而不是只看「模型聪不聪明」：

| 层级（工程口径）    | 核心问题                                 | 对外一句话                   |
| ------------------- | ---------------------------------------- | ---------------------------- |
| **L0 数据与入库**   | 文档能否完整、及时进入可检索形态？       | 「传得进、切得对、索引一致」 |
| **L1 检索**         | 问法多变时能否找到对的 chunk / 文档？    | 「检得准、不串库」           |
| **L2 生成与引用**   | 答案是否忠实于检索结果、引用是否可信？   | 「答得真、引得对」           |
| **L3 端到端与运营** | 路由、延迟、Agent 任务、线上稳定性如何？ | 「用得稳、链路可观测」       |

（与企业级 L1–L5 对照见 §0 映射表。）

### 1.2 评价原则（生产级）

1. **分层门禁**：检索不过，不讨论生成；生成不过，不讨论体验打磨。
2. **Golden Set 驱动**：每条指标对应可复现用例，而非主观印象。
3. **确定性优先**：CI 用 mock / 规则断言；LLM-as-judge 仅作 nightly 或发版前补充。
4. **分 corpus / 分意图**：`user` / `seed`、Chat / Agent、`kb_doc` / `graph_relation` 分桶统计，禁止混成一个分数。
5. **可对外复述**：每个 P0 指标都能说清「怎么测、阈值多少、仓库里哪条命令」。

### 1.3 对标视野（不照搬）

| 市场能力        | 头部产品关注点    | Personal GPT v3 覆盖                         | v4 目标                |
| --------------- | ----------------- | -------------------------------------------- | ---------------------- |
| 混合检索 + 重排 | RAGFlow / FastGPT | ✅ hybrid + rerank + corrective（可 env 关） | 默认策略固化           |
| 引用可解释      | Copilot / Glean   | ✅ citation 卡片 + Agent trace               | ACL 裁剪引用           |
| 图谱增强        | Graph RAG         | ✅ Neo4j seed demo + 意图硬路由              | 用户库自动构图         |
| 评测门禁        | 企业交付          | ✅ Golden + 回归 + UAT                       | CI 质量门禁 + 线上监控 |
| 权限感知检索    | Glean / MaxKB     | ⏳                                           | v4 SSO + ACL           |

---

## 2. 企业级指标框架总览（L1–L5）

> 简历、路演、对外白皮书建议 **从本表选取 3–5 个有数据的层次** 组合叙述，避免只堆技术名词。

| 评估层次          | 核心问题             | 典型指标                                       | Personal GPT v3 可测 / 待补                                       |
| ----------------- | -------------------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| **L1 检索质量**   | 能否找到相关文档？   | Recall@K · MRR · Precision@K · NDCG · Hit Rate | ✅ Citation Hit · forbidSources · hybrid A/B · ⏳ 标注集 Recall@K |
| **L2 生成质量**   | 答案准不准？         | Faithfulness · Answer Relevance · 幻觉率       | ✅ 人工抽检 · UAT · ⏳ RAGAS 自动化                               |
| **L3 性能与成本** | 快不快？成本高不高？ | P95/P99 延迟 · QPS · Token 消耗                | ✅ metric 日志 · ⏳ 压测与成本仪表盘                              |
| **L4 业务价值**   | 值不值得做？         | 效率提升 · 成本节约 · ROI                      | ⏳ 需真实业务场景（见 §2.4）                                      |
| **L5 用户与运营** | 用得好不好？         | MAU · CSAT · 问题解决率 · 知识贡献率           | ⏳ 需登录与运营数据（见 §2.5）                                    |

### 2.1 L1：检索质量（Retrieval Quality）

RAG 的地基——企业简历里应优先体现 **可量化的检索优化**。

| 指标                 | 定义                                            | 建议用法                        |
| -------------------- | ----------------------------------------------- | ------------------------------- |
| **Recall@K**         | 前 K 条结果中，召回的相关文档占全部相关文档比例 | 需 chunk 级标注；K 常用 5/10    |
| **MRR**              | 第一个正确答案排名的倒数均值                    | 排序质量；适合对比 rerank 前后  |
| **Precision@K**      | 前 K 条中真正相关的比例                         | 与 Recall 联看                  |
| **NDCG@K**           | 相关性等级 + 位置加权                           | 多级相关性标注时                |
| **Hit Rate / Hit@K** | 前 K 条是否 **至少** 出现一个正确结果           | 与 Golden **Citation Hit** 同类 |

**本项目可落地**：

- **Citation Hit Rate**（R-01）≈ 业务向 Hit@K（文档级）。
- **Forbidden Source Rate**（R-02）= 0 → 企业场景「不串库 / 不越权语料」。
- **混合检索 A/B**：仅向量 vs `hybridSearch`（BM25 + 向量 + RRF）→ 填 Recall@K / MRR 提升。
- **Rerank Lift**（R-04）：`ENABLE_RERANKER` 前后对比（可选 OpenRouter rerank）。

**简历 / 路演写法模板**（将 `【基线】→【优化后】` 替换为实测或 Golden 全量结果）：

> 构建混合检索评估体系，采用 **BM25 + 向量检索** 与 **RRF 融合**（`packages/shared` · `hybridSearch`），在 Golden Set（`golden.json` **N** 条）上 **Citation Hit@5** 从 **【基线】% 提升至 【优化后】%**；引入可选 **Reranker**，**MRR** 从 **【基线】提升至 【优化后】**。用户库 / 种子库 **物理隔离**，误检禁止来源 **0%**。

**门禁**：`yarn eval:phase-3` · `yarn eval:phase-3:nightly` · `yarn test:regression:phase-3`

### 2.2 L2：生成质量（Generation Quality）

关注答案本身是否 **可靠、可引用、可审计**。

| 指标                          | 定义                             | 建议阈值（发版抽检）                  |
| ----------------------------- | -------------------------------- | ------------------------------------- |
| **Faithfulness（忠实度）**    | 答案是否严格基于检索文档，无编造 | ≥ 0.85（人工 1–5 映射）或 judge ≥ 85% |
| **Answer Relevance**          | 是否直接、完整回答问题           | ≥ 90%                                 |
| **幻觉率**                    | 与上下文/事实不符的陈述占比      | 相对基线下降 ≥ 30% 或 < 10%           |
| **Citation Snippet Accuracy** | 引用片段是否支撑对应句           | ≥ 90%（Gen-03）                       |

**本项目可落地**：

- Chat：`data-citations` 卡片（title / similarity / snippet）。
- Agent：`single_specialist` 合成 + trace；kb_doc 禁止虚假「未找到」脚注。
- Graph：成文不得编造 path 外实体（G-01 · G-02）。
- 发版前 **§6 人工抽检表** 30–50 条。

**简历写法模板**：

> 设计 **引用可追溯** 的 RAG 回答链路（`data-citations` + Agent trace），通过 Prompt / 上下文裁剪与 **single_specialist 单一 miss 出口**，抽检 **Faithfulness** 达 **【分数/通过率】**，**幻觉类 bad case** 较基线 **降低 【X】%**。Phase 3.1 UAT **【N/N】** 关键路径通过。

### 2.3 L3：系统性能与成本（Performance & Cost）

证明 **工程可落地、资源可控**——企业面试高频区。

| 指标                  | 定义                  | 建议关注                           |
| --------------------- | --------------------- | ---------------------------------- |
| **P95 / P99 Latency** | 95%/99% 请求完成时间  | 分 Chat / Agent · 分 Groq / Ollama |
| **首 Token 延迟**     | 流式体验              | SSE `text-start` 间隔              |
| **QPS / Throughput**  | 每秒可处理请求数      | 压测 `k6` / `locust`（v4）         |
| **Token 消耗**        | 单次 query 平均 token | 路由 + 裁剪 + 缓存直接影响成本     |
| **检索超时率**        | 向量/混合检索超时占比 | Lat-02 · `< 1%`                    |

**本项目可落地**：

- 结构化日志：`[METRIC] vector.search.*` · `ratelimit.*`。
- Embedding LRU 缓存（`EMBEDDING_CACHE_SIZE`）。
- 可选 HyDE / Multi-Query / Reranker 对延迟与 token 的权衡（env 开关）。
- UAT 报告记录模型栈（Ollama vs Groq）与全链路耗时。

**简历写法模板**：

> 通过 **embedding 缓存**、检索超时护栏（`VECTOR_SEARCH_TIMEOUT_MS`）与 **意图快路径**（L0 规则路由），Chat **P95 全链路延迟** 控制在 **【Xs】**（注明模型与是否 hybrid/rerank）；单次问答 **Token 消耗** 经路由裁剪后 **【约 N tokens】**（较全开 RAG 增强 **降低 【X】%**）。

### 2.4 L4：业务价值与影响（Business Value）

企业最关心：**省了多少钱、省了多少时间**——个人项目通常缺数据，但文档应预留指标位。

| 指标           | 含义                             | 典型采集方式        |
| -------------- | -------------------------------- | ------------------- |
| **效率提升**   | 任务耗时缩短（客服、研发查文档） | 工单系统 / 工时对比 |
| **成本节约**   | 培训费、二线升级、外包咨询下降   | 财务估算            |
| **ROI**        | 收益 / 投入                      | 立项与复盘          |
| **知识复用率** | SOP/文档被检索命中频次           | 检索日志分桶        |

**Personal GPT 当前阶段（诚实口径）**：

- v3 为 **可演示、可验收** 的个人/团队知识库基线，**尚无内置 ROI 仪表盘**。
- 对外可说：**工程上已具备** Golden + UAT + 混合检索，**业务价值需在真实场景试点后填数**。

**简历写法模板**（有试点数据时启用）：

> 知识库上线后，**【角色/场景】** 平均 **问题处理时长缩短 【X】%**；SOP 知识化后 **新员工培训周期缩短 【X】%**；预计 **年节约 【金额/人力】**（ROI **【比值】**）。

**无业务数据时的替代亮点**（本项目可用）：

> 交付 **可回归、可门禁** 的 RAG 质量体系（Golden **≥20** 条 · UAT **15/15** · 回归 **13/13**），为企业内试点降低 **「上线后不可控」** 风险。

### 2.5 L5：用户与运营（User & Operation）

证明系统是 **活的**，不是一次性 demo。

| 指标                | 含义                        | 建议阈值（上线后） |
| ------------------- | --------------------------- | ------------------ |
| **MAU / DAU**       | 月活 / 日活                 | 按组织规模定基线   |
| **CSAT**            | 用户满意度（问卷）          | ≥ 4.0/5            |
| **问题解决率**      | 用户认为「已解决」的比例    | ≥ 80%              |
| **知识贡献率**      | 上传/更新文档的活跃用户占比 | 运营健康度         |
| **重问率 / 升级率** | 同主题重复问、转人工        | 下降趋势（Ops-02） |
| **负面反馈率**      | 点踩、纠错                  | Ops-03             |

**本项目可落地（部分）**：

- Ops-01 空检索率 · Ops-02 重问率 · Ops-03 负面反馈 → 需 **登录 + 埋点**（v4）。
- `/kb` 上传与 ingest SSE → 知识贡献链路已有，缺统计面板。

**简历写法模板**：

> 系统 **MAU 【N】**、内部调研 **CSAT 【X】/5**；知识库 **问题解决率 【X】%**，**二线升级工单下降 【X】%**。

---

## 3. 工程指标总览（P0 / P1 / P2 · 可执行门禁）

### 3.1 P0 — 发版必过（对外可承诺）

| ID       | 指标                    | 定义                                      | 建议阈值                                     | 本项目落点                            |
| -------- | ----------------------- | ----------------------------------------- | -------------------------------------------- | ------------------------------------- |
| **R-01** | Citation Hit Rate       | Golden 问句 top 引用来源命中期望文档      | **≥ 95%**（smoke）/ **≥ 90%**（全量 golden） | `yarn eval:phase-3`                   |
| **R-02** | Forbidden Source Rate   | 不应出现的来源（如 psychology 污染 user） | **= 0%**                                     | `golden.json` · `forbidSources`       |
| **I-01** | Intent Primary Accuracy | L0/L1 意图主类与期望一致                  | **≥ 95%**（规则类 query）                    | `golden.json` · `expectIntentPrimary` |
| **G-01** | Graph Path Presence     | 图谱类 query SSE/UI 含合法路径            | **100%**（seed 子集）                        | Phase 3.1 UAT · `data-graph-paths`    |
| **G-02** | No Cypher Leak          | 用户可见层不暴露 raw Cypher               | **100%**                                     | Chat API / UI 断言                    |
| **E-01** | Ingest Success Rate     | 合法文件入库成功率                        | **≥ 99%**                                    | worker 指标 / 验收                    |
| **E-02** | Dual-write Consistency  | 向量库与 ES 写入/删除一致                 | **100%**（验收用例）                         | Phase 3 full-flow                     |
| **U-01** | E2E UAT Pass Rate       | API + UI 关键路径验收                     | **100%**                                     | `FULL-UAT-REPORT.html`                |
| **S-01** | Core API Availability   | `/api/chat` · `/api/kb` · Agent health    | **≥ 99.9%**（生产）                          | 健康检查 + 告警                       |

### 3.2 P1 — 生产体验与可信度（对外加分项）

| ID          | 指标                      | 定义                                   | 建议阈值                   | 说明                             |
| ----------- | ------------------------- | -------------------------------------- | -------------------------- | -------------------------------- |
| **R-03**    | Recall@K / MRR            | 标注 chunk 是否出现在 top-K            | 按业务集定义 K             | 需标注集；golden 子集可算 Hit@K  |
| **R-04**    | Rerank Lift               | 重排前后 MRR 提升                      | **> 0**（关键 query 集）   | `ENABLE_RERANKER=true` 对比      |
| **Gen-01**  | Faithfulness              | 答案句可被引用支撑                     | **≥ 85%**（人工或 judge）  | 发版前抽检 30–50 条              |
| **Gen-02**  | Answer Relevance          | 答案是否回应问题                       | **≥ 90%**                  | 可与 Gen-01 分开评               |
| **Gen-03**  | Citation Snippet Accuracy | 引用片段是否支持对应句                 | **≥ 90%**                  | 比「有引用」更严                 |
| **Lat-01**  | Chat P95 Latency          | 首 token / 全链路 P95                  | **< 8s**（含检索，视模型） | 本地 Ollama vs 云 Groq 分桶      |
| **Lat-02**  | Retrieval Timeout Rate    | 向量/混合检索超时占比                  | **< 1%**                   | `[METRIC] vector.search.timeout` |
| **A-01**    | Agent Task Success        | 复杂任务终稿可用（kb 合成 / 图谱成文） | **≥ 85%**（golden 任务集） | Agent trace + 人工               |
| **A-02**    | Route Accuracy (Agent)    | `single_specialist` 与工具选择正确     | **≥ 95%**（规则集）        | `data-agent-trace`               |
| **M-01**    | Short Memory Recall       | 同 thread 上下文连贯                   | 抽检通过                   | Redis short memory               |
| **M-02**    | Long Memory Hit           | Mem0 偏好召回（若启用）                | 按用例                     | `MEM0_API_KEY` 时                |
| **Cost-01** | Token / 单次查询成本      | 路由 + 裁剪后均值                      | 分模型记录                 | 日志 + 模型账单                  |

### 3.3 P2 — 运营、治理与业务（v4+ / 上线后）

| ID         | 指标                   | 定义              | 建议阈值         | 企业层      |
| ---------- | ---------------------- | ----------------- | ---------------- | ----------- |
| **Sec-01** | ACL Recall Compliance  | 检索结果不越权    | **100%**         | L1 + 治理   |
| **Sec-02** | Audit Coverage         | 敏感操作可审计    | **100%**         | 治理        |
| **Ops-01** | Empty Retrieval Rate   | `no-docs` 占比    | 分意图监控       | L5 反向信号 |
| **Ops-02** | Re-query Rate          | 同主题短时间重问  | 下降趋势         | L5          |
| **Ops-03** | Negative Feedback Rate | 点踩 / 纠错       | < 5%（基线后定） | L5          |
| **Ops-04** | Error Budget           | 5xx + 限流 + 超时 | SLO 内           | L3          |
| **L5-01**  | MAU / DAU              | 活跃用户数        | 上线后定基线     | L5          |
| **L5-02**  | CSAT                   | 满意度问卷        | ≥ 4.0/5          | L5          |
| **L5-03**  | Resolution Rate        | 用户判定已解决    | ≥ 80%            | L5          |
| **Biz-01** | 效率提升               | 任务耗时变化      | 试点填数         | L4          |
| **Biz-02** | 成本节约               | 人力/培训/咨询    | 财务估算         | L4          |
| **Biz-03** | ROI                    | 收益 / 投入       | 立项复盘         | L4          |

---

## 4. 分层指标详解（工程实现）

### 4.1 L0 数据与入库

| 指标         | 怎么测                         | 亮点表述                             |
| ------------ | ------------------------------ | ------------------------------------ |
| 解析成功率   | 各格式样本集上传               | 支持 PDF/MD/TXT/DOCX 企业常见格式    |
| 切块合理性   | 人工抽检 chunk 边界            | LangChain splitter + 可观测 chunk 数 |
| 入库延迟 P95 | 上传 → `searchable`            | BullMQ 异步 + SSE 进度               |
| 索引一致性   | ingest 后 Astra/ES/Milvus 对账 | v3 双写验收（Wave B）                |

**门禁命令**：`yarn bench:ingest`（可选）· Phase 3 full-flow Wave B

### 4.2 L1 检索（企业 L1 · 工程落点）

| 指标                 | 怎么测                        | 本项目实现                              |
| -------------------- | ----------------------------- | --------------------------------------- |
| Citation Hit / Hit@K | golden `expectCitationSource` | `tests/eval/phase-3/golden.json`        |
| 防串库               | `forbidSources` 全为 0        | user corpus 不误检 psychology-qa        |
| 混合检索增益         | A/B：仅向量 vs hybrid         | `hybridSearch` + ES BM25 + RRF          |
| 图谱检索             | `graph_search` HIT + 路径节点 | Neo4j seed · `GRAPH_SEARCH_STATUS: HIT` |
| Corpus 隔离          | user / seed 物理 collection   | UI「种子库」开关                        |

**门禁命令**：

```bash
yarn eval:phase-3              # smoke 5 条
yarn eval:phase-3:nightly      # golden 全量 + 意图
yarn test:regression:phase-3   # hybrid / corpus / graph / intent
```

### 4.3 L2 生成与引用（企业 L2）

| 指标           | 怎么测                           | 说明                     |
| -------------- | -------------------------------- | ------------------------ |
| Faithfulness   | 答案每句能否在 citation 找到依据 | RAG 产品核心口碑指标     |
| 引用卡片完整度 | title / similarity / snippet     | `data-citations` UI      |
| Agent 合成诚实 | kb_doc 无虚假「未找到」脚注      | single_specialist 单出口 |
| 图谱成文       | 正文与 path 节点一致             | 禁止编造未列出实体       |

**门禁**：UAT SSE 断言 + 发版前人工表（§7）

### 4.4 L3 端到端、路由与 Agent（含企业 L3 性能子集）

| 指标          | 怎么测                          | 本项目证据                   |
| ------------- | ------------------------------- | ---------------------------- |
| Chat 路由     | direct vs retrieve · graph 降级 | `query-router` + intent plan |
| Agent 意图    | `graph_relation` / `kb_doc`     | `data-agent-trace`           |
| UI 可观测     | 步骤中文 · trace 可展开         | Phase 3.1 MCP 截图           |
| 多 Agent 链路 | prefetch → synthesizer          | Agent 执行步骤 UI            |
| P95 / Token   | 全链路耗时与模型栈              | UAT 报告 · metric 日志       |

**门禁命令**：

```bash
node tests/acceptance/phase-3.1/run-full-uat.mjs
# 报告：tests/acceptance/phase-3.1/FULL-UAT-REPORT.html
```

---

## 5. 门禁分级（CI → 发版 → 生产）

### 5.1 PR / 每日 CI（确定性，无 live LLM judge）

| 检查项                 | 命令                           | 失败即阻断 |
| ---------------------- | ------------------------------ | ---------- |
| 格式 + lint + 类型     | `yarn validate`                | ✅         |
| Phase 3 回归           | `yarn test:regression:phase-3` | ✅         |
| Golden smoke           | `yarn eval:phase-3`            | ✅         |
| Phase 1/2 回归（可选） | `yarn test:regression`         | 建议       |

### 5.2 发版前（Release Gate）

| 检查项      | 标准                                                 |
| ----------- | ---------------------------------------------------- |
| Golden 全量 | `yarn eval:phase-3:nightly` · R-01 ≥ 90% · R-02 = 0% |
| UAT         | API + Playwright UI · **100%** 关键用例              |
| 人工抽检    | Gen-01/02 各 ≥ 30 条 · 填 §7 评分表                  |
| 基础设施    | ES + Neo4j + PG + Redis healthy（Graph/hybrid 路径） |
| 延迟抽检    | Lat-01 记录 P95（注明模型：Groq / Ollama）           |

### 5.3 生产运营（SLO）

| 维度       | 建议 SLO     | 数据源                     |
| ---------- | ------------ | -------------------------- |
| 可用性     | 99.9%        | `/health` · 合成拨测       |
| 检索超时率 | < 1%         | `[METRIC] vector.search.*` |
| 空结果率   | 按意图分桶   | `no-docs` telemetry        |
| 限流触发   | 可接受上限内 | Upstash / 日志             |

---

## 7. 人工抽检表（对外展示用）

发版或路演前，从 Golden Set 扩展 **30–50 条** 真实业务问句，每条打 1–5 分：

| 字段     | 说明                                  |
| -------- | ------------------------------------- |
| Query    | 用户原问                              |
| Corpus   | user / seed                           |
| Mode     | Chat / Agent                          |
| **检索** | 期望文档是否出现在引用中？（1–5）     |
| **忠实** | 答案是否无编造、可被引用支撑？（1–5） |
| **相关** | 是否回答了问题？（1–5）               |
| **引用** | snippet 是否支持对应内容？（1–5）     |
| **体验** | 延迟与表述是否可接受？（1–5）         |
| Pass?    | 检索≥4 且 忠实≥4 且 相关≥4 → Pass     |

**对外亮点句式**：

- 「Golden Set **N** 条，发版门禁 Citation Hit **≥95%**，零串库。」
- 「**100%** UAT 关键路径通过，含图谱路径 UI 与 Agent trace。」
- 「混合检索 + 可选重排 + Corrective，检索层可 A/B 量化。」
- 「Chat / Agent 双模 + 意图路由，复杂任务可观测、可回归。」

---

## 8. 与仓库资产映射

| 资产                 | 路径                                              | 覆盖指标                         |
| -------------------- | ------------------------------------------------- | -------------------------------- |
| Golden Set           | `tests/eval/phase-3/golden.json`                  | R-01 · R-02 · I-01               |
| Eval smoke / nightly | `tests/eval/phase-3/*.test.ts`                    | R-01 · I-01                      |
| 回归套件             | `tests/regression/phase-3/`                       | hybrid · memory · graph · intent |
| Phase 3 验收         | `tests/acceptance/phase-3/`                       | E-02 · INFRA · UI smoke          |
| Phase 3.1 UAT        | `tests/acceptance/phase-3.1/`                     | G-01 · G-02 · A-01 · U-01        |
| HTML 报告            | `tests/acceptance/phase-3.1/FULL-UAT-REPORT.html` | 对外展示截图 + 逐步 PASS         |

---

## 9. v3 已达成 vs v4 待补齐（诚实对外口径）

| 维度     | v3 已具备                  | v4 生产级仍缺                     |
| -------- | -------------------------- | --------------------------------- |
| 检索评测 | Golden + 回归 + 防串库     | 持续 CI 门禁固化到 PR             |
| 生成评测 | UAT + 人工抽检流程         | 系统化 Faithfulness 自动 judge    |
| 图谱     | seed demo + 意图路由       | 用户文档自动构图                  |
| 身份     | 单用户 / 无 ACL            | SSO · 成员 · 检索裁剪             |
| 部署     | 本地 Compose + Vercel 演示 | Agent 容器 · 多实例 CP · 全栈镜像 |
| 观测     | 结构化 metric 日志         | 仪表盘 + 告警 + SLO               |

**推荐对外表述**：

> Personal GPT v3 在 **可测检索、混合 RAG、可引用问答、LangGraph Agent、图谱 demo** 上达到 **可演示、可回归、可验收** 的产品级工程标准；**企业身份治理与全自动质量门禁** 纳入 v4 生产路线图。

---

## 10. 快速命令索引

```bash
# 检索与意图（确定性）
yarn eval:phase-3
yarn eval:phase-3:nightly
yarn test:regression:phase-3

# 全链路验收（API + UI，建议 Ollama 避免云限流）
node tests/acceptance/phase-3.1/run-full-uat.mjs

# 全量 validate
yarn validate
```

---

## 附录 A：术语

| 术语                 | 含义                                            |
| -------------------- | ----------------------------------------------- |
| Golden Set           | 带期望输出的固定评测集                          |
| Citation Hit / Hit@K | 引用来源命中期望文档；或 top-K 至少一个正确结果 |
| Faithfulness         | 生成内容是否被检索证据支撑                      |
| Corpus               | `user` 用户库 · `seed` 种子库                   |
| Recall@K             | 前 K 条召回的相关文档占全部相关文档比例         |
| MRR                  | 第一个正确答案排名的倒数均值                    |
| Precision@K          | 前 K 条中真正相关的比例                         |
| NDCG@K               | 相关性等级 + 位置加权                           |
| CSAT                 | 用户满意度（Customer Satisfaction）             |
| ROI                  | 投资回报率                                      |

## 附录 B：参考文献（行业）

- RAG 评测框架：RAGAS、DeepEval、TruLens（思路参考；本仓库 CI 以确定性断言为主）
- 企业搜索：权限感知检索 → 检索后 ACL 裁剪（v4）
- Microsoft Copilot / Graph：查询改写 → 多源检索 → 摘要 → 权限裁剪 → 引用
