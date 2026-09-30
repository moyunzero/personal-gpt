import { describe, expect, it } from "vitest";

import { deduplicateTextDeltas } from "./stream-progress-transform";

async function collect(stream: TransformStream<any, any>, chunks: unknown[]): Promise<unknown[]> {
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  const out: unknown[] = [];
  const readDone = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      out.push(value);
    }
  })();
  for (const c of chunks) {
    await writer.write(c);
  }
  await writer.close();
  await readDone;
  return out;
}

describe("deduplicateTextDeltas", () => {
  it("drops consecutive identical text-delta without seq", async () => {
    const out = await collect(deduplicateTextDeltas(), [
      { type: "text-delta", id: "t1", delta: "hi" },
      { type: "text-delta", id: "t1", delta: "hi" },
      { type: "text-delta", id: "t1", delta: "yo" },
    ]);
    expect(out).toEqual([
      { type: "text-delta", id: "t1", delta: "hi" },
      { type: "text-delta", id: "t1", delta: "yo" },
    ]);
  });

  it("drops text-delta with non-increasing seq for same id", async () => {
    const out = await collect(deduplicateTextDeltas(), [
      { type: "text-delta", id: "t1", delta: "a", seq: 1 },
      { type: "text-delta", id: "t1", delta: "b", seq: 1 },
      { type: "text-delta", id: "t1", delta: "c", seq: 2 },
    ]);
    expect(out).toEqual([
      { type: "text-delta", id: "t1", delta: "a", seq: 1 },
      { type: "text-delta", id: "t1", delta: "c", seq: 2 },
    ]);
  });
});
