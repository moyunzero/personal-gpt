import { beforeEach, describe, expect, it, vi } from "vitest";

const getIngestJobForContextMock = vi.fn();

vi.mock("@/lib/kb/ingest-jobs.service", () => ({
  getIngestJobForContext: (...args: unknown[]) => getIngestJobForContextMock(...args),
}));

vi.mock("@/lib/kb/route-guards", () => ({
  runKbGuards: (_req: Request, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(async () => ({
    session: { user: { id: "user-1" } },
  })),
}));

vi.mock("@/lib/kb/request-context", () => ({
  documentsContextFromSession: vi.fn(async () => ({
    userId: "user-1",
    workspaceId: "ws-1",
  })),
}));

import { GET } from "./route";

describe("GET /api/kb/jobs/:id", () => {
  beforeEach(() => {
    getIngestJobForContextMock.mockReset();
  });

  it("returns job progress JSON for existing job", async () => {
    const createdAt = new Date("2026-07-01T10:00:00.000Z");
    const updatedAt = new Date("2026-07-01T10:05:00.000Z");

    getIngestJobForContextMock.mockResolvedValue({
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
    expect(getIngestJobForContextMock).toHaveBeenCalledWith("job-42", {
      userId: "user-1",
      workspaceId: "ws-1",
    });

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
    getIngestJobForContextMock.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/kb/jobs/missing"), {
      params: Promise.resolve({ id: "missing" }),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("任务不存在");
  });
});
