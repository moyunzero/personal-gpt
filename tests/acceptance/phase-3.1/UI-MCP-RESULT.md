# Phase 3.1 — Cursor Browser MCP UI 验收

**When:** 2026-08-22 19:05–19:09 (UTC+8)  
**Tool:** Cursor `user-playwright` MCP · http://localhost:3000  
**Prerequisite:** 输入文字后 Send 可点（空输入时 disabled 属正常）

## 浏览器启动

| Check                                   | Result |
| --------------------------------------- | ------ |
| MCP `browser_navigate` → localhost:3000 | ✅     |
| 页面标题 Personal-Emotion-GPT           | ✅     |
| web:200 · agent:200                     | ✅     |

## UI Test 1 — Chat 图谱路径卡片（D-07）

**Query:** 珍珠奶茶有哪些原料，用了什么工艺？

| DOM 断言                                                    | Result |
| ----------------------------------------------------------- | ------ |
| 助手正文含 珍珠 / 煮制                                      | ✅     |
| `generic "图谱路径"` 区域存在                               | ✅     |
| 按钮文案 `Product:珍珠奶茶 → Ingredient:珍珠 → Method:煮制` | ✅     |
| 关系标签 `CONTAINS · USES`                                  | ✅     |
| 卡片可点击展开                                              | ✅     |

Screenshot: [`C-chat-ui-graph-paths.png`](./screenshots/C-chat-ui-graph-paths.png)

## UI Test 2 — Agent kb_doc 合成（D-11）

**Query:** 奥德赛计划书的主要内容是什么？

| DOM 断言                                     | Result |
| -------------------------------------------- | ------ |
| 执行步骤 · System 预检索 完成                | ✅     |
| Retriever 检索知识库 完成                    | ✅     |
| 正文「保守、平衡、进取」                     | ✅     |
| 引用来源 · `奥德赛计划书_全量验收2`          | ✅     |
| 执行轨迹 · `single_specialist · kb_doc · L1` | ✅     |
| trace · kb_search HIT                        | ✅     |
| 无「知识库未找到足够依据」                   | ✅     |

Screenshot: [`B-agent-kb-ui.png`](./screenshots/B-agent-kb-ui.png)

## UI Test 3 — Agent graph_relation（H-04 / D-15）

**Query:** 珍珠奶茶有哪些原料，用了什么工艺？

| DOM 断言                                                 | Result |
| -------------------------------------------------------- | ------ |
| 待办标签「图谱检索」（非泛化检索知识库）                 | ✅     |
| Retriever 步骤「图谱检索 · graph_search · 图谱路径检索」 | ✅     |
| 正文含 珍珠 / 煮制                                       | ✅     |
| trace · `graph_relation · L0` · graph_search HIT         | ✅     |
| 无 KB miss 脚注                                          | ✅     |

Screenshot: [`A-agent-graph-ui.png`](./screenshots/A-agent-graph-ui.png)

## 总评

| 类别                       | 结论     |
| -------------------------- | -------- |
| Cursor Browser MCP 可用    | **PASS** |
| Chat GraphPathCards DOM    | **PASS** |
| Agent Citation + Trace DOM | **PASS** |
| Send 交互（输入后发送）    | **PASS** |
| Phase 3.1 UI MCP overall   | **PASS** |

> 与 API 旁路验收互补：本次为 **真实 DOM 端到端**，无需 `next dev --webpack` 或 production build。
