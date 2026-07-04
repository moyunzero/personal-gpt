/**
 * Phase 1 功能验收 — Playwright 截图脚本
 * 用法：yarn acceptance:phase-1（需 dev:web + dev:worker + docker 已启动）
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "screenshots");
const FIXTURE = path.join(__dirname, "fixtures/mocode-acceptance.md");
const CORRUPT_PDF = path.join(__dirname, "../../regression/phase-1/fixtures/corrupt.pdf");
const BASE = process.env.ACCEPTANCE_BASE_URL ?? "http://localhost:3000";

const results = [];

function log(step, status, detail = "") {
  const line = { step, status, detail, at: new Date().toISOString() };
  results.push(line);
  const icon = status === "PASS" ? "✅" : status === "FAIL" ? "❌" : "⏳";
  console.log(`${icon} [${step}] ${status}${detail ? ` — ${detail}` : ""}`);
}

async function shot(page, name) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  log(name, "SHOT", file);
  return file;
}

async function waitForServer(page) {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 5000 });
      if (res?.ok()) return;
    } catch {
      await page.waitForTimeout(2000);
    }
  }
  throw new Error(`无法连接 ${BASE}，请先 yarn dev:web`);
}

async function sendChat(page, text) {
  const input = page.locator(".composer-input");
  await input.fill(text);
  await page.locator(".composer-send").click();
}

async function waitAssistantReply(page, timeoutMs = 120_000) {
  const dots = page.locator(".loading-dots");
  if (await dots.count()) {
    await dots.waitFor({ state: "detached", timeout: timeoutMs }).catch(() => {});
  }
  await page
    .locator(".message-assistant .message-body")
    .filter({ hasNot: page.locator(".loading-dots") })
    .first()
    .waitFor({ timeout: timeoutMs });
  await page.waitForTimeout(1500);
}

async function run() {
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  try {
    // ── 01 聊天首页 ──
    await waitForServer(page);
    await shot(page, "01-chat-home");
    log("01-chat-home", "PASS", "首页加载正常");

    // ── 02 问候语（无 citation）──
    await sendChat(page, "你好");
    await waitAssistantReply(page);
    const citationAfterGreeting = await page.locator(".citation-cards").count();
    await shot(page, "02-chat-greeting-no-citation");
    if (citationAfterGreeting === 0) {
      log("02-chat-greeting", "PASS", "无引用来源卡片");
    } else {
      log("02-chat-greeting", "FAIL", `意外出现 ${citationAfterGreeting} 个引用区`);
    }

    // ── 03 知识库页面 ──
    await page.goto(`${BASE}/kb`, { waitUntil: "networkidle" });
    await page.locator(".kb-page-title").waitFor();
    await page
      .locator(".kb-loading")
      .waitFor({ state: "detached", timeout: 15_000 })
      .catch(() => {});
    await shot(page, "03-kb-page");
    log("03-kb-page", "PASS", "知识库页加载");

    // ── 04 上传 Markdown ──
    await page.locator(".kb-file-input").setInputFiles(FIXTURE);
    await page.locator(".kb-doc-row, .kb-empty-list").first().waitFor({ timeout: 30_000 });
    const rowVisible = (await page.locator(".kb-doc-row").count()) > 0;
    await shot(page, "04-kb-upload-started");
    if (rowVisible) {
      log("04-kb-upload", "PASS", "文件已上传并出现在列表");
    } else {
      log("04-kb-upload", "FAIL", "上传后列表无文档行");
    }

    // ── 05 等待导入完成 ──
    const readyBadge = page.locator(".kb-status-ready").first();
    try {
      await readyBadge.waitFor({ timeout: 180_000 });
      await shot(page, "05-kb-ingest-ready");
      log("05-kb-ingest", "PASS", "文档状态=就绪");
    } catch {
      await shot(page, "05-kb-ingest-timeout");
      log("05-kb-ingest", "FAIL", "180s 内未变为就绪（检查 dev:worker）");
    }

    // ── 06 知识类问题 + citation ──
    await page.goto(BASE, { waitUntil: "networkidle" });
    await sendChat(page, "介绍一下 MoCode");
    await waitAssistantReply(page, 180_000);
    await page
      .locator(".citation-card")
      .first()
      .waitFor({ timeout: 30_000 })
      .catch(() => {});
    const citationCount = await page.locator(".citation-card").count();
    await shot(page, "06-chat-with-citations");
    if (citationCount >= 1) {
      log("06-chat-citation", "PASS", `${citationCount} 条引用`);
    } else {
      log("06-chat-citation", "FAIL", "未展示引用卡片（Astra/VPN/模型需检查）");
    }

    // ── 07 删除文档 ──
    await page.goto(`${BASE}/kb`, { waitUntil: "networkidle" });
    await page
      .locator(".kb-loading")
      .waitFor({ state: "detached", timeout: 15_000 })
      .catch(() => {});
    const rowCountBefore = await page.locator(".kb-doc-row").count();
    if (rowCountBefore === 0) {
      await shot(page, "07-kb-delete-skip");
      log("07-kb-delete", "SKIP", "列表无文档可删");
    } else {
      const docTitle = await page.locator(".kb-doc-title").first().textContent();
      await page.getByRole("button", { name: "删除" }).first().click();
      await page.getByRole("button", { name: "确认删除" }).click();
      await page.waitForTimeout(2000);
      await shot(page, "07-kb-after-delete");
      const rowCount = await page.locator(".kb-doc-row").count();
      if (rowCount < rowCountBefore) {
        log("07-kb-delete", "PASS", `已删除「${docTitle?.trim()}」`);
      } else {
        log("07-kb-delete", "FAIL", "删除后文档仍在列表");
      }
    }

    // ── 08 损坏 PDF 导入失败 ──
    const fileInput = page.locator(".kb-file-input");
    if (fs.existsSync(CORRUPT_PDF)) {
      await fileInput.setInputFiles(CORRUPT_PDF);
      await page.locator(".kb-status-failed, .kb-doc-error").first().waitFor({ timeout: 180_000 });
      await shot(page, "08-kb-corrupt-pdf-failed");
      log("08-corrupt-pdf", "PASS", "损坏 PDF 显示失败状态");
      // 清理：删除失败文档
      const delBtn = page.getByRole("button", { name: "删除" }).first();
      if (await delBtn.isVisible()) {
        await delBtn.click();
        await page.getByRole("button", { name: "确认删除" }).click();
      }
    } else {
      log("08-corrupt-pdf", "SKIP", "fixture 不存在");
    }

    const reportPath = path.join(__dirname, "RESULT.json");
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.log(`\n报告已写入 ${reportPath}`);
    console.log(`截图目录 ${OUT}`);

    const failed = results.filter((r) => r.status === "FAIL").length;
    process.exit(failed > 0 ? 1 : 0);
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
