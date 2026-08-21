# ISSUE-001：混库场景下用户文档召回被 seed 数据挤占

**状态：** Closed（Wave 1 质量门：物理分库 + hybrid/RRF + 回归 01/02 绿）  
**发现日期：** 2026-07-03  
**关闭日期：** 2026-08-21  
**影响范围：** `POST /api/chat` 检索链路、`/kb` 上传文档的问答体验  
**优先级：** P1（功能可用但答案质量/溯源错误）  
**关联 Phase：** Phase 1 封板后实测；缓解见 v1.x；根治见 Phase 3 Wave 1（D-24–D-31）

---

## 摘要

当 Astra 向量库中 **用户上传文档**（如 `奥德赛计划书_2026-06-30.md`）与 **大批量 seed 数据**（如 `psychology-qa` 8000+ 条）共存于同一 collection 时，用户以自然语言提问可能出现：

1. **路由层**：灰色地带曾被 LLM 误判为 `direct`，跳过检索（已部分修复）
2. **召回层**：Top-K 被 `psychology-qa` 占满，用户文档未进 Top-10
3. **生成层**：无关 context 被注入后，模型仍可能被带偏（尽管 prompt 要求忽略）

**入库本身成功**——问题在「混库 + 纯向量 Top-K」，不是 ingest 失败。

---

## 复现条件

| 条件 | 说明 |
|------|------|
| 向量库 | 同一 `ASTRA_DB_COLLECTION`，含 `psychology-qa` + KB 上传文档 |
| 问法 | 泛化问法，如「奥德赛计划书给了什么建议」 |
| 路由 | `retrieve`（embedding 预检进入灰色地带或高相似） |
| 环境 | Groq 主聊天 + NIM embedding；HyDE/Multi-Query/Reranker 默认关 |

---

## 典型症状

### 用户可见

- 问私有文档内容，回答像通用知识（航天计划书框架、荷马史诗等）
- citation 卡片显示 `psychology-qa`，而非用户上传文件名
- 或完全无 citation（曾发生 `direct` 路由跳过检索）

### 日志特征

```text
[debug] embedding 预检完成 … topSimilarity:0.626 … retrieveAt:0.68
[debug] query route … route:"direct" reason:"llm:奥德赛计划书是一个历史事件…"   ← 旧行为，已改
[debug] query route … route:"retrieve" reason:"embedding_precheck:gray_retrieve:0.658"  ← 新行为
[debug] 找到文档 … hits:[{"similarity":0.62x,"source":"psychology-qa"}, …]
```

---

## 根因分析

### 1. 单一 collection 混库（架构）

Phase 1 设计为 **统一 workspace 检索**（见 `01-CONTEXT.md` D-15），`prompt-suggestion` / `psychology-qa` / 用户上传 chunk 写入同一 Astra collection，**无 source 优先级**。

### 2. 纯向量 Top-K 无关键词兜底

问「给了什么建议」时，embedding 语义接近心理学 QA；用户文档标题「奥德赛计划书」**无 BM25/标题匹配**（Phase 3 ES 混合检索未落地）。

### 3. 实测召回排名（2026-07-03 验证）

文档 ID：`89930129-a4a7-4e9b-b9a2-9f34d3162808`（`奥德赛计划书_2026-06-30`，5 chunks，status=ready）

| 查询 | 奥德赛文档排名 | Top-1 source |
|------|----------------|--------------|
| `奥德赛计划书给了什么建议` | **Top 10 外** | psychology-qa ~0.626 |
| `我的奥德赛计划书三条路径` | **第 1** | 奥德赛 ~0.703 |
| `奥德赛计划书_2026-06-30` | **第 1** | 奥德赛 ~0.677 |

结论：**库里有、ingest 成功，但泛化问法下向量召回输给 psychology。**

### 4. 注入阈值统一（0.55）

`TOP1_SIMILARITY_THRESHOLD=0.55`（`rag-options.ts`）对 psychology 与用户文档一视同仁；0.62 的 psychology 仍会进入 context。

### 5. LLM 路由误判（已缓解）

Groq 8B 将「奥德赛计划书」理解为公开历史事件 → `direct`。  
**已改：** 灰色地带默认 `retrieve`（`gray_retrieve`），不再调用 LLM 路由器。

---

## 已实施缓解（2026-07-03 会话内）

| 变更 | 文件 | 效果 |
|------|------|------|
| Groq 主聊天 + Flash-Lite 辅助 → 全 Groq | `stream.ts`, `rag-helper.ts` | 解决 Google 地区不可用 |
| 灰色地带偏向 `retrieve` | `query-router.ts` | 避免 LLM 判 `direct` 跳过检索 |
| Qwen `` 过滤 | `think-strip.ts`, `stream.ts` | UI 不泄漏思考链 |
| LLM 路由失败 fallback | `query-router.ts` | API 失败时不 500（预检 skip 时） |

**Wave 1 根治（Closed 证据，2026-08-21）：**

| 交付 | 证据 |
|------|------|
| 物理分库 user/seed（D-24/D-25） | `packages/shared/src/rag/corpus.ts` + Astra/ES 分 collection/index |
| 默认 `corpus=user`（D-27） | Chat/Agent → shared `hybridSearch`；显式 `corpus=seed` 才查种子库 |
| Hybrid + RRF + rerank 默认开 | plans `03-01` / `03-03`；`packages/shared/src/rag/hybrid-search.ts` |
| 存量迁移可跑 | `npx tsx script/migrate-corpus-split.ts --dry-run` / `--execute`（可选 `--with-es`） |
| 回归绿（D-30） | `yarn vitest run tests/regression/phase-3/01-hybrid-proper-noun.test.ts tests/regression/phase-3/02-corpus-isolation.test.ts` |
| 关账文档（D-31） | 本文件状态 → **Closed** |

验收口径：泛化问用户文档时 citation **不得**出现 `psychology-qa`；专有名词/标题问法仍命中用户文档。

---

## Phase 路线图对照

| 阶段 | 与本 issue 关系 |
|------|-----------------|
| **Phase 1（已封板）** | 链路通（upload → ingest → citation）；**未验收**混库召回精度 |
| **Phase 2** | Retriever Agent、多跳检索；简单 chat 仍走 `/api/chat`，**不保证**自动修复 |
| **Phase 3** | ES 混合检索、多存储分索引、Agentic RAG（evaluate）——**主战场** |
| **Phase 4** | 多 workspace 隔离，减轻跨项目混库 |
| **Phase 5** | RAGAS 评估召回质量（监测，非自动修复） |

Reference 对照：

- `reference/advanced-rag/rag-query-router.mjs` — 单语料路由（天龙八部），无混库问题
- `reference/es-test/src/rag/hybrid-retrieval.mjs` — ES + Milvus + rerank → **Phase 3**
- `reference/advanced-rag/rag-webfallback.mjs` — retrieve 后 evaluate → **Phase 3 / v2 Agent**

---

## 推荐缓解方案（按优先级）

### v1.x 小改（不破坏 Phase 1 封板定义）

1. **双路检索**：Path A 过滤 `source` ∈ {用户上传 `.md/.pdf/…`, `prompt-suggestion`}；Path B 全库；A 优先 merge
2. **source 差异化阈值**：`psychology-qa` 注入门槛提高到 0.72
3. **开启 Reranker**：`.env` 设 `ENABLE_RERANKER=true`

### 产品层

4. 问法贴近文档标题或上传后提供的「建议问法」
5. 后续 Phase：KB 内 `@文档` 显式选源（未在 Phase 1 验收范围）

---

## 排查清单

遇到「上传了但答不对」时，按序检查：

1. **PostgreSQL 文档状态**
   ```bash
   docker exec personal_gpt_postgres psql -U personal_gpt -d personal_gpt \
     -c "SELECT id, title, status, chunk_count, source FROM documents ORDER BY created_at DESC LIMIT 5;"
   ```
   期望：`status=ready`，`chunk_count>0`

2. **Astra 按 documentId 查 chunk**
   ```bash
   # 见 scripts 或 ts-node DataAPIClient find({ documentId })
   ```
   期望：chunk 数 = PG `chunk_count`，`workspaceId` 正确

3. **向量搜索 Top-10 是否含目标 documentId**
   - 用与线上一致的 query embedding 搜 Top-10
   - 若 Top-10 无目标 doc → **召回层问题**（本 issue）
   - 若有目标 doc 但 citation 不对 → **rerank/注入/prompt 问题**

4. **日志 `query route`**
   - `direct` → 未检索，检查 precheck / 寒暄快路径
   - `gray_retrieve` / `high_sim` → 已检索，看 `找到文档` 的 `source`

5. **ingest-worker 是否在跑**
   ```bash
   yarn dev:worker
   ```

---

## 相关代码

| 模块 | 路径 |
|------|------|
| 查询路由 | `apps/web/lib/chat/query-router.ts` |
| embedding 预检 | `apps/web/lib/chat/embedding-precheck.ts` |
| 检索与阈值 | `apps/web/lib/chat/retrieve.ts`, `rag-options.ts` |
| System prompt | `apps/web/lib/chat/prompt.ts` |
| 向量 store | `packages/shared/src/stores/vector-store.astra.ts` |
| KB 入库 | `apps/ingest-worker/src/ingest/` |

---

## 验收 / 回归说明

Phase 1 回归集 **不包含** 本场景：

- `tests/regression/phase-1/02-citation-question.test.ts` 使用 mock 检索
- 验收 fixture 为 MoCode，非「奥德赛 vs psychology」混库

建议在 v1.x 增加回归用例或手工验收项：**上传 MD → 泛化问法 → citation source 为用户文件名**。

---

## 变更记录

| 日期 | 说明 |
|------|------|
| 2026-07-03 | 首次记录；验证 ingest 成功、混库召回失败；记录已实施路由/模型缓解 |
| 2026-08-21 | Wave 1：物理分库 + hybrid/RRF + migrate-corpus-split + 回归 01/02 绿 → **Closed**（plan 03-03b / D-31） |

---

*维护者：开发会话 2026-07-03 · Closed 2026-08-21（Phase 3 Wave 1）· 同步至 `.planning/STATE.md`*
