# CR 修复后全链路验收记录（条件通过）

日期：2026-08-14  
分支：`moyunzero/feat/langgraph-multi-agent`  
范围：P0 → P1 → P2 代码审查项修复 + 单元测试 + 浏览器验收  
验收状态：**条件通过（conditional）** — 主链路可用，报告首段粘连未关账

## 单元测试结果（本轮）

- P0 令牌 / proxy / undici / pipe+abort / runId / 401·403 / BFF abort / Editor / wantsWeb：通过
- P1 CORS / Sequential editor / thread_id / 流式 dedupe·flush·prefetch·reader：通过
- P2 calculator / web-search / kb-search / provider / sanitize / trace / langsmith：通过
- `apps/agent-service` + `tests/regression/phase-2`：通过（dedupe 修复后 stream 单测 10/10）

## 已知未完全按 CR 原文落地（有意缩小或延后）

| 项                                          | 状态 | 说明                                                                 |
| ------------------------------------------- | ---- | -------------------------------------------------------------------- |
| `persistIfEnabled` 改为 Promise + 非阻塞 fs | 部分 | 同步 API 保留；已 sanitize path、失败不抛、成功后才 `persisted=true` |
| `page.tsx` 合并 Chat/Agent 历史             | 跳过 | 分模式历史为有意设计；已改 ErrorCard 文案                            |
| `handleRetry` → `regenerate`                | 已修 | 使用 `useChat().regenerate`                                          |
| 回归 01/02/05「真编排」加深                 | 延后 | 见下方「延后原因」                                                   |
| workspaceId 图级集成测                      | 延后 | 见下方「延后原因」                                                   |

### 延后原因（2026-08-14 记录）

延后**不是做不了**，而是本轮优先收口 P0/P1 主链路安全修复与浏览器验收，把下列项当成测试债 / 接口形状变更往后挪——判断偏保守，与「全部按 CR 落地」不完全一致。后续应按「全部收口」补完，不宜长期挂着。

1. **回归 01 / 02 / 05「真编排」加深**
   - CR 要求：通过 `streamMock` / 真跑图或 AgentService，断言流式段落、citation、`kb_search` workspace、web 失败后仍含 KB 内容等。
   - 现状：现有 harness 已绿，但多为局部拼装或直接调工具，未完全按 CR 改成编排级断言。
   - 延后理由：改动面大（重写 harness），当时怕拖慢安全修复与浏览器验收。

2. **workspaceId 图级集成测**
   - 运行时：已通过 `configurable.workspaceId` + `run_id` 上下文加固。
   - 缺的是：非默认 `workspaceId` 进图 → 检索收到同一值的**专用集成测**。
   - 延后理由：属补测，不是功能未做；本轮未单独加用例。

3. **`persistIfEnabled` 全异步（Promise + 非阻塞 fs）**
   - 已做：path sanitize、失败不抛、成功后才 `persisted=true`。
   - CR 全文还要求：返回 Promise、目录创建与双写用非阻塞 fs。
   - 延后理由：会改 `AgentTraceCollector` 类型及所有调用方（含 `emitTrace`），属接口形状变更，当时刻意缩小范围。

## 浏览器全链路（Playwright · localhost:3000 + :3002）

| 步骤                                    | 结果        | 备注                                                                                            |
| --------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------- |
| `/health` agent + web 首页              | ✅          | HTTP 200                                                                                        |
| BFF `POST /api/agent/chat` 闲聊「你好」 | ✅          | short-circuit SSE（Router 已短路）                                                              |
| UI Agent 模式闲聊「你好」               | ✅          | 步骤面板 + 执行轨迹可见，无 console error                                                       |
| UI Agent「查知识库并写报告」            | ✅          | `retriever → editor`，产出 Markdown 报告与轨迹                                                  |
| 正文交错重复（验收中发现）              | ⚠️→已修     | 无 `seq` 时 autoSeq 放行合并重复；已改回「有 seq 用序号 / 无 seq 连续内容去重」；复测后交错消失 |
| 报告开头轻微拼接                        | ⚠️ 阻塞关账 | 仍见「知识库未找到…」前缀与标题粘连一行；疑似 held 段 flush + editor 开场；见下方开放项         |

### 开放项：报告首段粘连（条件通过原因）

| 字段     | 内容                                                                                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner    | `@moyunzero`（分支维护者）                                                                                                                                                            |
| Tracking | 待开 GitHub Issue：`held-segment flush / editor 开场粘连`（本文件先行记账）                                                                                                           |
| 退出标准 | Agent「查知识库并写报告」浏览器复测：报告标题独立成行，不再与「知识库未找到…」等 held 中间段粘在同一行；必要时收紧 `suppressIntermediateText` / held flush 与 editor 开场顺序后再关账 |

### 复测结论（条件通过）

- 主链路（BFF → agent-service → SSE → 步骤/轨迹/报告）可用
- 闲聊短路与多专科流水线均可达
- **未无条件关账**：报告首段粘连仍开放；编排向回归加深另排期
