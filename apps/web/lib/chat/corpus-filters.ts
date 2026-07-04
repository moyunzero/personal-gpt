/** 路由预检与 retrieve Path A/B 共用的 corpus 过滤（对齐检索可见范围） */
export const ROUTE_CORPUS_FILTER = {
  $or: [
    { documentId: { $exists: true } },
    { source: { $eq: "prompt-suggestion" } },
    { source: { $eq: "psychology-qa" } },
  ],
} as const;
