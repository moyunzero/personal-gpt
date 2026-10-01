import { beforeEach, describe, expect, it, vi } from "vitest";

const unlinkMock = vi.fn();
const delMock = vi.fn();
const deleteStoredObjectMock = vi.fn();

vi.mock("node:fs/promises", () => ({
  unlink: (...args: unknown[]) => unlinkMock(...args),
}));

vi.mock("@vercel/blob", () => ({
  del: (...args: unknown[]) => delMock(...args),
}));

vi.mock("@/lib/storage/minio", () => ({
  deleteStoredObject: (...args: unknown[]) => deleteStoredObjectMock(...args),
  isMinioConfigured: () => true,
  uploadToMinio: vi.fn(),
}));

vi.mock("@/lib/storage/vercel-blob", () => ({
  isTrustedVercelBlobUrl: (url: string) => /blob\.vercel-storage\.com/i.test(url),
  isVercelBlobConfigured: () => true,
  uploadToVercelBlob: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: {
    ALLOWED_MIME_TYPES: ["application/pdf"],
    UPLOAD_MAX_BYTES: 1_000_000,
  },
}));

import { deleteDocumentStorage } from "./documents.service";

describe("deleteDocumentStorage", () => {
  beforeEach(() => {
    unlinkMock.mockReset();
    delMock.mockReset();
    deleteStoredObjectMock.mockReset();
    process.env.BLOB_READ_WRITE_TOKEN = "tok";
  });

  it("deletes s3:// via MinIO client", async () => {
    await deleteDocumentStorage("s3://bucket/key.pdf");
    expect(deleteStoredObjectMock).toHaveBeenCalledWith("s3://bucket/key.pdf");
    expect(delMock).not.toHaveBeenCalled();
  });

  it("deletes Vercel Blob URLs via del()", async () => {
    await deleteDocumentStorage("https://abc.blob.vercel-storage.com/x.pdf");
    expect(delMock).toHaveBeenCalled();
    expect(deleteStoredObjectMock).not.toHaveBeenCalled();
  });

  it("unlinks local paths", async () => {
    unlinkMock.mockResolvedValue(undefined);
    await deleteDocumentStorage("/tmp/uploads/x.pdf");
    expect(unlinkMock).toHaveBeenCalledWith("/tmp/uploads/x.pdf");
  });
});
