/**
 * 项目级结构化 logger。
 *
 * 设计取舍：
 *   - 不引入 pino / winston：单进程 Next.js + Vercel 日志已经够用，加依赖不划算。
 *   - 底层就是 console.{log,warn,error}，方便 Vercel 控制台直接查看。
 *   - 但接口是结构化的：调用方传对象而不是字符串拼接，方便未来切换 transport。
 *   - `metric` 是一等 API：用于发 [METRIC] 命名空间的可聚合事件，独立于业务日志。
 *   - `child(baseFields)` 提供 per-request 注入 requestId 的便利方式，
 *     避免每行 log 都手写 `{ requestId }`。
 *
 * 不在范围内（YAGNI，等真需要再加）：
 *   - LOG_LEVEL 过滤
 *   - JSON-only 输出模式
 *   - 异步 transport / 缓冲
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  [key: string]: unknown;
}

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  /**
   * 记录一条可聚合的指标事件。
   * `event` 应使用 dot-separated snake_case，例如 `vector.search.ok`。
   */
  metric(event: string, fields?: LogFields): void;
  /** 派生一个带固定 baseFields 的子 logger（baseFields 会与每次调用的 fields 合并）。 */
  child(baseFields: LogFields): Logger;
}

/**
 * 把 fields 序列化成单行 JSON。
 * 错误对象单独提取 message / name / stack，避免 JSON.stringify 把 Error 序列化成 "{}"。
 */
function formatFields(fields: LogFields | undefined): string {
  if (!fields || Object.keys(fields).length === 0) return "";
  const normalized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v instanceof Error) {
      normalized[k] = { name: v.name, message: v.message, stack: v.stack };
    } else {
      normalized[k] = v;
    }
  }
  try {
    return " " + JSON.stringify(normalized);
  } catch {
    // 循环引用兜底
    return " [unserializable fields]";
  }
}

function emit(
  level: LogLevel | "metric",
  msg: string,
  mergedFields: LogFields | undefined,
): void {
  const prefix = level === "metric" ? "[METRIC]" : `[${level}]`;
  const line = `${prefix} ${msg}${formatFields(mergedFields)}`;
  switch (level) {
    case "warn":
      console.warn(line);
      return;
    case "error":
      console.error(line);
      return;
    case "debug":
    case "info":
    case "metric":
    default:
      console.log(line);
  }
}

function createLogger(baseFields: LogFields = {}): Logger {
  const mergeFields = (fields?: LogFields): LogFields | undefined => {
    if (!fields) return Object.keys(baseFields).length ? baseFields : undefined;
    return { ...baseFields, ...fields };
  };

  return {
    debug: (msg, fields) => emit("debug", msg, mergeFields(fields)),
    info: (msg, fields) => emit("info", msg, mergeFields(fields)),
    warn: (msg, fields) => emit("warn", msg, mergeFields(fields)),
    error: (msg, fields) => emit("error", msg, mergeFields(fields)),
    metric: (event, fields) => emit("metric", event, mergeFields(fields)),
    child: (extra) => createLogger({ ...baseFields, ...extra }),
  };
}

/** 全局默认 logger；模块内/请求内若需带 requestId 等公共字段请用 `logger.child(...)`。 */
export const logger: Logger = createLogger();
