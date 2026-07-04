import { beforeEach, describe, expect, it, vi } from "vitest";

const getIngestJobByIdMock = vi.fn();

vi.mock("@/lib/kb/ingest-jobs.service", () => ({
  getIngestJobById: (...args: unknown[]) => getIngestJobByIdMock(...args),
}));

import { GET } from "./route";

describe("GET /api/kb/jobs/:id", () => {
  beforeEach(() => {
    getIngestJobByIdMock.mockReset();
  });

  it("returns job progress JSON for existing job", async () => {
    const createdAt = new Date("2026-07-01T10:00:00.000Z");
    const updatedAt = new Date("2026-07-01T10:05:00.000Z");

    getIngestJobByIdMock.mockResolvedValue({
      id: "job-42",
      documentId: "doc-42",
      status: "processing",
      progress: 55,
      error: null,
      createdAt,
      updatedAt,
    });

    const response = await GET(new Request("http://localhost/api/kb/jobs/job-42"), {
      params: Promise.resolve({ id: "job-42" }),
    });

    expect(response.status).toBe(200);
    expect(getIngestJobByIdMock).toHaveBeenCalledWith("job-42");

    const body = await response.json();
    expect(body).toEqual({
      id: "job-42",
      documentId: "doc-42",
      status: "processing",
      progress: 55,
      error: null,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    });
  });

  it("returns 404 when job does not exist", async () => {
    getIngestJobByIdMock.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/kb/jobs/missing"), {
      params: Promise.resolve({ id: "missing" }),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("任务不存在");
  });
});
