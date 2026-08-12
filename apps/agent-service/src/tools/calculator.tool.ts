/**
 * calculator：受限算术求值（无 eval / vm / QuickJS）（T-02-02-02）。
 */

import { tool } from "langchain";
import { z } from "zod";

const SAFE_EXPR = /^[\d\s+\-*/().]+$/;
const FORBIDDEN = /\b(require|process|global|Function|eval|import|export|window|document)\b/i;

function tokenize(expr: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i]!;
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if ("+-*/()".includes(ch)) {
      tokens.push(ch);
      i += 1;
      continue;
    }
    if (/\d|\./.test(ch)) {
      let j = i + 1;
      while (j < expr.length && /[\d.]/.test(expr[j]!)) j += 1;
      tokens.push(expr.slice(i, j));
      i = j;
      continue;
    }
    throw new Error(`非法字符: ${ch}`);
  }
  return tokens;
}

/** 递归下降：expr → term ((+|-) term)*；term → factor ((*|/) factor)*；factor → number | (expr) | unary+/- */
function parseExpression(tokens: string[]): number {
  let pos = 0;

  function peek(): string | undefined {
    return tokens[pos];
  }

  function consume(expected?: string): string {
    const t = tokens[pos];
    if (t === undefined) {
      throw new Error("表达式不完整");
    }
    if (expected !== undefined && t !== expected) {
      throw new Error(`期望 ${expected}，得到 ${t}`);
    }
    pos += 1;
    return t;
  }

  function parseExpr(): number {
    let left = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = consume();
      const right = parseTerm();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseFactor();
    while (peek() === "*" || peek() === "/") {
      const op = consume();
      const right = parseFactor();
      if (op === "/") {
        if (right === 0) throw new Error("除零");
        left = left / right;
      } else {
        left = left * right;
      }
    }
    return left;
  }

  function parseFactor(): number {
    if (peek() === "+") {
      consume("+");
      return parseFactor();
    }
    if (peek() === "-") {
      consume("-");
      return -parseFactor();
    }
    if (peek() === "(") {
      consume("(");
      const v = parseExpr();
      consume(")");
      return v;
    }
    const raw = consume();
    if (!/^\d+(\.\d+)?$/.test(raw)) {
      throw new Error(`非法数字: ${raw}`);
    }
    return Number(raw);
  }

  const value = parseExpr();
  if (pos !== tokens.length) {
    throw new Error("多余的 token");
  }
  return value;
}

export function evaluateSafeArithmetic(expression: string): number {
  const trimmed = expression.trim();
  if (!trimmed) {
    throw new Error("空表达式");
  }
  if (FORBIDDEN.test(trimmed) || !SAFE_EXPR.test(trimmed)) {
    throw new Error("不安全或不支持的表达式");
  }
  return parseExpression(tokenize(trimmed));
}

export async function invokeCalculator(input: {
  expression: string;
}): Promise<string> {
  try {
    const value = evaluateSafeArithmetic(input.expression);
    return `计算结果: ${value}`;
  } catch {
    return "拒绝：表达式非法或不安全（仅支持数字与 + - * / ()）。请改用安全算术表达式。";
  }
}

export const calculatorTool = tool(
  async (input: { expression: string }) => invokeCalculator(input),
  {
    name: "calculator",
    description:
      "安全算术计算器。仅支持数字与 + - * / 括号；禁止代码或系统调用。",
    schema: z.object({
      expression: z
        .string()
        .min(1)
        .describe("算术表达式，例如 (10 - 4) / 2"),
    }),
  },
);
