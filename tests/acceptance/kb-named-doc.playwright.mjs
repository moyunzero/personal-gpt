import { randomBytes } from "node:crypto";
import { chromium } from "playwright";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: new URL("../../.env", import.meta.url) });

// Next dev rejects the HMR socket for 127.0.0.1 (raw "Unauthorized"), so the
// client never hydrates. localhost is the origin the dev server accepts.
const base = "http://localhost:3000";

async function withSession(run) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const doc = await client.query(
    `SELECT workspace_id FROM documents WHERE title = 'sample-pdf-1mb' AND status = 'ready' ORDER BY updated_at DESC LIMIT 1`,
  );
  const workspaceId = doc.rows[0]?.workspace_id;
  if (!workspaceId) throw new Error("sample-pdf-1mb is not ready");
  const member = await client.query(
    `SELECT user_id FROM workspace_members m
     WHERE workspace_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM workspace_members older
         WHERE older.user_id = m.user_id AND older.created_at < m.created_at
       )
     LIMIT 1`,
    [workspaceId],
  );
  const userId = member.rows[0]?.user_id;
  if (!userId) throw new Error("no workspace member");
  const token = randomBytes(24).toString("hex");
  const expires = String(Date.now() + 30 * 60 * 1000);
  await client.query(
    `INSERT INTO sessions (id, "sessionToken", "userId", expires) VALUES (gen_random_uuid(), $1, $2, $3)`,
    [token, userId, expires],
  );
  try {
    await run(token);
  } finally {
    await client.query(`DELETE FROM sessions WHERE "sessionToken" = $1`, [token]);
    await client.end();
  }
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  const extra = detail ? ` ${String(detail).replace(/\s+/g, " ").slice(0, 220)}` : "";
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra}`);
}

const grounded = /Lorem|ipsum|拉丁|占位|样例|示例/;
const denied = /没有关于|没有这个文件|不包含/;

await withSession(async (token) => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies([{ name: "authjs.session-token", value: token, url: base }]);
  const page = await context.newPage();
  page.on("pageerror", (err) => console.log("PAGEERROR", err.message.slice(0, 240)));

  try {
    await page.goto(`${base}/kb`, { waitUntil: "domcontentloaded" });
    const listed = await page.evaluate(async () => {
      const res = await fetch("/api/kb/documents");
      const data = await res.json();
      const row = (data.items ?? []).find((item) => String(item.title).includes("sample-pdf-1mb"));
      return { count: (data.items ?? []).length, status: row?.status ?? "" };
    });
    check(
      "kb api sample-pdf-1mb ready",
      listed.count > 0 && listed.status === "ready",
      listed.status || "missing",
    );
    await page.locator(".kb-loading").waitFor({ state: "hidden", timeout: 20000 });
    const titleVisible = await page
      .getByRole("button", { name: "sample-pdf-1mb" })
      .waitFor({ timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    check("kb page shows the file", titleVisible);

    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.locator(".model-chip").waitFor({ timeout: 20000 });
    const hint = page.locator(".composer-corpus-hint");
    const box = page.locator(".corpus-toggle-input");
    const input = page.locator(".composer-input");
    const send = page.locator(".composer-send");

    check(
      "seed switch label",
      (await page.locator(".corpus-toggle-label").innerText()).includes("只查种子库"),
    );
    await box.check();
    await hint.filter({ hasText: "种子库检索" }).waitFor({ timeout: 5000 });
    check(
      "seed-only hint",
      (await hint.innerText()).includes("种子库检索"),
      await hint.innerText(),
    );
    await box.uncheck();
    await hint.filter({ hasText: "用户库检索" }).waitFor({ timeout: 5000 });

    async function ask(text) {
      const before = await page.locator(".message-assistant .message-body").count();
      await input.click();
      await input.fill(text);
      await send.click();
      await page.waitForFunction(
        (index) => {
          const loading = document.querySelector(".loading-dots");
          const nodes = [...document.querySelectorAll(".message-assistant .message-body")].filter(
            (node) => !node.querySelector(".loading-dots"),
          );
          const body = nodes[index]?.textContent ?? "";
          return !loading && body.trim().length > 12;
        },
        before,
        { timeout: 120000 },
      );
      return (
        await page.locator(".message-assistant .message-body").nth(before).innerText()
      ).replace(/\s+/g, " ");
    }

    const about = await ask("sample-pdf-1mb文件讲的什么");
    check(
      "named file answer uses the document",
      !denied.test(about) && grounded.test(about),
      about,
    );

    const pageAnswer = await ask("sample-pdf-1mb 第 1 页讲什么");
    check(
      "page question stays on the file",
      !denied.test(pageAnswer) && (grounded.test(pageAnswer) || /第\s*1\s*页/.test(pageAnswer)),
      pageAnswer,
    );
  } catch (err) {
    await page
      .screenshot({ path: "/tmp/kb-named-doc-failure.png", fullPage: true })
      .catch(() => {});
    const text = await page
      .locator("body")
      .innerText()
      .catch(() => "");
    console.log("page-text", text.replace(/\s+/g, " ").slice(0, 500));
    throw err;
  } finally {
    await browser.close();
  }
});

const failed = results.filter((item) => !item.ok);
if (failed.length) process.exit(1);
