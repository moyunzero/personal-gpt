/**
 * 聊天请求中针对用户 query 的两个纯分类函数。
 *
 * 抽离自 `app/api/chat/route.ts`，单独成模块是为了：
 *   1. 让纯逻辑能被单元测试覆盖（vitest 直接 import 即可，无需启动 Next.js）。
 *   2. 后续 route.ts 的拆分（chat-route-optimization）可以渐进迁移。
 */

/**
 * 启发式判断当前 query 是否需要走向量检索。
 *
 * 闲聊、问候、过短问题、纯算术等场景一律跳过，节省 embedding/检索成本。
 */
export function shouldUseVectorSearch(query: string): boolean {
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
    "你好", "hello", "hi", "在吗", "在不在",
    "怎么样", "干嘛", "做什么", "心情",
    "天气", "吃了吗", "早上好", "晚上好",
  ];
  if (casualPhrases.some((phrase) => lowerQuery.includes(phrase)) && query.length < 20) {
    return false;
  }

  // 4. 包含关键词，可能需要查询知识库
  const contextKeywords = [
    "项目", "作品", "经历", "工作", "技能",
    "介绍", "了解", "详细", "具体", "什么时候",
    "如何", "怎么做", "为什么", "原因",
  ];
  if (contextKeywords.some((keyword) => lowerQuery.includes(keyword))) {
    return true;
  }

  // 5. 默认：中等长度的问题可能需要上下文
  return query.length > 30;
}
