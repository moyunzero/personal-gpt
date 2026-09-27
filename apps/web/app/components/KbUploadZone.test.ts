import { describe, expect, it } from "vitest";

import { multipartLimitAfterBlobFailure } from "./KbUploadZone";

describe("multipartLimitAfterBlobFailure", () => {
  it("allows the local 20MB path only when the server multipart limit can hold it", () => {
    const error = new Error("Vercel Blob: Failed to retrieve the client token");
    expect(multipartLimitAfterBlobFailure(error)).toBe(4.5 * 1024 * 1024);
    expect(multipartLimitAfterBlobFailure(error, 20 * 1024 * 1024)).toBe(20 * 1024 * 1024);
  });

  it("keeps the serverless body limit when Blob failed for another reason", () => {
    expect(multipartLimitAfterBlobFailure(new Error("network"))).toBe(4.5 * 1024 * 1024);
  });
});
