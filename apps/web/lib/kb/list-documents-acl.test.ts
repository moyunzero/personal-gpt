import { describe, expect, it } from "vitest";

import { documentVisibilitySql } from "./list-documents-acl";

describe("documentVisibilitySql", () => {
  it("binds current user for private/restricted checks", () => {
    const { clause, params } = documentVisibilitySql({
      userId: "user-42",
      memberRole: "editor",
    });
    expect(clause).toContain("visibility = 'workspace'");
    expect(clause).toContain("owner_id = :aclUserId");
    expect(clause).toContain("restricted_user_ids");
    expect(params.aclUserId).toBe("user-42");
    expect(params.aclUserJson).toBe(JSON.stringify(["user-42"]));
  });
});
