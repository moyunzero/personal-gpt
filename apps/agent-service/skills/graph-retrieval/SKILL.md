---
name: graph-retrieval
description: 窄域实体关系图谱检索（graph_search）；非全库自动抽图
---

# Graph retrieval

当用户问实体关系（包含、适合、工艺路径）时，Retriever 应调用 `graph_search`。

规则：

- 只引用工具返回的 node id 与 relationship type
- 不要新建 Graph / Corrective 子 Agent
- 普通文档问答仍用 `kb_search`
