/**
 * Narrow Graph RAG over a seeded milk-tea subgraph (A5 / RAG-06).
 * Uses neo4j-driver read transactions only; Cypher must pass allowlist.
 * No @langchain/community Neo4jGraph.
 */

import neo4j, { type Driver, type Path as Neo4jPath } from "neo4j-driver";

import { assertAllowlistedCypher } from "./graph-cypher-allowlist";
import { resolveSeedProductName } from "../routing/graph-entities";

export type GraphPathNode = {
  id: string;
  labels: string[];
  properties: Record<string, unknown>;
};

export type GraphPathRel = {
  id: string;
  type: string;
  startNodeId: string;
  endNodeId: string;
};

export type GraphPathTrace = {
  nodes: GraphPathNode[];
  relationships: GraphPathRel[];
};

export type GraphRagResult = {
  cypher: string;
  params: Record<string, unknown>;
  paths: GraphPathTrace[];
  /** Flattened node/rel summary for tool citation */
  summary: string;
};

export type GraphQueryExecutor = (
  cypher: string,
  params: Record<string, unknown>,
) => Promise<GraphPathTrace[]>;

/** Canonical path query for milk-tea seed: Product → Ingredient → Method */
export const MILK_TEA_PATH_CYPHER = `
MATCH path = (p:Product {name: $productName})-[:CONTAINS]->(i:Ingredient)-[:USES]->(m:Method)
RETURN path
`.trim();

/** Seed Cypher (write) — only for bootstrap scripts / test fixtures, never via graphRagQuery. */
export const MILK_TEA_SEED_CYPHER = `
MERGE (p:Product {name: "珍珠奶茶", id: "product:pearl-milk-tea"})
MERGE (i:Ingredient {name: "珍珠", id: "ingredient:tapioca"})
MERGE (m:Method {name: "煮制", id: "method:boil"})
MERGE (t:Type {name: "台式奶茶", id: "type:taiwanese"})
MERGE (peo:People {name: "学生", id: "people:students"})
MERGE (p)-[:BELONGS_TO]->(t)
MERGE (p)-[:CONTAINS]->(i)
MERGE (i)-[:USES]->(m)
MERGE (p)-[:SUITABLE_FOR]->(peo)
`.trim();

/** @deprecated Prefer resolveSeedProductName from routing/graph-entities */
export function resolveProductName(question: string): string | null {
  return resolveSeedProductName(question);
}

function nodeIdFromProps(props: Record<string, unknown>, elementId: string): string {
  const id = props.id;
  if (typeof id === "string" && id.trim()) return id.trim();
  const name = props.name;
  if (typeof name === "string" && name.trim()) return name.trim();
  return elementId;
}

function pathFromNeo4j(path: Neo4jPath): GraphPathTrace {
  const nodes: GraphPathNode[] = path.segments.length
    ? [
        (() => {
          const start = path.start;
          const props = (start.properties ?? {}) as Record<string, unknown>;
          const elementId = String(start.elementId ?? start.identity?.toString?.() ?? "n0");
          return {
            id: nodeIdFromProps(props, elementId),
            labels: [...(start.labels ?? [])],
            properties: props,
          };
        })(),
      ]
    : [];

  const relationships: GraphPathRel[] = [];
  for (const seg of path.segments) {
    const endProps = (seg.end.properties ?? {}) as Record<string, unknown>;
    const endElementId = String(seg.end.elementId ?? seg.end.identity?.toString?.() ?? "n");
    nodes.push({
      id: nodeIdFromProps(endProps, endElementId),
      labels: [...(seg.end.labels ?? [])],
      properties: endProps,
    });
    const relProps = (seg.relationship.properties ?? {}) as Record<string, unknown>;
    const relElementId = String(
      seg.relationship.elementId ?? seg.relationship.identity?.toString?.() ?? "r",
    );
    relationships.push({
      id: typeof relProps.id === "string" ? relProps.id : relElementId,
      type: seg.relationship.type,
      startNodeId: nodes[nodes.length - 2]!.id,
      endNodeId: nodes[nodes.length - 1]!.id,
    });
  }

  // Single-node path (no segments)
  if (!path.segments.length && path.start) {
    const props = (path.start.properties ?? {}) as Record<string, unknown>;
    const elementId = String(path.start.elementId ?? path.start.identity?.toString?.() ?? "n0");
    return {
      nodes: [
        {
          id: nodeIdFromProps(props, elementId),
          labels: [...(path.start.labels ?? [])],
          properties: props,
        },
      ],
      relationships: [],
    };
  }

  return { nodes, relationships };
}

function summarizePaths(paths: GraphPathTrace[]): string {
  if (!paths.length) return "GRAPH_RAG_STATUS: NO_PATH";
  const lines: string[] = ["GRAPH_RAG_STATUS: HIT"];
  paths.forEach((p, idx) => {
    const nodePart = p.nodes.map((n) => `${n.labels[0] ?? "Node"}:${n.id}`).join(" -> ");
    const relPart = p.relationships.map((r) => r.type).join(",");
    lines.push(`[path ${idx + 1}] nodes: ${nodePart}`);
    lines.push(`[path ${idx + 1}] relationships: ${relPart}`);
  });
  return lines.join("\n");
}

/** In-memory fixture executor for regression / unit tests (no live Neo4j). */
export function createSeededMilkTeaFixtureExecutor(): GraphQueryExecutor {
  const fixturePath: GraphPathTrace = {
    nodes: [
      {
        id: "product:pearl-milk-tea",
        labels: ["Product"],
        properties: { name: "珍珠奶茶", id: "product:pearl-milk-tea" },
      },
      {
        id: "ingredient:tapioca",
        labels: ["Ingredient"],
        properties: { name: "珍珠", id: "ingredient:tapioca" },
      },
      {
        id: "method:boil",
        labels: ["Method"],
        properties: { name: "煮制", id: "method:boil" },
      },
    ],
    relationships: [
      {
        id: "rel:contains",
        type: "CONTAINS",
        startNodeId: "product:pearl-milk-tea",
        endNodeId: "ingredient:tapioca",
      },
      {
        id: "rel:uses",
        type: "USES",
        startNodeId: "ingredient:tapioca",
        endNodeId: "method:boil",
      },
    ],
  };

  return async (cypher) => {
    assertAllowlistedCypher(cypher);
    return [fixturePath];
  };
}

export type GraphRagQueryOptions = {
  question: string;
  productName?: string;
  /** Inject for tests; default uses neo4j-driver read session from env */
  executor?: GraphQueryExecutor;
};

let cachedDriver: Driver | undefined;

const NEO4J_TX_TIMEOUT_MS = 15_000;

export function getNeo4jDriverFromEnv(): Driver {
  if (cachedDriver) return cachedDriver;
  const uri = process.env.NEO4J_URI?.trim() || "bolt://localhost:7687";
  const user = process.env.NEO4J_USER?.trim() || "neo4j";
  const password = process.env.NEO4J_PASSWORD?.trim();
  if (!password && process.env.NODE_ENV === "production") {
    throw new Error("NEO4J_PASSWORD is required in production");
  }
  const resolvedPassword = password || "personal_gpt_neo4j";
  cachedDriver = neo4j.driver(uri, neo4j.auth.basic(user, resolvedPassword), {
    connectionAcquisitionTimeout: NEO4J_TX_TIMEOUT_MS,
    maxTransactionRetryTime: NEO4J_TX_TIMEOUT_MS,
  });
  return cachedDriver;
}

export async function resetNeo4jDriverForTests(): Promise<void> {
  if (cachedDriver) {
    await cachedDriver.close();
    cachedDriver = undefined;
  }
}

async function defaultExecutor(
  cypher: string,
  params: Record<string, unknown>,
): Promise<GraphPathTrace[]> {
  assertAllowlistedCypher(cypher);
  const driver = getNeo4jDriverFromEnv();
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.executeRead(async (tx) => tx.run(cypher, params), {
      timeout: NEO4J_TX_TIMEOUT_MS,
    });
    const paths: GraphPathTrace[] = [];
    for (const record of result.records) {
      const path = record.get("path") as Neo4jPath | undefined;
      if (path) paths.push(pathFromNeo4j(path));
    }
    return paths;
  } finally {
    await session.close();
  }
}

/**
 * Narrow Graph RAG entry: entity-relation questions over seeded subgraph.
 * Always allowlists Cypher before execution.
 *
 * Tenancy: demo seed subgraph is global (no workspaceId filter) until Phase 4 GRAPH-01.
 */
export async function graphRagQuery(options: GraphRagQueryOptions): Promise<GraphRagResult> {
  const productName = options.productName ?? resolveProductName(options.question);
  const cypher = MILK_TEA_PATH_CYPHER;
  if (!productName) {
    return {
      cypher,
      params: {},
      paths: [],
      summary: "GRAPH_RAG_STATUS: NO_PATH",
    };
  }
  const params = { productName };
  assertAllowlistedCypher(cypher);

  const executor = options.executor ?? defaultExecutor;
  const paths = await executor(cypher, params);
  return {
    cypher,
    params,
    paths,
    summary: summarizePaths(paths),
  };
}

/** Bootstrap seed subgraph (write). Call only from admin/seed scripts — not from Agent tools. */
export async function seedMilkTeaSubgraph(driver: Driver = getNeo4jDriverFromEnv()): Promise<void> {
  const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
  try {
    await session.executeWrite(async (tx) => {
      await tx.run(MILK_TEA_SEED_CYPHER);
    });
  } finally {
    await session.close();
  }
}
