import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText, createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { DataAPIClient } from "@datastax/astra-db-ts";
import OpenAI from "openai";

const {
  ASTRA_DB_COLLECTION,
  ASTRA_DB_API_ENDPOINT,
  ASTRA_DB_APPLICATION_TOKEN,
  OPENROUTER_API_KEY,
} = process.env;

// ====================== 初始化（模块级单例） ======================
const openRouterClient = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: OPENROUTER_API_KEY,
});

const openrouter = createOpenRouter({ apiKey: OPENROUTER_API_KEY });

interface AstraCollection {
  find: (query: object, options: object) => { toArray: () => Promise<unknown[]> };
  insertOne: (doc: object) => Promise<unknown>;
}

interface AstraDb {
  collection: (name: string) => AstraCollection;
}

let db: AstraDb | null = null;

function getDb() {
  if (!db) {
    const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN!);
    db = client.db(ASTRA_DB_API_ENDPOINT!, {
      token: ASTRA_DB_APPLICATION_TOKEN!,
    });
  }
  return db;
}

// ====================== 智能判断是否需要向量搜索 ======================
function shouldUseVectorSearch(query: string): boolean {
  const lowerQuery = query.toLowerCase().trim();
  
  // 1. 太短的问题（可能是简单问答）
  if (query.length < 10) {
    return false;
  }
  
  // 2. 简单的数学计算
  if (/^[\d\s+\-*/()=？?]+$/.test(query)) {
    return false;
  }
  
  // 3. 常见的闲聊问候
  const casualPhrases = [
    '你好', 'hello', 'hi', '在吗', '在不在',
    '怎么样', '干嘛', '做什么', '心情',
    '天气', '吃了吗', '早上好', '晚上好',
  ];
  if (casualPhrases.some(phrase => lowerQuery.includes(phrase)) && query.length < 20) {
    return false;
  }
  
  // 4. 包含关键词，可能需要查询知识库
  const contextKeywords = [
    '项目', '作品', '经历', '工作', '技能',
    '介绍', '了解', '详细', '具体', '什么时候',
    '如何', '怎么做', '为什么', '原因',
  ];
  if (contextKeywords.some(keyword => lowerQuery.includes(keyword))) {
    return true;
  }
  
  // 5. 默认：中等长度的问题可能需要上下文
  return query.length > 30;
}

// ====================== 智能判断数据源类型 ======================
function detectQuerySource(query: string): 'prompt-suggestion' | 'psychology-qa' | 'all' {
  const lowerQuery = query.toLowerCase().trim();
  
  // 个人/项目相关问题 -> 优先查询 prompt-suggestion（优先级最高）
  const personalKeywords = [
    '你', '你的', '你是', '介绍', '自己', '背景',
    '心晴', 'xinqing', 'mo', '情绪记录', 'app',
    '修仙', '欠费', 'xiuxian', '游戏', '赛博朋克',
    '项目', '作品', '开发', '创作', '联系', 'moyun',
  ];
  
  // 强匹配：如果包含项目名称，直接返回 prompt-suggestion
  const projectNames = ['心晴', 'xinqing', '修仙', '欠费'];
  if (projectNames.some(name => lowerQuery.includes(name))) {
    return 'prompt-suggestion';
  }
  
  // 弱匹配：其他个人相关关键词
  if (personalKeywords.some(keyword => lowerQuery.includes(keyword))) {
    return 'prompt-suggestion';
  }
  
  // 心理学相关问题 -> 优先查询 psychology-qa
  const psychologyKeywords = [
    '心理', '焦虑', '抑郁', '压力',
    '咨询', '治疗', '心态', '困扰',
  ];
  
  if (psychologyKeywords.some(keyword => lowerQuery.includes(keyword))) {
    return 'psychology-qa';
  }
  
  // 默认查询所有数据源
  return 'all';
}

// ====================== 向量检索函数 ======================
async function getRelevantContext(query: string): Promise<string> {
  if (!ASTRA_DB_COLLECTION || !query) {
    console.log('[Vector Search] 跳过：缺少 collection 或 query');
    return "";
  }
  
  try {
    console.log('[Vector Search] 开始检索:', query);
    
    // 缩短超时时间到 5 秒（增加一点时间）
    const timeoutPromise = new Promise<string>((_, reject) => {
      setTimeout(() => reject(new Error("Vector search timeout")), 5000);
    });

    const searchPromise = (async () => {
      const collection = getDb().collection(ASTRA_DB_COLLECTION);

      console.log('[Vector Search] 生成 embedding...');
      const embeddings = await openRouterClient.embeddings.create({
        model: "nvidia/llama-nemotron-embed-vl-1b-v2:free",
        input: query,
        encoding_format: "float",
      });

      const vector = embeddings.data[0]?.embedding;
      if (!vector) {
        console.log('[Vector Search] embedding 生成失败');
        return "";
      }

      // 智能判断数据源
      const sourceType = detectQuerySource(query);
      console.log('[Vector Search] 检测到数据源类型:', sourceType);
      
      // 构建过滤条件 - 修复：使用正确的字段名
      let filter = {};
      if (sourceType !== 'all') {
        filter = { source: sourceType };
      }
      
      // 根据数据源调整返回数量
      const limit = sourceType === 'prompt-suggestion' ? 5 : 3;

      console.log('[Vector Search] 查询参数:', { filter, limit });

      const cursor = collection.find(
        filter,
        {
          sort: { $vector: vector },
          limit,
          includeSimilarity: true,
          projection: { 
            content: 1, 
            source: 1, 
            category: 1, 
            title: 1,
            keywords: 1,
            _id: 0 
          },
        }
      );

      const docs = await cursor.toArray();
      console.log('[Vector Search] 找到文档数量:', docs.length);

      interface DocResult {
        $similarity?: number;
        content: string;
        source?: string;
        category?: string;
        title?: string;
        keywords?: string[];
      }
      
      // 打印相似度信息
      (docs as DocResult[]).forEach((doc, i) => {
        console.log(`[Vector Search] 文档 ${i + 1}: 相似度=${doc.$similarity?.toFixed(3)}, 标题=${doc.title}, 来源=${doc.source}`);
      });
      
      // 根据数据源类型调整相似度阈值
      const similarityThreshold = sourceType === 'prompt-suggestion' ? 0.55 : 0.65;
      console.log('[Vector Search] 相似度阈值:', similarityThreshold);
      
      const relevantDocs = (docs as DocResult[]).filter((doc) => (doc.$similarity || 0) >= similarityThreshold);
      console.log('[Vector Search] 过滤后文档数量:', relevantDocs.length);

      // 拼接上下文，包含来源信息
      const context = relevantDocs.map((doc) => {
        const sourceLabel = doc.source === 'prompt-suggestion' ? '个人知识库' : '心理学知识库';
        const titleInfo = doc.title ? `【${doc.title}】` : '';
        return `[来源: ${sourceLabel}${titleInfo}]\n${doc.content}`;
      }).join("\n\n---\n\n");
      
      console.log('[Vector Search] 返回上下文长度:', context.length);
      return context;
    })();

    return await Promise.race([searchPromise, timeoutPromise]);
  } catch (error) {
    // 降级：返回空字符串，让 AI 使用自身知识回答
    console.error('[Vector Search] 错误:', error);
    return "";
  }
}

// ====================== 主处理函数 ======================
export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    
    if (!messages || messages.length === 0) {
      return new Response("No messages provided", { status: 400 });
    }

    // 转换 UIMessage 格式到标准格式
    interface MessagePart {
      type: string;
      text: string;
    }
    
    interface InputMessage {
      role: string;
      parts?: MessagePart[];
      content?: string;
    }
    
    const formattedMessages = messages.map((msg: InputMessage) => {
      let content = '';
      
      // 处理 UIMessage 格式（带 parts 数组）
      if (msg.parts && Array.isArray(msg.parts)) {
        content = msg.parts
          .filter((part: MessagePart) => part.type === 'text')
          .map((part: MessagePart) => part.text)
          .join('');
      } 
      // 处理标准格式（直接有 content）
      else if (msg.content) {
        content = msg.content;
      }
      
      return {
        role: msg.role,
        content: content.trim(),
      };
    });

    // 获取最后一条消息用于向量搜索
    const lastContent = formattedMessages[formattedMessages.length - 1]?.content || '';

    if (lastContent.length > 8000) {
      return new Response("Message too long", { status: 400 });
    }

    // 智能判断是否需要向量搜索
    const needsContext = shouldUseVectorSearch(lastContent);

    // 只在需要时获取增强上下文
    let docContext = "";
    if (needsContext) {
      docContext = await getRelevantContext(lastContent);
    }

    const systemPrompt = `你是一个专业、友好、乐于助人的 AI 助手。
你可以回答关于 MoYun（一位前端开发者）的个人信息、项目作品，以及心理咨询相关的问题。

请自然、清晰地回答用户问题。
如果提供了参考内容，请基于参考内容进行回答，用自己的语言自然地融入这些信息。
如果参考内容来自"个人知识库"，请以第一人称（"我"）回答。
如果参考内容来自"心理学知识库"，请以专业咨询师的角度回答。
如果没有相关参考内容，请使用自己的知识正常回答。

参考内容：
${docContext || "（无相关参考内容）"}`;

    // 创建 UI Message Stream（与 useChat 兼容）
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const messageId = `msg-${Date.now()}`;
        let hasStarted = false;

        // 定义模型列表（按优先级排序）
        // 流式行为已验证：把"真流式"模型放前面，"非流式"模型放后面作兜底
        const models = [
          "inclusionai/ring-2.6-1t:free",            // ✅ 真流式（TTFT 3.3s，持续吐字 ~3.5s）
          "openai/gpt-oss-120b:free",                // 🟡 未测，作为次选
          "nvidia/nemotron-3-super-120b-a12b:free",  // ❌ 不流式（一次性 dump），最后兜底
        ];

        let lastError: Error | null = null;

        // 尝试使用不同的模型
        for (const modelName of models) {
          try {
            // 使用 OpenRouter 流式输出
            const result = streamText({
              model: openrouter(modelName),
              system: systemPrompt,
              messages: formattedMessages,
              temperature: 0.7,
              maxRetries: 1, // 减少重试次数，快速切换到下一个模型
            });

            // 将 streamText 的输出转换为 UI Message Chunks
            for await (const part of result.fullStream) {
              if (part.type === 'text-delta') {
                // 第一次发送文本时，先发送 text-start
                if (!hasStarted) {
                  writer.write({
                    type: 'text-start',
                    id: messageId,
                  });
                  hasStarted = true;
                }

                // 发送文本增量
                writer.write({
                  type: 'text-delta',
                  delta: part.text,
                  id: messageId,
                });
              } else if (part.type === 'finish') {
                // 发送 text-end
                writer.write({
                  type: 'text-end',
                  id: messageId,
                });
              } else if (part.type === 'error') {
                throw part.error;
              }
            }

            // 如果成功，跳出循环
            return;
          } catch (error) {
            console.error(`Model ${modelName} failed:`, error);
            lastError = error instanceof Error ? error : new Error(String(error));
            
            // 如果不是最后一个模型，继续尝试下一个
            if (modelName !== models[models.length - 1]) {
              continue;
            }
          }
        }

        // 所有模型都失败了，发送错误
        writer.write({
          type: 'error',
          errorText: `所有模型都不可用。最后的错误: ${lastError?.message || '未知错误'}`,
        });
      },
      onError: (error) => {
        return error instanceof Error ? error.message : String(error);
      },
    });

    // 返回 UI Message Stream Response
    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error instanceof Error ? error.message : String(error) }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}