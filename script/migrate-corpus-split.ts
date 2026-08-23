/**
 * Corpus split migration CLI (ISSUE-001 / D-26).
 *
 * Copies chunks from the legacy mixed Astra collection into physical
 * USER + SEED collections (and optionally ES indexes).
 *
 * Usage:
 *   npx tsx script/migrate-corpus-split.ts --dry-run
 *   npx tsx script/migrate-corpus-split.ts            # dry-run by default
 *   npx tsx script/migrate-corpus-split.ts --execute  # requires USER/SEED env
 *   npx tsx script/migrate-corpus-split.ts --execute --with-es
 *
 * Classification (seed sources → SEED; everything else → USER):
 *   psychology-qa, legacy-psychology-qa, prompt-suggestion, legacy-prompt-suggestion
 *
 * Dual-write transition (after successful --execute):
 *   1. Set ASTRA_DB_COLLECTION_USER / ASTRA_DB_COLLECTION_SEED (+ ES_INDEX_*)
 *   2. New ingest dual-writes only to split targets (fail-closed on ES)
 *   3. Treat legacy ASTRA_DB_COLLECTION as read-only; delete after retrieval verification
 *
 * Rollback / safety:
 *   - This script is copy-only; it never deletes from the legacy mixed collection
 *   - Retarget env to ASTRA_DB_COLLECTION (legacy) if split targets misbehave
 *   - Idempotent: skips docs whose _id already exists in the target collection
 *
 * Do NOT mark ISSUE-001 Closed here — wait for plan 03-03b regression green.
 */
import "dotenv/config";

import { DataAPIClient } from "@datastax/astra-db-ts";

import { ensureEsIndexes, indexChunks, resolveCorpusTargets } from "@personal-gpt/shared";

const SEED_SOURCES = new Set([
  "psychology-qa",
  "legacy-psychology-qa",
  "prompt-suggestion",
  "legacy-prompt-suggestion",
]);

type CorpusKind = "user" | "seed";

function hasFlag(argv: string[], flag: string): boolean {
  return argv.includes(flag);
}

function classifyCorpus(doc: Record<string, unknown>): CorpusKind {
  const source = String(doc.source ?? "");
  if (SEED_SOURCES.has(source)) return "seed";
  return "user";
}

function requireAstraEnv(): { endpoint: string; token: string; source: string } {
  const endpoint = process.env.ASTRA_DB_API_ENDPOINT?.trim();
  const token = process.env.ASTRA_DB_APPLICATION_TOKEN?.trim();
  const source = process.env.ASTRA_DB_COLLECTION?.trim();
  if (!endpoint || !token || !source) {
    throw new Error(
      "Astra credentials required: ASTRA_DB_API_ENDPOINT, ASTRA_DB_APPLICATION_TOKEN, ASTRA_DB_COLLECTION",
    );
  }
  return { endpoint, token, source };
}

function openCollection(endpoint: string, token: string, name: string) {
  const client = new DataAPIClient(token);
  const db = client.db(endpoint, { token });
  return db.collection(name);
}

async function countByCorpus(
  sourceCol: ReturnType<typeof openCollection>,
): Promise<{ user: number; seed: number; total: number; scanned: number }> {
  let user = 0;
  let seed = 0;
  let scanned = 0;
  await paginateSourceDocs(sourceCol, { source: 1, category: 1 }, async (doc) => {
    scanned += 1;
    if (classifyCorpus(doc) === "seed") seed += 1;
    else user += 1;
  });
  return { user, seed, total: user + seed, scanned };
}

const MIGRATE_PAGE_SIZE = 1000;

async function paginateSourceDocs(
  sourceCol: ReturnType<typeof openCollection>,
  projection: Record<string, 1>,
  onDoc: (doc: Record<string, unknown>) => Promise<void>,
): Promise<void> {
  let pageState: string | undefined;
  while (true) {
    const findOpts: {
      limit: number;
      projection: Record<string, 1>;
      pageState?: string;
    } = { limit: MIGRATE_PAGE_SIZE, projection };
    if (pageState) findOpts.pageState = pageState;
    const cursor = sourceCol.find({}, findOpts);
    const docs = (await cursor.toArray()) as Record<string, unknown>[];
    if (docs.length === 0) break;
    for (const doc of docs) {
      await onDoc(doc);
    }
    const nextState = (cursor as { pageState?: string }).pageState;
    if (!nextState || docs.length < MIGRATE_PAGE_SIZE) break;
    pageState = nextState;
  }
}

async function copyBatch(
  sourceCol: ReturnType<typeof openCollection>,
  userCol: ReturnType<typeof openCollection>,
  seedCol: ReturnType<typeof openCollection>,
  withEs: boolean,
): Promise<{ copiedUser: number; copiedSeed: number; skipped: number; esSkippedInvalid: number }> {
  let copiedUser = 0;
  let copiedSeed = 0;
  let skipped = 0;
  let esSkippedInvalid = 0;

  await paginateSourceDocs(
    sourceCol,
    {
      $vector: 1,
      content: 1,
      text: 1,
      workspaceId: 1,
      documentId: 1,
      chunkIndex: 1,
      title: 1,
      source: 1,
      category: 1,
    },
    async (doc) => {
      const kind = classifyCorpus(doc);
      const target = kind === "seed" ? seedCol : userCol;
      const id = doc._id;

      if (id !== undefined && id !== null) {
        const existing = await target.findOne({ _id: id } as Record<string, unknown>);
        if (existing) {
          skipped += 1;
        } else {
          await target.insertOne(doc as Record<string, unknown>);
          if (kind === "seed") copiedSeed += 1;
          else copiedUser += 1;
        }
      } else {
        await target.insertOne(doc as Record<string, unknown>);
        if (kind === "seed") copiedSeed += 1;
        else copiedUser += 1;
      }

      if (withEs) {
        const workspaceId = String(doc.workspaceId ?? "").trim();
        const documentId = String(doc.documentId ?? "").trim();
        const chunkIndex = Number(doc.chunkIndex ?? 0);
        if (!workspaceId || !documentId) {
          esSkippedInvalid += 1;
          console.warn(
            `[migrate-corpus-split] ES skip: missing workspaceId/documentId (_id=${String(id)})`,
          );
        } else {
          const { esIndex } = resolveCorpusTargets(kind);
          await indexChunks(esIndex, [
            {
              workspaceId,
              documentId,
              chunkIndex,
              content: String(doc.content ?? doc.text ?? ""),
              title: doc.title as string | undefined,
              source: doc.source as string | undefined,
              category: doc.category as string | undefined,
            },
          ]);
        }
      }
    },
  );

  return { copiedUser, copiedSeed, skipped, esSkippedInvalid };
}

async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const base =
    process.env.ASTRA_DB_COLLECTION && process.env.ASTRA_DB_COLLECTION.length > 0
      ? process.env.ASTRA_DB_COLLECTION
      : "db_emotion";
  const source = process.env.ASTRA_DB_COLLECTION ?? `(unset → plan uses ${base})`;
  const userTarget =
    process.env.ASTRA_DB_COLLECTION_USER ?? resolveCorpusTargets("user").astraCollection;
  const seedTarget =
    process.env.ASTRA_DB_COLLECTION_SEED ?? resolveCorpusTargets("seed").astraCollection;
  const esUser = resolveCorpusTargets("user").esIndex;
  const esSeed = resolveCorpusTargets("seed").esIndex;

  const wantsExecute = hasFlag(argv, "--execute");
  const withEs = hasFlag(argv, "--with-es");
  const dryRun = !wantsExecute;

  console.log("[migrate-corpus-split] planned migration");
  console.log(`  source:      ${source}`);
  console.log(`  user target: ${userTarget}`);
  console.log(`  seed target: ${seedTarget}`);
  console.log(`  ES user:     ${esUser}`);
  console.log(`  ES seed:     ${esSeed}`);
  console.log(
    `  mode:        ${dryRun ? "dry-run (no Astra/ES writes)" : `execute${withEs ? " + ES" : ""}`}`,
  );
  console.log(
    "  note:        after copy, dual-write to split targets; legacy collection → read-only then deletable",
  );

  if (!wantsExecute) {
    // Live counts when credentials present; otherwise print plan only (still exit 0)
    try {
      const { endpoint, token, source: src } = requireAstraEnv();
      const sourceCol = openCollection(endpoint, token, src);
      const counts = await countByCorpus(sourceCol);
      console.log(
        `[migrate-corpus-split] dry-run counts: total=${counts.total} user=${counts.user} seed=${counts.seed} (scanned=${counts.scanned})`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[migrate-corpus-split] dry-run: skip live counts (${msg})`);
    }
    console.log("[migrate-corpus-split] dry-run complete — no collections mutated");
    return;
  }

  // --execute gate: refuse without explicit USER/SEED targets (T-03-02-02)
  if (
    !process.env.ASTRA_DB_COLLECTION_USER?.trim() ||
    !process.env.ASTRA_DB_COLLECTION_SEED?.trim()
  ) {
    console.error(
      "[migrate-corpus-split] refusing --execute: set ASTRA_DB_COLLECTION_USER and ASTRA_DB_COLLECTION_SEED explicitly",
    );
    process.exitCode = 1;
    return;
  }

  if (userTarget === seedTarget) {
    console.error(
      "[migrate-corpus-split] refusing --execute: USER and SEED collection names must differ",
    );
    process.exitCode = 1;
    return;
  }

  const { endpoint, token, source: src } = requireAstraEnv();
  if (src === userTarget || src === seedTarget) {
    console.error(
      "[migrate-corpus-split] refusing --execute: source collection must differ from USER/SEED targets",
    );
    process.exitCode = 1;
    return;
  }

  const sourceCol = openCollection(endpoint, token, src);
  const userCol = openCollection(endpoint, token, userTarget);
  const seedCol = openCollection(endpoint, token, seedTarget);

  if (withEs) {
    await ensureEsIndexes([esUser, esSeed]);
  }

  const result = await copyBatch(sourceCol, userCol, seedCol, withEs);
  console.log(
    `[migrate-corpus-split] execute complete: copiedUser=${result.copiedUser} copiedSeed=${result.copiedSeed} skipped=${result.skipped} esSkippedInvalid=${result.esSkippedInvalid}`,
  );
  console.log(
    "[migrate-corpus-split] next: point app env at USER/SEED; keep legacy read-only until ISSUE-001 regression green (03-03b)",
  );
}

main().catch((err) => {
  console.error("[migrate-corpus-split] failed:", err);
  process.exitCode = 1;
});
