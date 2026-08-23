import { randomUUID } from "node:crypto";

import type { DataSource } from "typeorm";

import { UserEntity } from "@/lib/db/entities/user.entity";
import { WorkspaceMemberEntity } from "@/lib/db/entities/workspace-member.entity";
import { WorkspaceEntity } from "@/lib/db/entities/workspace.entity";

/** First sign-in: personal workspace + owner membership (D-39). */
export async function bootstrapPersonalWorkspace(
  dataSource: DataSource,
  user: Pick<UserEntity, "id" | "email" | "name">,
): Promise<string> {
  const workspaceRepo = dataSource.getRepository(WorkspaceEntity);
  const memberRepo = dataSource.getRepository(WorkspaceMemberEntity);
  const userRepo = dataSource.getRepository(UserEntity);

  const workspaceId = randomUUID();
  const slugBase = (user.email?.split("@")[0] ?? user.id.slice(0, 8))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const slug = `personal-${slugBase || "user"}-${workspaceId.slice(0, 8)}`;
  const name = user.name?.trim() || `${user.email ?? "My"} Workspace`;

  const workspace = workspaceRepo.create({
    id: workspaceId,
    slug,
    name,
  });
  await workspaceRepo.save(workspace);

  const membership = memberRepo.create({
    workspaceId,
    userId: user.id,
    role: "owner",
  });
  await memberRepo.save(membership);

  await userRepo.update({ id: user.id }, { activeWorkspaceId: workspaceId });
  return workspaceId;
}
