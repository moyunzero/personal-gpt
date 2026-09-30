/**
 * 图编译 smoke：mock model 下 buildSupervisorGraph compile 成功。
 */
import { ChatOpenAI } from "@langchain/openai";
import { describe, expect, it } from "vitest";

import { buildSupervisorGraph } from "./build-graph";

describe("buildSupervisorGraph smoke", () => {
  it("compiles supervisor graph with a mock model", async () => {
    const model = new ChatOpenAI({
      model: "mock-model",
      apiKey: "sk-test-mock",
      configuration: { baseURL: "http://127.0.0.1:9" },
    });
    const graph = await buildSupervisorGraph({ model });
    expect(graph).toBeTruthy();
    expect(typeof graph.invoke).toBe("function");
  });
});
