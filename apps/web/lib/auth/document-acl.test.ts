import { describe, expect, it } from "vitest";

import type { DocumentEntity } from "@/lib/db/entities/document.entity";

import { canReadDocument, canWriteDocument, type DocumentAccessContext } from "./document-acl";

function doc(
  partial: Partial<DocumentEntity> & Pick<DocumentEntity, "ownerId" | "visibility">,
): DocumentEntity {
  return {
    id: "doc-1",
    workspaceId: "ws-1",
    title: "t",
    source: null,
    category: null,
    tags: [],
    status: "ready",
    chunkCount: 1,
    filePath: null,
    mimeType: null,
    restrictedUserIds: [],
    createdAt: new Date(0),
    updatedAt: new Date(0),
    workspace: undefined as never,
    owner: null,
    ...partial,
  };
}

describe("canWriteDocument", () => {
  const workspaceDoc = doc({ ownerId: "owner-1", visibility: "workspace" });

  it("allows document owner regardless of memberRole", () => {
    const ctx: DocumentAccessContext = { userId: "owner-1", memberRole: "viewer" };
    expect(canWriteDocument(workspaceDoc, ctx)).toBe(true);
  });

  it("allows workspace owner role on workspace-visible docs they do not own", () => {
    const ctx: DocumentAccessContext = { userId: "other", memberRole: "owner" };
    expect(canWriteDocument(workspaceDoc, ctx)).toBe(true);
  });

  it("allows workspace editor role on workspace-visible docs they do not own", () => {
    const ctx: DocumentAccessContext = { userId: "other", memberRole: "editor" };
    expect(canWriteDocument(workspaceDoc, ctx)).toBe(true);
  });

  it("denies viewer write even when canReadDocument is true (workspace visibility)", () => {
    const ctx: DocumentAccessContext = { userId: "viewer-1", memberRole: "viewer" };
    expect(canReadDocument(workspaceDoc, ctx)).toBe(true);
    expect(canWriteDocument(workspaceDoc, ctx)).toBe(false);
  });

  it("denies non-owner viewer on private docs", () => {
    const privateDoc = doc({ ownerId: "owner-1", visibility: "private" });
    const ctx: DocumentAccessContext = { userId: "viewer-1", memberRole: "viewer" };
    expect(canWriteDocument(privateDoc, ctx)).toBe(false);
  });

  it("denies editor write on private docs they cannot read", () => {
    const privateDoc = doc({ ownerId: "alice", visibility: "private" });
    const ctx: DocumentAccessContext = { userId: "editor-1", memberRole: "editor" };
    expect(canReadDocument(privateDoc, ctx)).toBe(false);
    expect(canWriteDocument(privateDoc, ctx)).toBe(false);
  });

  it("denies workspace owner write on private docs of others (read gate)", () => {
    const privateDoc = doc({ ownerId: "alice", visibility: "private" });
    const ctx: DocumentAccessContext = { userId: "ws-owner", memberRole: "owner" };
    // workspace owner role still cannot read private of others → cannot write either
    expect(canReadDocument(privateDoc, ctx)).toBe(false);
    expect(canWriteDocument(privateDoc, ctx)).toBe(false);
  });

  it("allows owner of private doc to write", () => {
    const privateDoc = doc({ ownerId: "alice", visibility: "private" });
    const ctx: DocumentAccessContext = { userId: "alice", memberRole: "viewer" };
    expect(canWriteDocument(privateDoc, ctx)).toBe(true);
  });
});
