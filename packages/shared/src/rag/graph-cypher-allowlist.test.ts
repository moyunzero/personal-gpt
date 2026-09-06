import { describe, expect, it } from "vitest";

import { assertAllowlistedCypher, CypherAllowlistError } from "./graph-cypher-allowlist";

describe("assertAllowlistedCypher", () => {
  it("allows MATCH/RETURN path queries", () => {
    expect(() =>
      assertAllowlistedCypher(
        "MATCH path = (p:Product {name: $name})-[:CONTAINS]->(i:Ingredient)-[:USES]->(m:Method) RETURN path",
      ),
    ).not.toThrow();
  });

  it("rejects destructive Cypher (DELETE / DROP / MERGE / CREATE)", () => {
    const bad = [
      "MATCH (n) DELETE n",
      "DROP CONSTRAINT foo",
      "MERGE (p:Product {name: 'x'}) RETURN p",
      "CREATE (p:Product {name: 'x'}) RETURN p",
      "MATCH (n) SET n.hacked = true RETURN n",
      "MATCH (n) DETACH DELETE n",
      "CALL dbms.security.listUsers() YIELD username RETURN username",
    ];
    for (const cypher of bad) {
      expect(() => assertAllowlistedCypher(cypher), cypher).toThrow(CypherAllowlistError);
    }
  });

  it("rejects statements that do not start with MATCH or lack RETURN", () => {
    expect(() => assertAllowlistedCypher("RETURN 1")).toThrow(/MATCH/);
    expect(() => assertAllowlistedCypher("MATCH (n)")).toThrow(/RETURN/);
  });

  it("rejects unlabeled nodes and non-allowlisted labels/rels (WR-X-05)", () => {
    expect(() => assertAllowlistedCypher("MATCH (n) RETURN n")).toThrow(/unlabeled node pattern/);
    expect(() => assertAllowlistedCypher("MATCH (x:Evil) RETURN x")).toThrow(/not allowlisted/);
    expect(() =>
      assertAllowlistedCypher("MATCH (a:Product)-[:HACK]->(b:Ingredient) RETURN a"),
    ).toThrow(/relationship type not allowlisted/);
  });

  it("rejects untyped and non-allowlisted multi-type relationship patterns", () => {
    expect(() => assertAllowlistedCypher("MATCH (a:Product)-[]->(b:Ingredient) RETURN a")).toThrow(
      /untyped relationship/i,
    );
    expect(() => assertAllowlistedCypher("MATCH (a:Product)-[r]->(b:Ingredient) RETURN a")).toThrow(
      /untyped relationship/i,
    );
    expect(() =>
      assertAllowlistedCypher("MATCH (a:Product)-[:CONTAINS|HACK]->(b:Ingredient) RETURN a"),
    ).toThrow(/relationship type not allowlisted/);
  });

  it("allows Entity/Document labels and D-13 rel types (GRAPH-03)", () => {
    expect(() =>
      assertAllowlistedCypher(
        "MATCH path = (d:Document {workspaceId: $workspaceId})-[:MENTIONS]->(e:Entity) WHERE e.workspaceId = $workspaceId RETURN path",
      ),
    ).not.toThrow();
    expect(() =>
      assertAllowlistedCypher(
        "MATCH path = (e:Entity {workspaceId: $workspaceId})-[:RELATED_TO]->(n:Concept) RETURN path",
      ),
    ).not.toThrow();
  });

  it("allows bounded 1-2 hop variable-length rels and rejects unbounded", () => {
    expect(() =>
      assertAllowlistedCypher(
        "MATCH path = (e:Entity)-[:RELATED_TO|CONTAINS|USES*1..2]-(n:Entity) RETURN path",
      ),
    ).not.toThrow();
    expect(() =>
      assertAllowlistedCypher("MATCH path = (e:Entity)-[:RELATED_TO*]-(n:Entity) RETURN path"),
    ).toThrow(/variable-length relationship not allowlisted/);
    expect(() =>
      assertAllowlistedCypher("MATCH path = (e:Entity)-[:RELATED_TO*1..5]-(n:Entity) RETURN path"),
    ).toThrow(/exceeds max hops/);
  });
});
