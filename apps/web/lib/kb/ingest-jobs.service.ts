import { DEFAULT_WORKSPACE_ID } from "@personal-gpt/shared/constants/workspace";

import { IngestJobEntity } from "@/lib/db/entities/ingest-job.entity";
import { getDataSource } from "@/lib/db/get-data-source";

/** 按 id 查询 ingest job，并校验 default workspace（SSE 防枚举） */
export async function getIngestJobById(
  jobId: string,
): Promise<IngestJobEntity | null> {
  const ds = await getDataSource();
  const jobRepo = ds.getRepository(IngestJobEntity);
  return jobRepo.findOne({
    where: { id: jobId, workspaceId: DEFAULT_WORKSPACE_ID },
  });
}
