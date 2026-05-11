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

// ====================== 向量检索函数 ======================
async function getRelevantContext(query: string): Promise<string> {
  if (!ASTRA_DB_COLLECTION || !query) return "";
  
  try {
    // 缩短超时时间到 3 秒
    const timeoutPromise = new Promise<string>((_, reject) => {
      setTimeout(() => reject(new Error("Vector search timeout")), 3000);
    });

    const searchPromise = (async () => {
      const collection = getDb().collection(ASTRA_DB_COLLECTION);

      const embeddings = await openRouterClient.embeddings.create({
        model: "nvidia/llama-nemotron-embed-vl-1b-v2:free",
        input: query,
        encoding_format: "float",
      });

      const vector = embeddings.data[0]?.embedding;
      if (!vector) return "";

      const cursor = collection.find(
        {},
        {
          sort: { $vector: vector },
          limit: 3, // 减少到 3 个结果，加快速度
          includeSimilarity: true,
          projection: { content: 1, _id: 0 },
        }
      );

      const docs = await cursor.toArray();

      // 降低相似度阈值，确保有结果
      interface DocResult {
        $similarity?: number;
        content: string;
      }
      const relevantDocs = (docs as DocResult[]).filter((doc) => (doc.$similarity || 0) >= 0.65);

      // 拼接上下文（只取 content，节省 token）
      return relevantDocs.map((doc) => doc.content).join("\n\n");
    })();

    return await Promise.race([searchPromise, timeoutPromise]);
  } catch {
    // 降级：返回空字符串，让 AI 使用自身知识回答
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

    const systemPrompt = `你是一个专业、友好、乐于助人的助手。
请自然、清晰地回答用户问题。
如果提供了参考内容，请优先基于参考内容回答，并注明信息来源。
如果没有相关参考内容，请使用自己的知识正常回答。

参考内容：
${docContext || "（无相关参考内容）"}`;

    // 创建 UI Message Stream（与 useChat 兼容）
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const messageId = `msg-${Date.now()}`;
        let hasStarted = false;

        // 使用 OpenRouter 流式输出
        const result = streamText({
          model: openrouter("minimax/minimax-m2.5:free"),
          system: systemPrompt,
          messages: formattedMessages,
          temperature: 0.7,
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
            // 发送错误
            writer.write({
              type: 'error',
              errorText: part.error instanceof Error ? part.error.message : String(part.error),
            });
          }
        }
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