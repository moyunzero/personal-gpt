import { describe, expect, it } from "vitest";

import { parseS3Uri } from "./minio";

describe("parseS3Uri", () => {
  it("parses bucket and key", () => {
    expect(parseS3Uri("s3://my-bucket/path/to/file.pdf")).toEqual({
      bucket: "my-bucket",
      key: "path/to/file.pdf",
    });
  });

  it("returns null for non-s3 or malformed", () => {
    expect(parseS3Uri("https://example.com/x")).toBeNull();
    expect(parseS3Uri("s3://bucket-only")).toBeNull();
  });
});
