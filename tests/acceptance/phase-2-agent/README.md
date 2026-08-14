# Phase 2 Agent 验收（2026-08-12）

**口径**：v2.0 **MVP 关账 / 可演示**，不是生产就绪。详见 [CLOSEOUT.md](./CLOSEOUT.md)。

## 1. 人工 UI（KB-miss 主路径）

验收问法：

> 先查知识库里关于 LangGraph 和 AutoGen 的资料，再联网补充优缺点，最后整理成一份带对比表和引用的 Markdown 报告

| 项 | 结果 |
|----|------|
| Retriever / Researcher / Editor 步骤完成 | 通过 |
| 出现 Markdown 对比报告正文 | 通过 |
| 无「请等待 editor」交接废话 | 通过 |
| 无 `NO_RELEVANT_HIT` / `KB_SEARCH_STATUS` 技术码外泄 | 通过 |
| 无假 `DOC-*` | 通过 |
| 知识库无依据说明 | 通过 |

截图：`01`–`07` png（**本地保留，不入库**）。机器结果：`checks.json`（本地）。

## 2. Live SSE smoke（KB 命中 + 门禁）

前置：`yarn workspace agent-service start:dev`（:3002），且 `.env` 中 embedding / Astra 可用。

```bash
yarn acceptance:phase-2-smoke
```

脚本会：

1. 向默认 workspace 写入种子文档 `phase2-kb-hit-zx7749`（`fixtures/blueberry-pufferfish-protocol.md`，本地 fixture）
2. 提问协议 **ZX-7749**，断言 SSE 带回真实 `data-citations.documentId`、正文含协议要点、无假 DOC-* / 无技术码
3. 再跑主链路报告问法，断言 Retriever / Researcher / Editor 步骤与足够长正文

产物（均本地、已 gitignore）：`SMOKE-RESULT.json`、`checks-kb-hit.json`。

主链路场景会额外断言 SSE 含 `data-agent-trace` 且 `events` 非空（执行轨迹可观测）。本地可设 `AGENT_TRACE_PERSIST=true`，轨迹写入 `.data/agent-traces/`（JSON + Markdown）供评测复盘。

浏览器轨迹验收（可选，本地）：

```bash
# 需 web :3000 + agent :3002；依赖本机 Playwright
python tests/acceptance/phase-2-agent/run-trace-obs-browser.py
```

产物：`TRACE-OBS-RESULT.json`、`trace-obs-*.png`、导出 MD/JSON（均不入库）。

## Mock 回归

`yarn test:regression:phase-2`（禁止 live LLM，只验接线）。
