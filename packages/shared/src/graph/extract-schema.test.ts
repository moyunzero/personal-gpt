import { describe, expect, it } from "vitest";

import { ChunkGraphSchema, EntityTypeEnum, RelationTypeEnum } from "./extract-schema";

describe("EntityTypeEnum", () => {
  it("accepts all D-14 values", () => {
    for (const value of ["person", "org", "product", "concept", "location", "other"]) {
      expect(EntityTypeEnum.parse(value)).toBe(value);
    }
  });

  it("rejects invalid entityType", () => {
    expect(EntityTypeEnum.safeParse("brand").success).toBe(false);
  });
});

describe("RelationTypeEnum", () => {
  it("accepts D-13 fixed set", () => {
    for (const value of ["MENTIONS", "RELATED_TO", "CONTAINS", "USES"]) {
      expect(RelationTypeEnum.parse(value)).toBe(value);
    }
  });

  it("rejects unknown relation types", () => {
    expect(RelationTypeEnum.safeParse("BELONGS_TO").success).toBe(false);
  });
});

describe("ChunkGraphSchema", () => {
  it("parses valid chunk graph output", () => {
    const parsed = ChunkGraphSchema.parse({
      entities: [{ name: "Alice", entityType: "person" }],
      relations: [{ fromName: "Alice", toName: "Acme", type: "RELATED_TO" }],
    });
    expect(parsed.entities).toHaveLength(1);
    expect(parsed.relations[0]?.type).toBe("RELATED_TO");
  });

  it("rejects invalid entityType in chunk graph", () => {
    expect(
      ChunkGraphSchema.safeParse({
        entities: [{ name: "Foo", entityType: "invalid" }],
        relations: [],
      }).success,
    ).toBe(false);
  });

  it("rejects relation type outside D-13 set", () => {
    expect(
      ChunkGraphSchema.safeParse({
        entities: [{ name: "Foo", entityType: "concept" }],
        relations: [{ fromName: "Foo", toName: "Bar", type: "HACK" }],
      }).success,
    ).toBe(false);
  });
});
