import { describe, expect, it } from "vitest";

import { readBodyWithByteLimit } from "./parse";

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(chunks[i++]!);
    },
  });
}

describe("readBodyWithByteLimit", () => {
  it("concatenates chunks under the limit", async () => {
    const out = await readBodyWithByteLimit(
      streamOf([new Uint8Array([1, 2]), new Uint8Array([3])]),
      10,
    );
    expect(Array.from(out)).toEqual([1, 2, 3]);
  });

  it("throws when bytes exceed max", async () => {
    await expect(
      readBodyWithByteLimit(streamOf([new Uint8Array(8), new Uint8Array(8)]), 10),
    ).rejects.toThrow(/exceeds upload limit/);
  });
});
