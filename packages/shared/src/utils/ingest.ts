/**
 * 文档入库默认配置：切块参数与 MIME → Loader 映射。
 * enterprise-roadmap 建议 chunk 800–1000，overlap ~100。
 */

export const INGEST_CHUNK_DEFAULTS = {
  chunkSize: 900,
  chunkOverlap: 100,
} as const;

/** MIME 类型到 LangChain Loader 名称的映射（ingest-worker 消费） */
export const MIME_LOADER_MAP: Record<string, string> = {
  "application/pdf": "PDFLoader",
  "text/markdown": "TextLoader",
  "text/plain": "TextLoader",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DocxLoader",
};

export const DEFAULT_ALLOWED_MIME_TYPES = Object.keys(MIME_LOADER_MAP);
