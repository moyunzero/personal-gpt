# Phase 4: Graph KB 产品化 + 生产就绪 — Context

**Gathered:** 2026-08-22  
**Status:** Ready for planning（Wave 0 优先于原 PROD 计划）  
**Source:** Phase 3/3.1 关账后讨论 — Graph 仍为 demo 级（seed 子图 + 固定 Cypher），需与应用级 KB 对齐后再做 Auth/Docker 关账。

<domain>
## Phase Boundary

Phase 3/3.1 交付了 **Graph RAG 能力栈 + 意图路由**（demo 珍珠奶茶子图、`graph_search` 管道、Chat 图谱卡片、Agent Synthesizer）。  
Phase 4 **扩展目标**：先完成 **Graph KB 产品化（Wave 0）**，再执行原 **生产就绪（Wave 1）**。

**In scope — Wave 0（Graph KB，优先）**

- **INGEST 扩展**：文档入库 → 实体/关系抽取 → 写 Neo4j（绑 `workspaceId` + `documentId`）
- **实体 catalog**：替换 `graph-entities.ts` seed regex；L1 实体链接来自 workspace 图索引
- **查询层**：Cypher **模板库** + 现有 allowlist（Phase 4 **不**默认 LLM Text2Cypher）
- **生命周期**：删文档 / 重索引 → 图节点/边同步删除或重建
- **路由**：`graph_relation` / fallback 可对 **非 seed** 实体 HIT
- **回归**：`tests/regression/phase-4/` graph 子集 + 验收用例

**In scope — Wave 1（原 Phase 4 PROD）**

- Docker Compose 全栈一键启动
- Clerk/Auth.js + workspace 成员/角色
- 多租户隔离验收（**向量 + ES + Neo4j 三通道**）
- 限流、审计、Prometheus/Grafana、CI/CD

**Out of scope（Deferred to Phase 5+）**

- LLM Text2Cypher 无约束开放（参考 `reference/neo4j-graphrag` 仅作 Spike）
- Microsoft GraphRAG 社区摘要 / 全库离线建图
- 用户可见「Chat / Graph / KB」模式 UI toggle
- RAGAS graph 维度 nightly（Phase 5 EVAL-01）

**Explicit non-goals for Wave 0**

- 不要求任意自然语言问法都走 graph（「如何做 / 创新思路」仍优先 KB + 通用成文）
- 不替换 Phase 3 已交付的 demo seed 子图，直至 ingest 构图 MVP 可与之并存或迁移

</domain>

<decisions>
## Implementation Decisions

### D-01: Phase 4 执行顺序
- **Wave 0（04-00～04-03）必须先于 Wave 1（04-04～04-06）**
- Wave 0 可使用现有 `workspaceId` 做逻辑隔离；Wave 1 Auth 关账时做 **硬隔离验收**

### D-02: Graph 数据来源
- 图节点/边 **来自用户上传文档**（ingest-worker 扩展），非仅手工 `seedMilkTeaSubgraph`
- 与 PG `documents.id`、ES chunk、向量 chunk **同一 documentId 溯源**

### D-03: Schema（Wave 0 MVP）
- 最小标签：`Document`、`Concept`、`Product`、`Ingredient`、`Method`（可映射 demo 域）
- 关系示例：`MENTIONS`、`CONTAINS`、`USES`、`RELATED_TO`
- `workspaceId` 为节点/边必填属性或复合键前缀

### D-04: 查询策略
- 扩展 `packages/shared/src/rag/graph-rag.ts`：**模板选择**（按 intent + 链接实体类型），非单条 `MILK_TEA_PATH_CYPHER`
- 保留 `assertAllowlistedCypher`；禁止 Agent 工具层开放任意 Cypher
- Phase 5 可选：受控 Text2Cypher（schema 校验 + 只读 + 超时）

### D-05: 路由升级
- `graph-entities.ts` seed 列表 → **workspace entity catalog**（Neo4j 或 PG 索引表）
- L0 `GRAPH_RELATION_RE` 保持；L1 `graphSignal` 可在 **链接到图实体** 时置 true（不仅 seed regex）
- KB miss + 链接实体 → 可触发 `fallbackChain` graph（延续 3.1 D-13）

### D-06: 与 Phase 3/3.1 关系
- Phase 3 **RAG-06** = hybrid + **demo** Graph RAG（关账不变）
- Phase 4 **GRAPH-01～04** = **应用级** Graph KB（新要求，见 REQUIREMENTS.md）
- Phase 3.1 路由/Synthesizer **不重做**；Wave 0 替换底层数据与实体链接

### D-07: PROD 关账扩展
- **PROD-03** 跨 workspace 泄漏验收须含：**KB 检索 + ES + Neo4j 路径** 三通道
- Docker Compose（PROD-01）须包含 Neo4j health + ingest graph 写路径可观测

### Claude's Discretion
- 实体抽取：规则/LLM 结构化输出选型（Wave 0 计划阶段定）
- 模板数量与命名；Neo4j 索引策略
- demo seed 子图 deprecation 时间表

</decisions>

<canonical_refs>
## Canonical References

### 现有 Graph 栈（Phase 3）
- `packages/shared/src/rag/graph-rag.ts` — allowlist、demo Cypher、seed
- `packages/shared/src/routing/graph-entities.ts` — seed 实体（待 Wave 0 替换）
- `apps/agent-service/src/tools/graph-search.tool.ts`
- `apps/web/lib/chat/graph-path-display.ts`

### 参考（非默认实现）
- `reference/neo4j-graphrag/src/graphrag.mjs` — Text2Cypher 三阶段（Phase 5 spike）
- `reference/advanced-rag/src/rag-query-router.mjs` — retrieve → rag_generate（成文层已对齐 Synthesizer）

### 上游规划
- `.planning/ROADMAP.md` — Phase 4 双 Wave
- `.planning/REQUIREMENTS.md` — GRAPH-01～04 + PROD-01～05
- `.planning/phases/PGPT-03.1-intent-routing/03.1-CONTEXT.md` — 路由契约（不变）

</canonical_refs>

<success_criteria>
## Phase 4 Success Criteria（关账须全部 TRUE）

### Wave 0 — Graph KB
1. 用户上传指定类型文档（如产品说明 MD）后，Neo4j 出现 **非 seed** 实体/关系，且 `graph_search` 可 HIT
2. 对 workspace 内自建实体提问（关系型问法）→ `graph_relation` 或 fallback graph，**不依赖** `珍珠奶茶` 硬编码
3. 删除文档后，对应图数据清除；workspace A/B **图与 KB 均不交叉**
4. Chat 图谱路径卡片 + Agent trace 仍可见 `graph_search` HIT（延续 3.1）

### Wave 1 — 生产就绪（原 Phase 4）
5. 全新环境 `docker compose up` 后 5 分钟内可聊天 + 上传 + graph 检索
6. 用户 A 文档/图对用户 B 不可见（零 cross-tenant 泄漏）
7. 限流 429 + 可读提示；Prometheus 可 scrape web/agent/ingest
8. Phase 1–3.1 回归 + Phase 4 graph/regression 全绿

</success_criteria>

<plans_preview>
## Plans Preview（待 /gsd-plan-phase 细化）

| Plan | Wave | 摘要 |
| --- | --- | --- |
| 04-00 | 0 | Ingest 构图 MVP：extract → Neo4j upsert，workspace + documentId |
| 04-01 | 0 | Workspace 实体 catalog + 路由替换 seed |
| 04-02 | 0 | Cypher 模板库 + graph-rag 多路径查询 |
| 04-03 | 0 | 删/重索引图同步 + phase-4 graph 回归 |
| 04-04 | 1 | Docker Compose 全栈 + health（含 Neo4j/ingest） |
| 04-05 | 1 | Auth + workspace 角色 + 三通道隔离验收 |
| 04-06 | 1 | 限流/审计/Prometheus/CI |

</plans_preview>
