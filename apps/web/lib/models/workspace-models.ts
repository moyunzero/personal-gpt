import { presetForModel } from "@personal-gpt/shared/ai/model-presets";

import { openModelKey, sealModelKey } from "./model-key";

import { getDataSource } from "@/lib/db/get-data-source";
import { WorkspaceLlmModelEntity } from "@/lib/db/entities/workspace-llm-model.entity";
import { WorkspaceLlmPrefEntity } from "@/lib/db/entities/workspace-llm-pref.entity";

const MODEL_ID = /^[A-Za-z0-9_.:/@+-]{1,128}$/;

export type PublicLlmModel = { id: string; modelId: string };

export function assertModelId(modelId: string): string {
  const trimmed = modelId.trim();
  if (!MODEL_ID.test(trimmed)) {
    throw new Error("模型名称无效");
  }
  return trimmed;
}

export async function listWorkspaceModels(workspaceId: string): Promise<{
  models: PublicLlmModel[];
  chatModelId: string;
  agentModelId: string;
}> {
  const ds = await getDataSource();
  const models = await ds.getRepository(WorkspaceLlmModelEntity).find({
    where: { workspaceId },
    order: { createdAt: "ASC" },
  });
  const pref = await ds.getRepository(WorkspaceLlmPrefEntity).findOne({ where: { workspaceId } });
  return {
    models: models.map((row) => ({ id: row.id, modelId: row.modelId })),
    chatModelId: pref?.chatModelId ?? "",
    agentModelId: pref?.agentModelId ?? "",
  };
}

export async function addWorkspaceModel(params: {
  workspaceId: string;
  modelId: string;
  apiKey: string;
  baseURL: string;
}): Promise<PublicLlmModel> {
  const modelId = assertModelId(params.modelId);
  const apiKey = params.apiKey.trim();
  const baseURL = params.baseURL.trim();
  if (!apiKey) throw new Error("需要 API key");
  if (!baseURL) throw new Error("缺少模型平台地址");

  const ds = await getDataSource();
  const repo = ds.getRepository(WorkspaceLlmModelEntity);
  const existing = await repo.findOne({ where: { workspaceId: params.workspaceId, modelId } });
  const saved = existing
    ? await repo.save({ ...existing, apiKey: sealModelKey(apiKey), baseUrl: baseURL })
    : await repo.save(
        repo.create({
          workspaceId: params.workspaceId,
          modelId,
          apiKey: sealModelKey(apiKey),
          baseUrl: baseURL,
        }),
      );

  const prefRepo = ds.getRepository(WorkspaceLlmPrefEntity);
  const pref = await prefRepo.findOne({ where: { workspaceId: params.workspaceId } });
  if (!pref) {
    await prefRepo.save(
      prefRepo.create({
        workspaceId: params.workspaceId,
        chatModelId: modelId,
        agentModelId: modelId,
      }),
    );
  }

  return { id: saved.id, modelId: saved.modelId };
}

export async function setWorkspaceModelSelection(params: {
  workspaceId: string;
  chatModelId?: string;
  agentModelId?: string;
}): Promise<void> {
  const ds = await getDataSource();
  const repo = ds.getRepository(WorkspaceLlmModelEntity);
  const prefRepo = ds.getRepository(WorkspaceLlmPrefEntity);
  const current =
    (await prefRepo.findOne({ where: { workspaceId: params.workspaceId } })) ??
    prefRepo.create({ workspaceId: params.workspaceId, chatModelId: "", agentModelId: "" });

  if (params.chatModelId !== undefined) {
    const modelId = assertModelId(params.chatModelId);
    const row = await repo.findOne({ where: { workspaceId: params.workspaceId, modelId } });
    if (!row) throw new Error("模型未添加");
    current.chatModelId = modelId;
  }
  if (params.agentModelId !== undefined) {
    const modelId = assertModelId(params.agentModelId);
    const row = await repo.findOne({ where: { workspaceId: params.workspaceId, modelId } });
    if (!row) throw new Error("模型未添加");
    current.agentModelId = modelId;
  }
  await prefRepo.save(current);
}

/** Returns the stored key only for a catalog model. Never log the result. */
export async function lookupWorkspaceModelKey(
  workspaceId: string,
  modelId: string,
): Promise<{ modelId: string; apiKey: string; baseURL?: string } | null> {
  const trimmed = modelId.trim();
  if (!MODEL_ID.test(trimmed)) return null;
  const ds = await getDataSource();
  const row = await ds.getRepository(WorkspaceLlmModelEntity).findOne({
    where: { workspaceId, modelId: trimmed },
  });
  if (!row) return null;
  const baseURL = row.baseUrl.trim() || presetForModel(row.modelId)?.baseURL;
  return { modelId: row.modelId, apiKey: openModelKey(row.apiKey), ...(baseURL ? { baseURL } : {}) };
}
