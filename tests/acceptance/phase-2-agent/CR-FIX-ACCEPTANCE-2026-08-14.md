# CR 修复后全链路验收记录

日期：2026-08-14（初验）· 2026-08-21（v2.x 收口复测）  
分支：`moyunzero/feat/langgraph-multi-agent`  
范围：P0 → P1 → P2 代码审查项修复 + 单元测试 + 浏览器验收 + Agent KB L0  
验收状态：**MVP 关账通过** — 主链路可用；报告头粘连 / 闲聊短路无正文 / 流式翻倍已清除。仍 ≠ 生产就绪。

## 单元测试结果（本轮）

- P0 令牌 / proxy / undici / pipe+abort / runId / 401·403 / BFF abort / Editor / wantsWeb：通过
- P1 CORS / Sequential editor / thread_id / 流式 dedupe·flush·prefetch·reader：通过
- P2 calculator / web-search / kb-search / provider / sanitize / trace / langsmith：通过
- `apps/agent-service` + `tests/regression/phase-2`：通过（dedupe 修复后 stream 单测通过）
- 2026-08-21：`extractKbSearchQuery` / kb-search condensed 回退 / 默认门槛 0.60：通过

## 已知未完全按 CR 原文落地（有意缩小或延后）

| 项                                          | 状态 | 说明                                                                 |
| ------------------------------------------- | ---- | -------------------------------------------------------------------- |
| `persistIfEnabled` 改为 Promise + 非阻塞 fs | 部分 | 同步 API 保留；已 sanitize path、失败不抛、成功后才 `persisted=true` |
| `page.tsx` 合并 Chat/Agent 历史             | 跳过 | 分模式历史为有意设计；已改 ErrorCard 文案                            |
| `handleRetry` → `regenerate`                | 已修 | 使用 `useChat().regenerate`                                          |
| 回归 01/02/05「真编排」加深                 | 延后 | 见下方「延后原因」                                                   |
| workspaceId 图级集成测                      | 延后 | 见下方「延后原因」                                                   |

### 延后原因（2026-08-14 记录）

延后**不是做不了**，而是本轮优先收口 P0/P1 主链路安全修复与浏览器验收，把下列项当成测试债 / 接口形状变更往后挪。后续应按「全部收口」补完，不宜长期挂着。

1. **回归 01 / 02 / 05「真编排」加深** — 属测试债，非功能未做。
2. **workspaceId 图级集成测** — 运行时已加固；缺专用集成测。
3. **`persistIfEnabled` 全异步** — 已做 path sanitize / 失败不抛；全 Promise API 属接口形状变更，延后。

## 浏览器全链路（Playwright · localhost:3000 + :3002）

| 步骤                             | 结果     | 备注                                                     |
| -------------------------------- | -------- | -------------------------------------------------------- |
| `/health` agent + web 首页       | ✅       | HTTP 200                                                 |
| Agent 闲聊「你好」               | ✅       | 短路有可见正文（2026-08-21）                             |
| Agent「查知识库并写报告」        | ✅       | retriever → editor + 轨迹                                |
| 正文交错重复                     | ✅ 已修  | 无 seq 连续相同 delta 去重                               |
| 报告开头粘连                     | ✅ 已修  | sanitize 断标题 + 解锁丢弃非报告持有段                   |
| Agent KB 近阈值 miss（韶音手册） | ✅ L0    | 查询压缩 + 默认门槛 0.60；hybrid/rerank 属 v3            |

### 复测结论（MVP 关账）

- 主链路可用；闲聊短路与多专科流水线可达
- 报告头粘连已关；编排向回归加深仍另排期（测试债）
- 下一里程碑：**v3 检索可信**（hybrid + title boost ± rerank + 评测）
