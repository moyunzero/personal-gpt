import { randomUUID } from "node:crypto";

import type { DataSource } from "typeorm";
import { In } from "typeorm";

import type { DocumentEntity, DocumentVisibility } from "@/lib/db/entities/document.entity";
import { EntityAclEntity } from "@/lib/db/entities/entity-acl.entity";
import { EntityCatalogEntity } from "@/lib/db/entities/entity-catalog.entity";
import { DocumentEntity as DocEntity } from "@/lib/db/entities/document.entity";
import { WorkspaceInviteEntity } from "@/lib/db/entities/workspace-invite.entity";
import {
  WorkspaceMemberEntity,
  type WorkspaceRole,
} from "@/lib/db/entities/workspace-member.entity";
import { UserEntity } from "@/lib/db/entities/user.entity";
import { WorkspaceEntity } from "@/lib/db/entities/workspace.entity";
import { getDataSource } from "@/lib/db/get-data-source";

import { canReadDocument, type DocumentAccessContext } from "./document-acl";

export type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
  isActive: boolean;
};

export async function listUserWorkspaces(userId: string): Promise<WorkspaceSummary[]> {
  const ds = await getDataSource();
  const user = await ds.getRepository(UserEntity).findOne({ where: { id: userId } });
  const rows = await ds
    .getRepository(WorkspaceMemberEntity)
    .createQueryBuilder("m")
    .innerJoinAndSelect("m.workspace", "w")
    .where("m.user_id = :userId", { userId })
    .orderBy("w.created_at", "ASC")
    .getMany();

  return rows.map((row) => ({
    id: row.workspaceId,
    name: row.workspace.name,
    slug: row.workspace.slug,
    role: row.role,
    isActive: row.workspaceId === user?.activeWorkspaceId,
  }));
}

export async function switchActiveWorkspace(userId: string, workspaceId: string): Promise<boolean> {
  const ds = await getDataSource();
  const membership = await ds.getRepository(WorkspaceMemberEntity).findOne({
    where: { userId, workspaceId },
  });
  if (!membership) return false;

  await ds.getRepository(UserEntity).update({ id: userId }, { activeWorkspaceId: workspaceId });
  return true;
}

export async function createTeamWorkspace(
  userId: string,
  name: string,
): Promise<WorkspaceEntity | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const ds = await getDataSource();
  const workspaceRepo = ds.getRepository(WorkspaceEntity);
  const memberRepo = ds.getRepository(WorkspaceMemberEntity);
  const userRepo = ds.getRepository(UserEntity);

  const workspaceId = randomUUID();
  const slug = `team-${trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}-${workspaceId.slice(0, 8)}`;

  const workspace = workspaceRepo.create({ id: workspaceId, slug, name: trimmed });
  await workspaceRepo.save(workspace);
  await memberRepo.save(memberRepo.create({ workspaceId, userId, role: "owner" }));
  await userRepo.update({ id: userId }, { activeWorkspaceId: workspaceId });
  return workspace;
}

export async function getMemberRole(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceRole | null> {
  const ds = await getDataSource();
  const row = await ds.getRepository(WorkspaceMemberEntity).findOne({
    where: { userId, workspaceId },
  });
  return row?.role ?? null;
}

export async function resolveDocumentAccessContext(
  userId: string,
  workspaceId: string,
): Promise<DocumentAccessContext | null> {
  const role = await getMemberRole(userId, workspaceId);
  if (!role) return null;
  return { userId, memberRole: role };
}

export async function resolveAllowedDocumentIds(
  userId: string,
  workspaceId: string,
): Promise<string[]> {
  const ctx = await resolveDocumentAccessContext(userId, workspaceId);
  if (!ctx) return [];

  const ds = await getDataSource();
  const docs = await ds.getRepository(DocEntity).find({ where: { workspaceId } });
  return docs.filter((doc) => canReadDocument(doc, ctx)).map((doc) => doc.id);
}

export async function createWorkspaceInvite(input: {
  workspaceId: string;
  inviterUserId: string;
  email: string;
  role: WorkspaceRole;
}): Promise<WorkspaceInviteEntity | null> {
  const role = await getMemberRole(input.inviterUserId, input.workspaceId);
  if (role !== "owner") return null;

  const ds = await getDataSource();
  const invite = ds.getRepository(WorkspaceInviteEntity).create({
    workspaceId: input.workspaceId,
    email: input.email.trim().toLowerCase(),
    role: input.role,
    token: randomUUID(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
  return ds.getRepository(WorkspaceInviteEntity).save(invite);
}

export async function acceptWorkspaceInvite(
  token: string,
  userId: string,
  userEmail: string,
): Promise<{ workspaceId: string } | null> {
  const ds = await getDataSource();
  const inviteRepo = ds.getRepository(WorkspaceInviteEntity);
  const memberRepo = ds.getRepository(WorkspaceMemberEntity);
  const userRepo = ds.getRepository(UserEntity);

  const invite = await inviteRepo.findOne({ where: { token } });
  if (!invite || invite.expiresAt < new Date()) return null;
  if (invite.email !== userEmail.trim().toLowerCase()) return null;

  const existing = await memberRepo.findOne({
    where: { workspaceId: invite.workspaceId, userId },
  });
  if (!existing) {
    await memberRepo.save(
      memberRepo.create({
        workspaceId: invite.workspaceId,
        userId,
        role: invite.role,
      }),
    );
  }

  await userRepo.update({ id: userId }, { activeWorkspaceId: invite.workspaceId });
  await inviteRepo.delete({ id: invite.id });
  return { workspaceId: invite.workspaceId };
}

/** Mirror document visibility into entity_acl rows (D-50). */
export async function syncEntityAclForDocument(
  dataSource: DataSource,
  document: DocumentEntity,
): Promise<void> {
  const catalogRepo = dataSource.getRepository(EntityCatalogEntity);
  const aclRepo = dataSource.getRepository(EntityAclEntity);

  const entities = await catalogRepo.find({
    where: { workspaceId: document.workspaceId, sourceDocumentId: document.id },
  });
  if (entities.length === 0) return;

  await aclRepo.delete({
    workspaceId: document.workspaceId,
    entityCatalogId: In(entities.map((e) => e.id)),
  });

  for (const entity of entities) {
    if (document.visibility === "workspace") {
      await aclRepo.save(
        aclRepo.create({
          workspaceId: document.workspaceId,
          entityCatalogId: entity.id,
          principalType: "workspace",
          principalId: document.workspaceId,
          permission: "read",
        }),
      );
      continue;
    }

    const readers = new Set<string>();
    if (document.ownerId) readers.add(document.ownerId);
    if (document.visibility === "restricted") {
      for (const uid of document.restrictedUserIds) readers.add(uid);
    }

    for (const userId of readers) {
      await aclRepo.save(
        aclRepo.create({
          workspaceId: document.workspaceId,
          entityCatalogId: entity.id,
          principalType: "user",
          principalId: userId,
          permission: "read",
        }),
      );
    }
  }
}

export async function updateDocumentVisibility(
  documentId: string,
  workspaceId: string,
  userId: string,
  patch: {
    visibility: DocumentVisibility;
    restrictedUserIds?: string[];
  },
): Promise<DocumentEntity | null> {
  const ds = await getDataSource();
  const docRepo = ds.getRepository(DocEntity);
  const document = await docRepo.findOne({ where: { id: documentId, workspaceId } });
  if (!document) return null;

  const role = await getMemberRole(userId, workspaceId);
  if (!role) return null;
  const workspaceOwner = role === "owner";
  if (document.ownerId !== userId && !workspaceOwner) return null;

  document.visibility = patch.visibility;
  if (patch.visibility === "restricted") {
    document.restrictedUserIds = patch.restrictedUserIds ?? document.restrictedUserIds;
  } else {
    document.restrictedUserIds = [];
  }

  const saved = await docRepo.save(document);
  await syncEntityAclForDocument(ds, saved);
  return saved;
}
