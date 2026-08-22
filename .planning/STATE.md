# Project State

**Last Updated:** 2026-08-22  
**Current Phase:** Phase 4 — Graph KB 产品化 + 生产就绪（Wave 0 优先）  
**Current Plan:** Not started — next: **04-00** Ingest 构图 MVP  
**Status:** Phase 3.1 关账完成；Phase 4 规划已写入 ROADMAP / REQUIREMENTS / 04-CONTEXT

---

## Phase Status

| Phase | Status | Plans |
|-------|--------|-------|
| Phase 1: 企业知识库基础 | ✅ Complete | 5/5 |
| Phase 2: LangGraph 多 Agent | ✅ Complete | 7/7 |
| Phase 3: 记忆与高级 RAG | ✅ Complete | 10/10 |
| Phase 3.1: 意图路由 | ✅ Complete | 3/3 |
| **Phase 4: Graph KB + 生产就绪** | ⏳ Not started | **0/6** |

**Phase 4 结构**

| Wave | Plans | 内容 |
|------|-------|------|
| Wave 0 | 04-00～04-03 | Ingest 构图、实体 catalog、Cypher 模板、图生命周期 + 回归 |
| Wave 1 | 04-04～04-06 | Docker、Auth、限流/监控/CI（原 Phase 4 PROD） |

---

## Decisions (Phase 4)

| ID | Decision |
|----|----------|
| P4-D-01 | Wave 0 Graph KB **先于** Wave 1 PROD 执行 |
| P4-D-02 | Phase 3 RAG-06 = demo Graph；GRAPH-01–04 = 应用级 Graph KB |
| P4-D-03 | Phase 4 不默认 LLM Text2Cypher（Phase 5 spike） |
| P4-D-04 | PROD-03 隔离验收含 **KB + ES + Neo4j** 三通道 |

详见 [phases/PGPT-04-prod/04-CONTEXT.md](phases/PGPT-04-prod/04-CONTEXT.md)

---

## Blockers

None.

---

## Todos

- [ ] `/gsd-plan-phase` Phase 4 — 细化 04-00～04-06 PLAN.md
- [ ] 04-00: Ingest 构图 MVP
- [ ] 04-01: Workspace 实体 catalog
- [ ] 04-02: Cypher 模板库
- [ ] 04-03: 图删/重索引同步 + phase-4 回归
- [ ] 04-04～04-06: PROD（Docker / Auth / 监控）

---

## Session Notes

- **2026-08-22**: Phase 3.1 UAT 11/11 PASS；Agent Synthesizer（retrieve → rag_generate）对齐 enterprise 模式。
- **2026-08-22**: 讨论结论 — Graph 仍为 demo 级（seed + 固定 Cypher）；Graph KB 产品化并入 Phase 4 **Wave 0**，原 Docker/Auth/监控顺延为 Wave 1（04-04～04-06）。
- **2026-08-22**: 规划文档更新 — ROADMAP、REQUIREMENTS（GRAPH-01–04）、04-CONTEXT；**无代码实现**。

---

## Quick Reference

- **Requirements**: [.planning/REQUIREMENTS.md](REQUIREMENTS.md)
- **Roadmap**: [.planning/ROADMAP.md](ROADMAP.md)
- **Phase 4 Context**: [.planning/phases/PGPT-04-prod/04-CONTEXT.md](phases/PGPT-04-prod/04-CONTEXT.md)
- **Phase 3.1 Context**: [.planning/phases/PGPT-03.1-intent-routing/03.1-CONTEXT.md](phases/PGPT-03.1-intent-routing/03.1-CONTEXT.md)
- **Config**: `.planning/config.json`
- **Phase 4 入口命令**: `/gsd-plan-phase`（Wave 0 从 04-00 开始）
