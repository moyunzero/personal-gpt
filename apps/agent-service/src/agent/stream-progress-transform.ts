/**
 * 合并流可能重复 enqueue 同一 text-delta 事件。
 * - 有 seq：按 id 单调序号去重；同 seq 丢弃，seq 前进则保留（含合法重复正文）
 * - 无 seq：连续相同 id+delta 视为合并伪影丢弃；不相邻的相同正文仍保留
 */
export function deduplicateTextDeltas(): TransformStream<any, any> {
  const lastSeqById = new Map<string, number>();
  let lastContentKey = "";
  return new TransformStream({
    transform(chunk, controller) {
      const obj = chunk as { type?: string; id?: string; delta?: string; seq?: number };
      if (obj?.type === "text-delta") {
        const id = obj.id ?? "_";
        if (typeof obj.seq === "number" && Number.isFinite(obj.seq)) {
          const prev = lastSeqById.get(id);
          if (prev !== undefined && obj.seq <= prev) return;
          lastSeqById.set(id, obj.seq);
          lastContentKey = "";
        } else {
          const key = `${id}:${obj.delta ?? ""}`;
          if (key === lastContentKey) return;
          lastContentKey = key;
        }
      } else {
        lastContentKey = "";
      }
      controller.enqueue(chunk);
    },
  });
}
