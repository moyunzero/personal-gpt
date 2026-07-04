import "dotenv/config";
import "reflect-metadata";
import * as fs from "node:fs";
import * as path from "node:path";

import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

import { embedTexts } from "@personal-gpt/shared/ai/embeddings";
import { DEFAULT_WORKSPACE_ID } from "@personal-gpt/shared/constants/workspace";
import { createVectorStore } from "@personal-gpt/shared/stores/vector-store.astra";

import { DocumentEntity } from "../lib/db/entities/document.entity";
import type AppDataSourceType from "../lib/db/data-source";

const REPO_ROOT = path.join(__dirname, "../../..");
const SUGGESTIONS_DIR = path.join(REPO_ROOT, "data/prompt-suggestions");
const PSYCHOLOGY_FILE = path.join(REPO_ROOT, "data/psychology-10k-Deepseek-R1-zh.json");

const dryRun = process.argv.includes("--dry-run");
const psychologyLimit = process.env.LEGACY_PSYCHOLOGY_LIMIT
  ? parseInt(process.env.LEGACY_PSYCHOLOGY_LIMIT, 10)
  : 50;

async function upsertLegacyDocument(
  dataSource: typeof AppDataSourceType,
  params: {
    title: string;
    source: string;
    category: string;
    filePath: string;
    chunks: string[];
    tags?: string[];
  },
): Promise<void> {
  const { title, source, category, filePath, chunks, tags = [] } = params;

  if (dryRun) {
    console.log(`[dry-run] would migrate document "${title}" (${chunks.length} chunks)`);
    return;
  }

  const docRepo = dataSource.getRepository(DocumentEntity);
  let document = await docRepo.findOne({
    where: { workspaceId: DEFAULT_WORKSPACE_ID, title, source },
  });

  if (!document) {
    document = docRepo.create({
      workspaceId: DEFAULT_WORKSPACE_ID,
      title,
      source,
      category,
      tags,
      status: "processing",
      filePath,
      mimeType: "text/markdown",
    });
    document = await docRepo.save(document);
  }

  const vectorStore = createVectorStore();
  await vectorStore.deleteByDocument(DEFAULT_WORKSPACE_ID, document.id);

  const embeddings = await embedTexts(chunks);
  await vectorStore.upsert(
    chunks.map((text, chunkIndex) => ({
      workspaceId: DEFAULT_WORKSPACE_ID,
      documentId: document!.id,
      chunkIndex,
      text,
      vector: embeddings[chunkIndex]!,
      title,
      source,
      category,
      tags,
    })),
  );

  document.chunkCount = chunks.length;
  document.status = "ready";
  await docRepo.save(document);
  console.log(`✔ migrated "${title}" (${chunks.length} chunks)`);
}

async function migratePromptSuggestions(dataSource: typeof AppDataSourceType): Promise<number> {
  if (!fs.existsSync(SUGGESTIONS_DIR)) {
    console.log(`⏭ skip prompt-suggestions: ${SUGGESTIONS_DIR} not found`);
    return 0;
  }

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 800,
    chunkOverlap: 150,
  });

  const files = fs.readdirSync(SUGGESTIONS_DIR).filter((f) => f.endsWith(".md"));
  let count = 0;

  for (const fileName of files) {
    const content = fs.readFileSync(path.join(SUGGESTIONS_DIR, fileName), "utf-8");
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch?.[1]?.trim() ?? fileName;
    const chunks = await splitter.splitText(content);

    await upsertLegacyDocument(dataSource, {
      title,
      source: "legacy-prompt-suggestion",
      category: "legacy-prompt-suggestion",
      filePath: path.join(SUGGESTIONS_DIR, fileName),
      chunks,
      tags: ["legacy", fileName],
    });
    count += 1;
  }

  return count;
}

async function migratePsychology(dataSource: typeof AppDataSourceType): Promise<number> {
  if (!fs.existsSync(PSYCHOLOGY_FILE)) {
    console.log(`⏭ skip psychology-qa: ${PSYCHOLOGY_FILE} not found`);
    return 0;
  }

  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 512, chunkOverlap: 100 });
  const lines = fs.readFileSync(PSYCHOLOGY_FILE, "utf-8").trim().split("\n");
  const qaData = lines.slice(0, psychologyLimit).map(
    (line) =>
      JSON.parse(line) as {
        input: string;
        content: string;
        reasoning_content: string;
      },
  );

  let count = 0;
  for (const [index, qa] of qaData.entries()) {
    const combined = `问题: ${qa.input}\n\n回答: ${qa.content}\n\n推理: ${qa.reasoning_content}`;
    const chunks = await splitter.splitText(combined);
    const title = qa.input.slice(0, 80);

    await upsertLegacyDocument(dataSource, {
      title,
      source: "legacy-psychology-qa",
      category: "legacy-psychology-qa",
      filePath: `${PSYCHOLOGY_FILE}#${index}`,
      chunks,
      tags: ["legacy", "psychology"],
    });
    count += 1;
  }

  return count;
}

async function main() {
  console.log(`migrate:legacy ${dryRun ? "(dry-run)" : ""}`);
  console.log(`workspaceId=${DEFAULT_WORKSPACE_ID}`);

  let dataSource: typeof AppDataSourceType | null = null;
  if (!dryRun) {
    const mod = await import("../lib/db/data-source");
    dataSource = mod.default;
    await dataSource.initialize();
  }

  const noopDataSource = {} as typeof AppDataSourceType;
  const promptCount = await migratePromptSuggestions(dataSource ?? noopDataSource);
  const psychCount = await migratePsychology(dataSource ?? noopDataSource);

  console.log(`Done. prompt-suggestions=${promptCount}, psychology-qa=${psychCount}`);

  if (dataSource) {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
