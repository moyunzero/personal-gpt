/**
 * Agent 图内闲聊 / 过短短路（D-03 / D-17）。
 * 规则优先于 LLM：问候语、过短输入、轻量寒暄不进入 Supervisor+Workers。
 */

import { AIMessage, type BaseMessage } from "@langchain/core/messages";

const GREETING_PHRASES = new Set([
  "你好",
  "您好",
  "嗨",
  "hi",
  "hello",
  "hey",
  "在吗",
  "在不在",
  "早上好",
  "晚上好",
  "午安",
  "拜拜",
  "再见",
  "谢谢",
  "好的",
  "ok",
  "okay",
]);

/** 轻量寒暄（含「今天天气怎么样」类，不全量跑多 Agent） */
const CASUAL_CHITCHAT = [
  /^今天天气怎么样$/,
  /^天气怎么样$/,
  /^你是谁$/,
  /^你叫什么$/,
  /^在干嘛$/,
  /^怎么样$/,
];

const TRAILING_PUNCTUATION = /^[\s!！?？。,，~～]+|[\s!！?？。,，~～]+$/g;

/** trim 后短于此长度视为过短（单字 / 空白） */
const MIN_MEANINGFUL_LENGTH = 2;

function normalize(text: string): string {
  return text.trim().replace(TRAILING_PUNCTUATION, "").toLowerCase();
}

/**
 * 是否应走图内短路（不全量 Supervisor hub-and-spoke）。
 */
export function isAgentChitchat(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < MIN_MEANINGFUL_LENGTH) {
    return true;
  }

  const core = normalize(text);
  if (!core) {
    return true;
  }

  if (GREETING_PHRASES.has(core)) {
    return true;
  }

  if (CASUAL_CHITCHAT.some((re) => re.test(core))) {
    return true;
  }

  return false;
}

/**
 * 礼貌短回复（中文），作为 short_reply 节点的 messages 更新。
 */
export function buildShortReplyMessages(text: string): BaseMessage[] {
  const core = normalize(text);
  let content: string;

  if (!core || core.length < MIN_MEANINGFUL_LENGTH) {
    content = "你好！有什么我可以帮你的吗？可以直接问知识库或调研类问题。";
  } else if (GREETING_PHRASES.has(core)) {
    content = "你好！我是企业知识库助手。有什么问题可以帮你？";
  } else if (/天气/.test(core)) {
    content =
      "这是闲聊短路回复：若要查实时天气或做深度调研，请用更具体的任务描述（例如公司政策、报告分析）。";
  } else {
    content = "收到。若需要知识库检索或多步调研，请用一两句说清目标，我再调度专科助手。";
  }

  return [new AIMessage(content)];
}
