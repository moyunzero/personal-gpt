#!/usr/bin/env node
/**
 * 开通 Neo4j Aura Free 并写出连接信息（密码只显示一次）。
 *
 * 前置（无法完全无人值守）：
 * 1. https://console.neo4j.io 注册 / 登录
 * 2. Account → API Credentials → Create → 得到 CLIENT_ID / CLIENT_SECRET
 * 3. export AURA_CLIENT_ID=... AURA_CLIENT_SECRET=...
 *
 * 用法：
 *   node scripts/provision-aura-free.mjs
 *   node scripts/provision-aura-free.mjs --name personal-gpt-graph
 *
 * 成功后把打印的 NEO4J_* 注入 Vercel + CloudBase（ingest/agent），并设 ENABLE_GRAPH_RAG=true。
 */
const CLIENT_ID = process.env.AURA_CLIENT_ID?.trim();
const CLIENT_SECRET = process.env.AURA_CLIENT_SECRET?.trim();
const NAME = process.argv.includes("--name")
  ? process.argv[process.argv.indexOf("--name") + 1]
  : "personal-gpt-graph";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(`缺少 AURA_CLIENT_ID / AURA_CLIENT_SECRET。

当前环境没有 Neo4j MCP；Aura Free 必须先在控制台创建一对 API Credential：
  https://console.neo4j.io → Account → API Credentials → Create

然后：
  export AURA_CLIENT_ID=...
  export AURA_CLIENT_SECRET=...
  node scripts/provision-aura-free.mjs
`);
  process.exit(1);
}

async function getToken() {
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const res = await fetch("https://api.neo4j.io/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`oauth failed: ${res.status} ${JSON.stringify(json)}`);
  }
  return json.access_token;
}

async function main() {
  const token = await getToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const tenantsRes = await fetch("https://api.neo4j.io/v1/tenants", { headers });
  const tenantsJson = await tenantsRes.json();
  if (!tenantsRes.ok) {
    throw new Error(`tenants failed: ${tenantsRes.status} ${JSON.stringify(tenantsJson)}`);
  }
  const tenantId = tenantsJson.data?.[0]?.id;
  if (!tenantId) {
    throw new Error("No Aura tenant found. Finish Aura console signup first.");
  }

  // Free tier: fixed 1GB; API still requires memory field
  const createRes = await fetch("https://api.neo4j.io/v1/instances", {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: NAME,
      type: "free-db",
      cloud_provider: "gcp",
      region: "europe-west1",
      memory: "1GB",
      tenant_id: tenantId,
      version: "5",
    }),
  });
  const created = await createRes.json();
  if (!createRes.ok) {
    throw new Error(`create failed: ${createRes.status} ${JSON.stringify(created)}`);
  }

  const data = created.data;
  const id = data.id;
  const password = data.password;
  const user = data.username || "neo4j";
  const uri = data.connection_url || `neo4j+s://${id}.databases.neo4j.io`;

  console.log("Created Aura Free instance (password shown ONCE):");
  console.log(`  id: ${id}`);
  console.log(`  username: ${user}`);
  console.log("Waiting until status=running ...");

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 10_000));
    const getRes = await fetch(`https://api.neo4j.io/v1/instances/${id}`, { headers });
    const getJson = await getRes.json();
    const status = getJson.data?.status;
    console.log(`  [${(i + 1) * 10}s] ${status}`);
    if (status === "running") break;
    if (status === "destroying") throw new Error("instance destroying");
  }

  console.log("\n# Paste into Vercel + CloudBase (ingest-worker, agent-service):\n");
  console.log(`NEO4J_URI=${uri}`);
  console.log(`NEO4J_USER=${user}`);
  console.log(`NEO4J_PASSWORD=${password}`);
  console.log("ENABLE_GRAPH_RAG=true");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
