"use client";

import { useCallback, useEffect, useState } from "react";

import KbDeleteConfirm from "./KbDeleteConfirm";

export type KbDocumentItem = {
  id: string;
  title: string;
  category: string | null;
  tags: string[];
  status: "pending" | "processing" | "ready" | "failed";
  chunkCount: number;
  mimeType: string | null;
  createdAt: string;
  latestJob: {
    id: string;
    status: string;
    progress: number;
    error: string | null;
    bullJobId: string | null;
  } | null;
};

type KbDocumentListProps = {
  items: KbDocumentItem[];
  onItemsChange: (items: KbDocumentItem[]) => void;
};

const STATUS_LABEL: Record<KbDocumentItem["status"], string> = {
  pending: "等待中",
  processing: "处理中",
  ready: "就绪",
  failed: "失败",
};

function KbDocumentRow({
  item,
  onUpdate,
  onRemove,
}: {
  item: KbDocumentItem;
  onUpdate: (next: KbDocumentItem) => void;
  onRemove: (id: string) => void;
}) {
  const [streamProgress, setStreamProgress] = useState<number | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);

  const jobId = item.latestJob?.id;

  // 终态从 props 推导；进行中用 SSE 流式进度
  const progress =
    item.status === "ready"
      ? 100
      : (streamProgress ?? item.latestJob?.progress ?? 0);
  const jobError = item.latestJob?.error ?? streamError;

  const showProgress =
    item.status === "pending" ||
    item.status === "processing" ||
    (item.status === "failed" && progress < 100);

  // SSE 订阅导入进度（D-11）；setState 仅在 EventSource 回调中
  useEffect(() => {
    if (!jobId) return;
    if (item.status === "ready" || item.status === "failed") return;

    const es = new EventSource(`/api/kb/jobs/${jobId}/stream`);

    es.addEventListener("progress", (event) => {
      const data = JSON.parse((event as MessageEvent).data) as { progress: number };
      setStreamProgress(data.progress);
    });

    es.addEventListener("completed", () => {
      setStreamProgress(100);
      onUpdate({ ...item, status: "ready", latestJob: item.latestJob ? { ...item.latestJob, progress: 100, status: "completed" } : null });
      es.close();
    });

    es.addEventListener("failed", (event) => {
      const data = JSON.parse((event as MessageEvent).data) as { error?: string };
      setStreamError(data.error ?? "导入失败");
      onUpdate({
        ...item,
        status: "failed",
        latestJob: item.latestJob
          ? { ...item.latestJob, status: "failed", error: data.error ?? "导入失败" }
          : null,
      });
      es.close();
    });

    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jobId/status 变化时重连
  }, [jobId, item.status]);

  const handleReindex = async () => {
    setReindexing(true);
    try {
      const res = await fetch(`/api/kb/documents/${item.id}/reindex`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        document?: KbDocumentItem;
        error?: string;
      };
      if (!res.ok || !data.document) {
        throw new Error(data.error ?? "重新索引失败");
      }
      onUpdate(data.document);
      setStreamProgress(0);
      setStreamError(null);
    } catch (err) {
      setStreamError(err instanceof Error ? err.message : "重新索引失败");
    } finally {
      setReindexing(false);
    }
  };

  const handleSaveTitle = async () => {
    const trimmed = editTitle.trim();
    if (!trimmed || trimmed === item.title) {
      setEditing(false);
      return;
    }
    const res = await fetch(`/api/kb/documents/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    });
    const data = (await res.json()) as { document?: KbDocumentItem };
    if (data.document) onUpdate(data.document);
    setEditing(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/kb/documents/${item.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("删除失败");
      onRemove(item.id);
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  return (
    <>
      <article className="kb-doc-row">
        <div className="kb-doc-main">
          {editing ? (
            <input
              className="kb-doc-title-input"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={() => void handleSaveTitle()}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSaveTitle();
                if (e.key === "Escape") setEditing(false);
              }}
              autoFocus
            />
          ) : (
            <button
              type="button"
              className="kb-doc-title"
              onClick={() => setEditing(true)}
            >
              {item.title}
            </button>
          )}

          <div className="kb-doc-meta">
            <span className={`kb-status kb-status-${item.status}`}>
              {STATUS_LABEL[item.status]}
            </span>
            {item.category ? (
              <span className="kb-doc-tag">{item.category}</span>
            ) : null}
            {item.tags?.map((tag) => (
              <span key={tag} className="kb-doc-tag">
                {tag}
              </span>
            ))}
            {item.status === "ready" ? (
              <span className="kb-doc-chunks">{item.chunkCount} 块</span>
            ) : null}
          </div>

          {showProgress ? (
            <div className="kb-progress" aria-label="导入进度">
              <div
                className="kb-progress-bar"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
              <span className="kb-progress-label">{progress}%</span>
            </div>
          ) : null}

          {item.status === "failed" && jobError ? (
            <p className="kb-doc-error">{jobError}</p>
          ) : null}
        </div>

        <div className="kb-doc-actions">
          {(item.status === "failed" || item.status === "ready") && (
            <button
              type="button"
              className="kb-btn kb-btn-ghost"
              onClick={() => void handleReindex()}
              disabled={reindexing}
            >
              {reindexing ? "索引中…" : item.status === "failed" ? "重试" : "重新索引"}
            </button>
          )}
          <button
            type="button"
            className="kb-btn kb-btn-ghost"
            onClick={() => setDeleteOpen(true)}
          >
            删除
          </button>
        </div>
      </article>

      <KbDeleteConfirm
        open={deleteOpen}
        title={item.title}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => void handleDelete()}
        loading={deleting}
      />
    </>
  );
}

/** 文档列表 + 行内 SSE 进度（D-11/D-12） */
export default function KbDocumentList({
  items,
  onItemsChange,
}: KbDocumentListProps) {
  const updateItem = useCallback(
    (next: KbDocumentItem) => {
      onItemsChange(items.map((row) => (row.id === next.id ? next : row)));
    },
    [items, onItemsChange],
  );

  const removeItem = useCallback(
    (id: string) => {
      onItemsChange(items.filter((row) => row.id !== id));
    },
    [items, onItemsChange],
  );

  if (items.length === 0) {
    return (
      <p className="kb-empty-list">暂无文档。上传第一个文件开始构建知识库。</p>
    );
  }

  return (
    <div className="kb-doc-list">
      {items.map((item) => (
        <KbDocumentRow
          key={item.id}
          item={item}
          onUpdate={updateItem}
          onRemove={removeItem}
        />
      ))}
    </div>
  );
}
