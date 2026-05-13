import "dotenv/config";
import { DataAPIClient } from "@datastax/astra-db-ts";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { CheerioWebBaseLoader } from "@langchain/community/document_loaders/web/cheerio";
import { PlaywrightWebBaseLoader } from "@langchain/community/document_loaders/web/playwright";

const { 
    ASTRA_DB_NAMESPACE,
    ASTRA_DB_COLLECTION,
    ASTRA_DB_API_ENDPOINT,
    ASTRA_DB_APPLICATION_TOKEN,
    OPENROUTER_API_KEY
} = process.env;

if (!ASTRA_DB_API_ENDPOINT || !ASTRA_DB_APPLICATION_TOKEN) {
  throw new Error('Missing required environment variables: ASTRA_DB_API_ENDPOINT and ASTRA_DB_APPLICATION_TOKEN');
}

// 直接调用 OpenRouter 的嵌入 API
// 使用 NVIDIA 嵌入模型
const getEmbedding = async (text: string, retries = 3): Promise<number[]> => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时

      const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "nvidia/llama-nemotron-embed-vl-1b-v2:free",
          input: text,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenRouter API 错误: ${response.status} - ${error}`);
      }

      const data = await response.json();
      return data.data[0].embedding;
    } catch (error) {
      const isLastAttempt = attempt === retries;
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      if (isLastAttempt) {
        throw new Error(`生成 embedding 失败 (已重试 ${retries} 次): ${errorMsg}`);
      }
      
      // 指数退避：第一次等2秒，第二次等4秒
      const delay = 2000 * attempt;
      console.log(`\n  ⚠ Embedding 生成失败 (尝试 ${attempt}/${retries}): ${errorMsg}`);
      console.log(`  ⏳ ${delay / 1000}秒后重试...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error('生成 embedding 失败');
};

const completionData: (string | { url: string; useBrowser: boolean })[] = [
    // 测试自动检测：先用 Cheerio，内容不足时自动切换到 Playwright
    "https://zh.wikipedia.org/wiki/%E5%BF%83%E7%90%86%E5%AD%A6",
    "https://github.com/moyunzero/personalWeb",
    "https://www.bilibili.com/?spm_id_from=333.1365.0.0",
];

const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN);
const db = client.db(ASTRA_DB_API_ENDPOINT, {
  token: ASTRA_DB_APPLICATION_TOKEN,
});

const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 512,
    chunkOverlap: 100,
});

// 速率限制：避免请求过快
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const createCollection = async (similarityMetric: "dot_product" | "cosine" | "euclidean" = "dot_product", retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`尝试创建集合... (${i + 1}/${retries})`);
      const res = await db.createCollection(ASTRA_DB_COLLECTION!, {
        vector: {
          // nvidia/llama-nemotron-embed-vl-1b-v2 默认维度为 2048
          dimension: 2048,
          metric: similarityMetric,
        },
      });
      console.log("集合创建成功:", res);
      return res;
    } catch (error) {
      if (i === retries - 1) throw error;
      console.log(`创建失败，${2}秒后重试...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
};

const scrapePageSmart = async (
  url: string,
  options?: {
    selector?: string;
    retries?: number;
    retryDelay?: number;
    debug?: boolean;
    useBrowser?: boolean;
    minContentLength?: number;
  }
): Promise<string> => {
  const { 
    selector = "p, h1, h2, h3, h4, h5, h6, li, article",
    retries = 3,
    retryDelay = 2000,
    debug = false,
    useBrowser,
    minContentLength = 200
  } = options || {};

  // 如果没有明确指定，先尝试 Cheerio（快速）
  const shouldTryCheerioFirst = useBrowser === undefined;
  let forceBrowser = useBrowser === true;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      let docs: unknown[] = [];
      
      // 策略:先尝试 Cheerio，如果内容不足则自动切换到 Playwright
      if (!forceBrowser && shouldTryCheerioFirst) {
        try {
          console.log(`  ⚡ 尝试 Cheerio 静态模式抓取...`);
          const loader = new CheerioWebBaseLoader(url, {
            // @ts-expect-error - CheerioWebBaseLoader selector type is overly restrictive
            selector,
          });
          
          docs = await loader.load();
          
          interface Doc {
            pageContent: string;
          }
          
          const content = (docs as Doc[])
            .map((doc) => doc.pageContent)
            .join("\n")
            .replace(/\n\s*\n/g, "\n")
            .replace(/\s+/g, " ")
            .trim();
          
          // 如果内容太少，说明可能需要 JavaScript 渲染
          if (content.length < minContentLength) {
            console.log(`  ⚠ Cheerio 提取内容不足 (${content.length} 字符)，切换到 Playwright...`);
            forceBrowser = true;
            throw new Error('Content too short, switching to browser mode');
          }
          
          console.log(`  ✓ Cheerio 成功提取内容`);
        } catch (error) {
          if (!forceBrowser) {
            throw error;
          }
          // 如果已经决定使用浏览器，继续下面的逻辑
        }
      }
      
      if (forceBrowser || useBrowser === true) {
        // 使用 Playwright 抓取动态网站
        console.log(`  🌐 使用 Playwright 浏览器模式抓取...`);
        const loader = new PlaywrightWebBaseLoader(url, {
          launchOptions: {
            headless: true,
          },
          gotoOptions: {
            waitUntil: "networkidle",
            timeout: 30000,
          },
          evaluate: async (page) => {
            // 等待页面加载完成
            await page.waitForTimeout(2000);
            
            // 提取文本内容
            const content = await page.evaluate(() => {
              // 移除脚本和样式标签
              const scripts = document.querySelectorAll('script, style, nav, footer, header');
              scripts.forEach(el => el.remove());
              
              // 获取主要内容
              const selectors = ['article', '.article', '.content', '.post', 'main', 'body'];
              for (const sel of selectors) {
                const element = document.querySelector(sel);
                if (element && element.textContent && element.textContent.trim().length > 100) {
                  return element.textContent;
                }
              }
              
              // 如果没有找到主要内容区域，返回 body
              return document.body.textContent || '';
            });
            
            return content;
          },
        });
        
        docs = await loader.load();
      }
      
      if (debug && docs.length > 0) {
        interface Doc {
          pageContent: string;
        }
        const firstDoc = docs[0] as Doc;
        console.log(`  [调试] 加载了 ${docs.length} 个文档`);
        console.log(`  [调试] 第一个文档内容长度: ${firstDoc.pageContent.length}`);
        console.log(`  [调试] 前 200 字符: ${firstDoc.pageContent.substring(0, 200)}`);
      }
      
      // 清理内容：去除多余空白、空行
      interface Doc {
        pageContent: string;
      }
      const content = (docs as Doc[])
        .map((doc) => doc.pageContent)
        .join("\n")
        .replace(/\n\s*\n/g, "\n") // 移除多余空行
        .replace(/\s+/g, " ") // 合并多余空格
        .trim();

      if (!content || content.length < 50) {
        throw new Error(`未能从 ${url} 提取到足够的内容 (长度: ${content.length})`);
      }

      return content;
    } catch (error) {
      const isLastAttempt = attempt === retries;
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      // 如果是因为内容太少而切换到浏览器模式，不算作失败
      if (errorMsg.includes('switching to browser mode')) {
        continue;
      }
      
      if (isLastAttempt) {
        console.error(`  ✖ 抓取失败 (已重试 ${retries} 次): ${errorMsg}`);
        throw new Error(`无法抓取页面 ${url}: ${errorMsg}`);
      }
      
      console.log(`  ⚠ 抓取失败 (尝试 ${attempt}/${retries}): ${errorMsg}`);
      console.log(`  ⏳ ${retryDelay / 1000}秒后重试...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  
  throw new Error(`无法抓取页面 ${url}`);
};

const loadSampleData = async () => {
  const collection = db.collection(ASTRA_DB_COLLECTION!);
  const total = completionData.length;

  for (let i = 0; i < completionData.length; i++) {
    const item = completionData[i];
    
    // 支持两种格式：字符串 或 { url, useBrowser }
    const url = typeof item === 'string' ? item : item.url;
    const useBrowser = typeof item === 'string' ? undefined : item.useBrowser;
    
    console.log(`\n[${i + 1}/${total}] 正在抓取页面: ${url}`);
    if (useBrowser !== undefined) {
      console.log(`  模式: ${useBrowser ? 'Playwright (强制浏览器)' : 'Cheerio (强制静态)'}`);
    } else {
      console.log(`  模式: 自动检测 (先尝试 Cheerio，必要时切换到 Playwright)`);
    }

    const scrapeStart = Date.now();
    const content = await scrapePageSmart(url, { useBrowser });
    console.log(`  ✔ 抓取完成 (${((Date.now() - scrapeStart) / 1000).toFixed(1)}s), 内容长度: ${content.length} 字符`);

    const chunks = await splitter.splitText(content);
    console.log(`  ✔ 分块完成, 共 ${chunks.length} 个块，开始生成向量并写入...`);

    let inserted = 0;
    const embedStart = Date.now();
    for (const chunk of chunks) {
      // 添加小延迟，避免请求过快（免费 API 可能有速率限制）
      if (inserted > 0) {
        await sleep(100); // 每个请求间隔 100ms
      }
      
      // 使用 OpenRouter 的 NVIDIA 嵌入模型生成向量
      const embedding = await getEmbedding(chunk);

      // 插入到 AstraDB
      await collection.insertOne({
        $vector: embedding,
        content: chunk,  // 改为 content，与 API 保持一致
        source: url,
      });

      inserted++;
      // 每块都刷新进度条
      const pct = Math.round((inserted / chunks.length) * 100);
      const filled = Math.floor(pct / 5);
      const bar = "█".repeat(filled) + "░".repeat(20 - filled);
      const elapsed = ((Date.now() - embedStart) / 1000).toFixed(0);
      process.stdout.write(`\r  [${bar}] ${pct}% (${inserted}/${chunks.length} 块, 已用 ${elapsed}s)`);
    }
    console.log(`\n  ✔ 全部插入完成 (${((Date.now() - embedStart) / 1000).toFixed(1)}s)`);
  }

  console.log("\n所有数据加载完成！");
};

// 主函数
(async () => {
  try {
    console.log("开始数据加载流程...");
    console.log("API Endpoint:", ASTRA_DB_API_ENDPOINT);
    console.log("Namespace:", ASTRA_DB_NAMESPACE);
    console.log("Collection:", ASTRA_DB_COLLECTION);
    console.log("Token configured:", Boolean(ASTRA_DB_APPLICATION_TOKEN));
    
    // 先尝试获取数据库管理员实例，列出所有 keyspaces
    console.log("\n正在获取可用的 keyspaces...");
    try {
      const dbAdmin = db.admin();
      const keyspaces = await dbAdmin.listKeyspaces();
      console.log("可用的 keyspaces:", keyspaces);
      
      if (!keyspaces.includes(ASTRA_DB_NAMESPACE!)) {
        console.log(`\n⚠️  警告: Keyspace '${ASTRA_DB_NAMESPACE}' 不存在！`);
        console.log("请使用以下 keyspace 之一:", keyspaces);
        process.exit(1);
      }
    } catch {
      console.log("无法获取 keyspaces 列表，尝试直接连接...");
    }
    
    // 1. 检查集合是否存在
    console.log("\n正在连接到 AstraDB...");
    const collections = await db.listCollections();
    console.log("连接成功！现有集合:", collections.map(c => c.name));
    
    const collectionExists = collections.some(
      (col) => col.name === ASTRA_DB_COLLECTION
    );
    
    if (!collectionExists) {
      console.log(`\n集合 ${ASTRA_DB_COLLECTION} 不存在，正在创建...`);
      await createCollection();
      console.log("集合创建成功！");
    } else {
      console.log(`\n集合 ${ASTRA_DB_COLLECTION} 已存在`);
    }
    
    // 2. 加载数据
    await loadSampleData();
    
    console.log("\n✅ 所有操作完成！");
  } catch (error) {
    console.error("\n❌ 错误:", error);
    
    if (error instanceof Error && error.message.includes("403")) {
      console.error("\n可能的原因:");
      console.error("1. Token 已过期或无效");
      console.error("2. Token 没有访问该数据库的权限");
      console.error("3. Namespace 名称不正确");
      console.error("4. 网络问题（VPN、防火墙、CloudFront 阻止）");
      console.error("\n请检查:");
      console.error("- 登录 https://astra.datastax.com");
      console.error("- 确认数据库是否处于 Active 状态");
      console.error("- 重新生成 Application Token");
      console.error("- 确认 Namespace 名称（可能是 'default_keyspace' 或其他）");
      console.error("- 检查网络连接（关闭 VPN 或代理）");
    }
    
    process.exit(1);
  }
})();