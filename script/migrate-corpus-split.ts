/**
 * Corpus split migration CLI (Wave 0 dry-run only).
 *
 * Usage:
 *   npx tsx script/migrate-corpus-split.ts --dry-run
 *   npx tsx script/migrate-corpus-split.ts          # dry-run by default
 *   npx tsx script/migrate-corpus-split.ts --execute  # refused until plan 03-02
 *
 * Real copy lands in plan 03-02. Wave 0 never writes Astra collections.
 */
import "dotenv/config";

function hasFlag(argv: string[], flag: string): boolean {
  return argv.includes(flag);
}

function main(argv: string[] = process.argv.slice(2)): void {
  const source = process.env.ASTRA_DB_COLLECTION ?? "(unset ASTRA_DB_COLLECTION)";
  const base =
    process.env.ASTRA_DB_COLLECTION && process.env.ASTRA_DB_COLLECTION.length > 0
      ? process.env.ASTRA_DB_COLLECTION
      : "db_emotion";
  const userTarget = process.env.ASTRA_DB_COLLECTION_USER ?? `${base}_user`;
  const seedTarget = process.env.ASTRA_DB_COLLECTION_SEED ?? `${base}_seed`;

  const wantsExecute = hasFlag(argv, "--execute");
  const dryRun = !wantsExecute;

  console.log("[migrate-corpus-split] planned migration");
  console.log(`  source:      ${source}`);
  console.log(`  user target: ${userTarget}`);
  console.log(`  seed target: ${seedTarget}`);
  console.log(
    `  mode:        ${dryRun ? "dry-run (no Astra writes)" : "execute"}`,
  );

  // T-03-00-01: Wave 0 refuses destructive writes; --execute lands in 03-02
  if (wantsExecute) {
    console.error(
      "[migrate-corpus-split] refusing --execute in Wave 0; real copy lands in plan 03-02",
    );
    process.exitCode = 1;
    return;
  }

  if (hasFlag(argv, "--dry-run") || argv.length === 0 || dryRun) {
    console.log(
      "[migrate-corpus-split] dry-run complete — no collections mutated",
    );
  }
}

main();
