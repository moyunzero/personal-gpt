"use client";

import { useCallback, useEffect, useState } from "react";

import KbCategoryCombobox from "./KbCategoryCombobox";
import KbDeleteConfirm from "./KbDeleteConfirm";

export type KbDocumentItem = {
  id: string;
  title: string;
  category: string | null;
  tags: string[];
  visibility?: "workspace" | "private" | "restricted";
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
  categories?: string[];
  /** 兼容 React setState（支持函数式更新，避免删除/SSE 期间闭包过期冲掉并发上传） */
  onItemsChange: (items: KbDocumentItem[] | ((prev: KbDocumentItem[]) => KbDocumentItem[])) => void;
};

const STATUS_LABEL: Record<KbDocumentItem["status"], string> = {
  pending: "等待中",
  processing: "处理中",
  ready: "就绪",
  failed: "失败",
};

/** SSE 终态后从 REST 拉权威 document（含 chunkCount） */
async function fetchDocumentById(documentId: string): Promise<KbDocumentItem | null> {
  const res = await fetch(`/api/kb/documents/${documentId}`);
  const data = (await res.json()) as { document?: KbDocumentItem };
  if (!res.ok || !data.document) return null;
  return data.document;
}

function KbDocumentRow({
  item,
  categories,
  onUpdate,
  onRemove,
}: {
  item: KbDocumentItem;
  categories: string[];
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
  const [editCategory, setEditCategory] = useState(item.category ?? "");
  const [editTags, setEditTags] = useState(item.tags.join(", "));
  const [editVisibility, setEditVisibility] = useState<
    "workspace" | "private" | "restricted"
  >(item.visibility ?? "workspace");

  const parseTags = (raw: string) =>
    raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

  const resetEditState = () => {
    setEditTitle(item.title);
    setEditCategory(item.category ?? "");
    setEditTags(item.tags.join(", "));
    setEditVisibility(item.visibility ?? "workspace");
  };

  const startEditing = () => {
    resetEditState();
    setEditing(true);
  };

  const cancelEditing = () => {
    resetEditState();
    setEditing(false);
  };

  const jobId = item.latestJob?.id;

  // 终态从 props 推导；进行中用 SSE 流式进度
  const progress =
    item.status === "ready" ? 100 : (streamProgress ?? item.latestJob?.progress ?? 0);
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
      void (async () => {
        const fresh = await fetchDocumentById(item.id);
        onUpdate(
          fresh ?? {
            ...item,
            status: "ready",
            latestJob: item.latestJob
              ? { ...item.latestJob, progress: 100, status: "completed" }
              : null,
          },
        );
        es.close();
      })();
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

  const handleSave = async () => {
    const trimmedTitle = editTitle.trim();
    if (!trimmedTitle) {
      cancelEditing();
      return;
    }

    const nextCategory = editCategory.trim() || null;
    const nextTags = parseTags(editTags);
    const unchanged =
      trimmedTitle === item.title &&
      nextCategory === item.category &&
      JSON.stringify(nextTags) === JSON.stringify(item.tags) &&
      editVisibility === (item.visibility ?? "workspace");

    if (unchanged) {
      setEditing(false);
      return;
    }

    const res = await fetch(`/api/kb/documents/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: trimmedTitle,
        category: nextCategory,
        tags: nextTags,
        visibility: editVisibility,
      }),
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
            <div className="kb-doc-edit-form">
              <label className="kb-field">
                <span className="kb-field-label">标题</span>
                <input
                  className="kb-field-input kb-doc-edit-title"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleSave();
                    if (e.key === "Escape") cancelEditing();
                  }}
                  placeholder="文档标题"
                  autoFocus
                />
              </label>
              <div className="kb-meta-grid kb-meta-grid-compact">
                <label className="kb-field">
                  <span className="kb-field-label">分类</span>
                  <KbCategoryCombobox
                    value={editCategory}
                    onChange={setEditCategory}
                    options={categories}
                    placeholder="分类"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleSave();
                      if (e.key === "Escape") cancelEditing();
                    }}
                  />
                </label>
                <label className="kb-field">
                  <span className="kb-field-label">标签</span>
                  <input
                    className="kb-field-input"
                    value={editTags}
                    onChange={(e) => setEditTags(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleSave();
                      if (e.key === "Escape") cancelEditing();
                    }}
                    placeholder="逗号分隔"
                  />
                </label>
                <label className="kb-field">
                  <span className="kb-field-label">可见性</span>
                  <select
                    className="kb-field-input"
                    value={editVisibility}
                    onChange={(e) =>
                      setEditVisibility(e.target.value as typeof editVisibility)
                    }
                  >
                    <option value="workspace">工作区全员</option>
                    <option value="private">仅自己</option>
                    <option value="restricted">指定成员</option>
                  </select>
                </label>
              </div>
              <div className="kb-doc-edit-actions">
                <button
                  type="button"
                  className="kb-btn kb-btn-primary"
                  onClick={() => void handleSave()}
                >
                  保存
                </button>
                <button type="button" className="kb-btn kb-btn-ghost" onClick={cancelEditing}>
                  取消
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="kb-doc-title" onClick={startEditing}>
              {item.title}
            </button>
          )}

          <div className="kb-doc-meta">
            <span className={`kb-status kb-status-${item.status}`}>
              {STATUS_LABEL[item.status]}
            </span>
            {item.category ? <span className="kb-doc-tag">{item.category}</span> : null}
            <span className="kb-doc-tag">{item.visibility ?? "workspace"}</span>
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

          {item.status === "failed" && jobError ? <p className="kb-doc-error">{jobError}</p> : null}
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
          <button type="button" className="kb-btn kb-btn-ghost" onClick={() => setDeleteOpen(true)}>
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
  categories = [],
  onItemsChange,
}: KbDocumentListProps) {
  const updateItem = useCallback(
    (next: KbDocumentItem) => {
      onItemsChange((prev) => prev.map((row) => (row.id === next.id ? next : row)));
    },
    [onItemsChange],
  );

  const removeItem = useCallback(
    (id: string) => {
      onItemsChange((prev) => prev.filter((row) => row.id !== id));
    },
    [onItemsChange],
  );

  if (items.length === 0) {
    return <p className="kb-empty-list">暂无文档。上传第一个文件开始构建知识库。</p>;
  }

  return (
    <div className="kb-doc-list">
      {items.map((item) => (
        <KbDocumentRow
          key={item.id}
          item={item}
          categories={categories}
          onUpdate={updateItem}
          onRemove={removeItem}
        />
      ))}
    </div>
  );
}
