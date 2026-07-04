# v1.0 功能验收报告

**执行时间**：2026-07-03  
**结果**：**8/8 通过** ✅  
**封板状态**：v1.0 核心功能已封板（见 `docs/enterprise-roadmap.md` v1.0 状态）

| #   | 环节              | 结果 |
| --- | ----------------- | ---- |
| 1   | 聊天首页          | ✅   |
| 2   | 问候无 citation   | ✅   |
| 3   | 知识库页          | ✅   |
| 4   | 上传文档          | ✅   |
| 5   | 导入→就绪         | ✅   |
| 6   | MoCode + 引用卡片 | ✅   |
| 7   | 删除文档          | ✅   |
| 8   | 损坏 PDF 失败态   | ✅   |

## 自动化命令

```bash
yarn validate              # web + ingest-worker + agent-service + shared
yarn test:regression       # v1.0 回归测试（8 项）
yarn acceptance:phase-1    # v1.0 Playwright E2E（脚本名保留兼容；需 dev:web + dev:worker + docker）
```

## 回归测试清单（`tests/regression/phase-1/`，v1.0 回归集）

| #   | 文件                                  | 覆盖                 |
| --- | ------------------------------------- | -------------------- |
| 1   | `01-upload-pdf.test.ts`               | PDF 上传入库         |
| 2   | `02-citation-question.test.ts`        | 知识类问题 citation  |
| 3   | `03-greeting-no-citation.test.ts`     | 寒暄不检索           |
| 4   | `04-delete-no-citation.test.ts`       | 删除后无 citation    |
| 5   | `05-corrupt-pdf.test.ts`              | 损坏 PDF 失败态      |
| 6   | `06-general-knowledge-direct.test.ts` | 通用知识 direct 路由 |

## 环境要点

1. **Groq**：`GROQ_API_KEY`（聊天主模型 + RAG 辅助路由）
2. **NVIDIA NIM**：`NIM_API_KEY`（embedding，`llama-nemotron-embed-1b-v2`，2048 维）
3. **Astra 2048 维**：`ASTRA_DB_COLLECTION` 须与 NIM 对齐（首次 `yarn astra:init-embedding`；可选 `yarn seed:suggestions`）
4. **知识库**：`DATABASE_URL` + `REDIS_URL`（`yarn docker:up`）；E2E 需同时 `yarn dev:web` 与 `yarn dev:worker`
5. **LangSmith（可选）**：`.env` 设 `LANGSMITH_API_KEY` + `LANGSMITH_TRACING=true`
6. **心理学数据（可选）**：`yarn seed:psychology` 支持断点续跑（`data/.psychology-progress.json`）

截图：`tests/acceptance/phase-1/screenshots/`  
JSON：`tests/acceptance/phase-1/RESULT.json`
