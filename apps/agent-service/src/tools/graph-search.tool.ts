/**
 * graph_search：窄域实体关系图谱检索（RAG-06）。
 * 调用 shared graphRagQuery；禁止新建 Graph/Corrective 子 Agent（D-32/D-35）。
 */

import { tool } from "langchain";
import { z } from "zod";

import {
  createSeededMilkTeaFixtureExecutor,
  graphRagQuery,
  type GraphQueryExecutor,
  type GraphRagResult,
} from "@personal-gpt/shared";

export type GraphSearchInput = {
  question: string;
  /** 测试注入；生产走 Neo4j read session */
  executor?: GraphQueryExecutor;
};

export async function invokeGraphSearch(input: GraphSearchInput): Promise<string> {
  const question = input.question.trim();
  if (!question) {
    return "GRAPH_SEARCH_STATUS: EMPTY_QUERY\n请提供实体关系问题。";
  }

  try {
    const result: GraphRagResult = await graphRagQuery({
      question,
      executor: input.executor,
    });
    if (!result.paths.length) {
      return ["GRAPH_SEARCH_STATUS: NO_PATH", "图谱未找到可追溯路径。"].join("\n");
    }

    const pathBlocks = result.paths.map((p, i) => {
      const nodes = p.nodes
        .map(
          (n) =>
            `  - id=${n.id} labels=${n.labels.join("|")} name=${String(n.properties.name ?? "")}`,
        )
        .join("\n");
      const rels = p.relationships
        .map((r) => `  - ${r.startNodeId} -[${r.type}]-> ${r.endNodeId}`)
        .join("\n");
      return [`[path ${i + 1}]`, "nodes:", nodes, "relationships:", rels].join("\n");
    });

    return [
      "GRAPH_SEARCH_STATUS: HIT",
      result.summary,
      ...pathBlocks,
      "",
      "注意：只能引用以上 path 中的 node id / relationship type；不可编造未列出的实体。",
    ].join("\n");
  } catch (err) {
    console.error("[graph_search] query failed", err);
    return "GRAPH_SEARCH_STATUS: ERROR\n图谱检索失败（降级）：请稍后重试，勿编造实体关系。";
  }
}

export const graphSearchTool = tool(
  async (input: { question: string }) => invokeGraphSearch({ question: input.question }),
  {
    name: "graph_search",
    description:
      "查询窄域知识图谱中的实体关系路径（节点 id + 关系类型可追溯）。适用于「A 包含什么 / A 与 B 的关系 / 配料工艺」类问题；非图谱问题请用 kb_search。",
    schema: z.object({
      question: z.string().min(1).describe("实体关系问题，例如：珍珠奶茶的配料用了什么工艺？"),
    }),
  },
);

/** 测试辅助：固定返回种子路径 */
export function invokeGraphSearchWithFixture(question: string): Promise<string> {
  return invokeGraphSearch({
    question,
    executor: createSeededMilkTeaFixtureExecutor(),
  });
}
