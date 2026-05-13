import "dotenv/config";
import { DataAPIClient } from "@datastax/astra-db-ts";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

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

// ====================== 类型定义 ======================
interface PromptSuggestionMetadata {
  source: string;
  type: string;
  relatedQuestions: string[];
  lastUpdated: string;
}

interface PromptSuggestionDoc {
  fileName: string;
  title: string;
  content: string;
  metadata: PromptSuggestionMetadata;
  category: string;
  keywords: string[];
  fileHash: string;
}

interface VectorDocument {
  $vector: number[];
  content: string;
  source: string;
  category: string;
  title: string;
  fileName: string;
  chunkIndex: number;
  totalChunks: number;
  keywords: string[];
  relatedQuestions: string[];
  lastUpdated: string;
  author: string;
  fileHash: string;
  docId: string;
}

// ====================== 配置 ======================
const SUGGESTIONS_DIR = path.join(__dirname, '../data/prompt-suggestions');
const PROGRESS_FILE = path.join(__dirname, '../data/.suggestions-progress.json');

// 文件分类映射
const CATEGORY_MAPPING: Record<string, string> = {
  '个人简介.md': 'personal',
  '心晴MO.md': 'project-xinqing',
  '欠费修仙中.md': 'project-xiuxian',
};

// 相关问题映射
const QUESTION_MAPPING: Record<string, string[]> = {
  '个人简介.md': [
    '介绍一下你自己',
    '你是谁',
    '你的背景是什么',
    '你做过什么项目',
    '你的兴趣爱好是什么',
    '如何联系你',
  ],
  '心晴MO.md': [
    '介绍一下心晴MO',
    '心晴MO是什么',
    '心晴MO有什么功能',
    '如何下载心晴MO',
    '心晴MO的核心理念是什么',
    '心晴MO支持哪些平台',
  ],
  '欠费修仙中.md': [
    '修仙欠费中是什么',
    '介绍一下修仙欠费中',
    '修仙欠费中怎么玩',
    '修仙欠费中的核心玩法',
    '如何玩修仙欠费中',
    '修仙欠费中的游戏机制',
  ],
};

// ====================== 工具函数 ======================

// 计算文件哈希（用于检测文件变化）
function calculateFileHash(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex');
}

// 从 Markdown 底部提取元数据
function extractMetadata(content: string): PromptSuggestionMetadata | null {
  const metadataRegex = /\*\*来源\*\*[：:]\s*(.+?)\s*\|\s*类型[：:]\s*(.+?)\s*\|\s*原始问题示例[：:]\s*(.+?)\s*\|\s*更新时间[：:]\s*(.+?)$/m;
  const match = content.match(metadataRegex);
  
  if (match) {
    const relatedQuestionsStr = match[3].trim();
    const relatedQuestions = relatedQuestionsStr.split(/[、,，]/).map(q => q.trim()).filter(Boolean);
    
    return {
      source: match[1].trim(),
      type: match[2].trim(),
      relatedQuestions,
      lastUpdated: match[4].trim(),
    };
  }
  
  return null;
}

// 从 Markdown 提取标题
function extractTitle(content: string): string {
  const titleMatch = content.match(/^#\s+(.+)$/m);
  return titleMatch ? titleMatch[1].trim() : '未命名文档';
}

// 智能提取关键词
function extractKeywords(content: string, fileName: string): string[] {
  const keywords: Set<string> = new Set();
  
  // 从文件名提取
  const fileBaseName = path.basename(fileName, '.md');
  keywords.add(fileBaseName);
  
  // 从标题提取（## 和 ### 级别）
  const headingRegex = /^#{2,3}\s+(.+)$/gm;
  let match;
  while ((match = headingRegex.exec(content)) !== null) {
    const heading = match[1].trim();
    // 过滤掉太长的标题和特殊字符
    if (heading.length <= 20 && !/[（）()【】\[\]]/.test(heading)) {
      keywords.add(heading);
    }
  }
  
  // 从加粗文本提取关键词
  const boldRegex = /\*\*(.+?)\*\*/g;
  while ((match = boldRegex.exec(content)) !== null) {
    const boldText = match[1].trim();
    if (boldText.length <= 15 && boldText.length >= 2) {
      keywords.add(boldText);
    }
  }
  
  return Array.from(keywords).slice(0, 10); // 限制最多10个关键词
}

// 读取进度
function loadProgress(): { processedFiles: Record<string, string> } {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
      return {
        processedFiles: data.processedFiles || {},
      };
    }
  } catch (error) {
    console.log('无法读取进度文件，从头开始');
  }
  return { processedFiles: {} };
}

// 保存进度
function saveProgress(processedFiles: Record<string, string>) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
    processedFiles,
    timestamp: new Date().toISOString()
  }, null, 2));
}

// 批量生成向量嵌入
const getEmbeddingsBatch = async (texts: string[], retries = 3): Promise<number[][]> => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "nvidia/llama-nemotron-embed-vl-1b-v2:free",
          input: texts,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenRouter API 错误: ${response.status} - ${error}`);
      }

      const data = await response.json();
      return data.data.map((item: { embedding: number[] }) => item.embedding);
    } catch (error) {
      const isLastAttempt = attempt === retries;
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      if (isLastAttempt) {
        throw new Error(`批量生成 embedding 失败 (已重试 ${retries} 次): ${errorMsg}`);
      }
      
      const delay = 2000 * attempt;
      console.log(`\n  ⚠ Embedding 生成失败 (尝试 ${attempt}/${retries}): ${errorMsg}`);
      console.log(`  ⏳ ${delay / 1000}秒后重试...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error('批量生成 embedding 失败');
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ====================== 数据库操作 ======================
const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN);
const db = client.db(ASTRA_DB_API_ENDPOINT, {
  token: ASTRA_DB_APPLICATION_TOKEN,
});

const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 800,
    chunkOverlap: 150,
    separators: ["\n## ", "\n### ", "\n\n", "\n", " ", ""], // 优先按标题切分
});

type AstraCollection = ReturnType<typeof db.collection>;

// 删除旧文档
async function deleteOldDocuments(collection: AstraCollection, fileName: string) {
  try {
    console.log(`  🗑️  删除旧版本: ${fileName}`);
    
    // 使用 deleteMany 删除所有匹配的文档
    const result = await collection.deleteMany({
      fileName: fileName,
      source: 'prompt-suggestion'
    });
    
    console.log(`  ✔ 已删除 ${result.deletedCount || 0} 个旧文档块`);
  } catch (error) {
    console.error(`  ⚠ 删除旧文档失败:`, error);
    // 继续执行，不中断流程
  }
}

// ====================== 主处理函数 ======================
const loadPromptSuggestions = async () => {
  const collection = db.collection(ASTRA_DB_COLLECTION!);
  
  console.log(`\n正在扫描目录: ${SUGGESTIONS_DIR}`);
  
  // 读取所有 Markdown 文件
  const files = fs.readdirSync(SUGGESTIONS_DIR)
    .filter(file => file.endsWith('.md'))
    .sort();
  
  console.log(`✔ 找到 ${files.length} 个 Markdown 文件`);
  
  const progress = loadProgress();
  const documents: PromptSuggestionDoc[] = [];
  
  // 第一步：解析所有文件，检测变化
  console.log('\n📖 第一步：解析文件并检测变化...\n');
  
  for (const fileName of files) {
    const filePath = path.join(SUGGESTIONS_DIR, fileName);
    const content = fs.readFileSync(filePath, 'utf-8');
    const fileHash = calculateFileHash(content);
    
    // 检查文件是否有变化
    const previousHash = progress.processedFiles[fileName];
    if (previousHash === fileHash) {
      console.log(`⏭️  跳过未修改文件: ${fileName}`);
      continue;
    }
    
    if (previousHash) {
      console.log(`🔄 检测到文件更新: ${fileName}`);
      // 删除旧版本
      await deleteOldDocuments(collection, fileName);
    } else {
      console.log(`🆕 新文件: ${fileName}`);
    }
    
    const title = extractTitle(content);
    const metadata = extractMetadata(content);
    const category = CATEGORY_MAPPING[fileName] || 'other';
    const keywords = extractKeywords(content, fileName);
    const relatedQuestions = QUESTION_MAPPING[fileName] || [];
    
    documents.push({
      fileName,
      title,
      content,
      metadata: metadata || {
        source: '未知来源',
        type: 'prompt_suggestion',
        relatedQuestions,
        lastUpdated: new Date().toISOString().split('T')[0],
      },
      category,
      keywords,
      fileHash,
    });
    
    console.log(`  ✔ 标题: ${title}`);
    console.log(`  ✔ 分类: ${category}`);
    console.log(`  ✔ 关键词: ${keywords.slice(0, 5).join(', ')}${keywords.length > 5 ? '...' : ''}`);
    console.log(`  ✔ 相关问题: ${relatedQuestions.length} 个\n`);
  }
  
  if (documents.length === 0) {
    console.log('\n✅ 所有文件都是最新的，无需更新！');
    return;
  }
  
  console.log(`\n📝 需要处理 ${documents.length} 个文件\n`);
  
  // 第二步：切块和向量化
  console.log('✂️  第二步：文本切块...\n');
  
  let totalInserted = 0;
  const startTime = Date.now();
  
  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    console.log(`[${i + 1}/${documents.length}] 处理: ${doc.fileName}`);
    
    // 切块
    const chunks = await splitter.splitText(doc.content);
    console.log(`  ✔ 切分为 ${chunks.length} 个文本块`);
    
    // 批量生成向量
    console.log(`  🔄 生成向量嵌入...`);
    const embeddings = await getEmbeddingsBatch(chunks);
    console.log(`  ✔ 向量生成完成`);
    
    // 准备插入数据
    const docId = `prompt-${doc.category}-${Date.now()}`;
    const insertPromises: Promise<unknown>[] = [];
    
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const vectorDoc: VectorDocument = {
        $vector: embeddings[chunkIndex],
        content: chunks[chunkIndex],
        source: 'prompt-suggestion',
        category: doc.category,
        title: doc.title,
        fileName: doc.fileName,
        chunkIndex,
        totalChunks: chunks.length,
        keywords: doc.keywords,
        relatedQuestions: doc.metadata.relatedQuestions,
        lastUpdated: doc.metadata.lastUpdated,
        author: 'MoYun',
        fileHash: doc.fileHash,
        docId: `${docId}-chunk-${chunkIndex}`,
      };
      
      insertPromises.push(collection.insertOne(vectorDoc));
      
      // 每 5 个批量执行
      if (insertPromises.length >= 5 || chunkIndex === chunks.length - 1) {
        await Promise.all(insertPromises);
        totalInserted += insertPromises.length;
        insertPromises.length = 0;
        await sleep(100);
      }
    }
    
    // 更新进度
    progress.processedFiles[doc.fileName] = doc.fileHash;
    saveProgress(progress.processedFiles);
    
    console.log(`  ✅ 已插入 ${chunks.length} 个向量块\n`);
  }
  
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n🎉 所有数据加载完成！`);
  console.log(`   总计处理: ${documents.length} 个文件`);
  console.log(`   总计插入: ${totalInserted} 个向量块`);
  console.log(`   总用时: ${totalTime} 秒`);
};

// ====================== 主入口 ======================
(async () => {
  try {
    console.log("╔════════════════════════════════════════════════════════╗");
    console.log("║   预设问题答案导入工具 - Prompt Suggestions Loader   ║");
    console.log("╚════════════════════════════════════════════════════════╝");
    console.log("\n配置信息:");
    console.log("  API Endpoint:", ASTRA_DB_API_ENDPOINT);
    console.log("  Namespace:", ASTRA_DB_NAMESPACE);
    console.log("  Collection:", ASTRA_DB_COLLECTION);
    console.log("  ChunkSize: 800");
    console.log("  ChunkOverlap: 150");
    
    console.log("\n正在连接到 AstraDB...");
    const collections = await db.listCollections();
    console.log("✔ 连接成功！");
    
    const collectionExists = collections.some(
      (col) => col.name === ASTRA_DB_COLLECTION
    );
    
    if (!collectionExists) {
      throw new Error(`集合 ${ASTRA_DB_COLLECTION} 不存在，请先运行 yarn seed:psychology 创建集合`);
    }
    
    await loadPromptSuggestions();
    
    console.log("\n✅ 所有操作完成！");
    console.log("\n💡 提示：");
    console.log("  - 文件变化会自动检测，只更新修改过的文件");
    console.log("  - 进度保存在 data/.suggestions-progress.json");
    console.log("  - 可以随时重新运行此脚本进行增量更新");
  } catch (error) {
    console.error("\n❌ 错误:", error);
    process.exit(1);
  }
})();
