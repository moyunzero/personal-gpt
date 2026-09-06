"use client";

import type { ReactNode } from "react";

type KbDeleteConfirmProps = {
  open: boolean;
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
  loading?: boolean;
  /** 对话框标题；默认「确认删除文档？」 */
  heading?: string;
  /** 自定义正文；默认知识库删除说明 */
  body?: ReactNode;
};

/**
 * 删除二次确认弹层（与 KB 共用同一套 modal UI）。
 */
export default function KbDeleteConfirm({
  open,
  title,
  onCancel,
  onConfirm,
  loading = false,
  heading = "确认删除文档？",
  body,
}: KbDeleteConfirmProps) {
  if (!open) return null;

  return (
    <div className="kb-modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="kb-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kb-delete-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="kb-delete-title" className="kb-modal-title">
          {heading}
        </h2>
        <div className="kb-modal-body">
          {body ?? (
            <p>
              将永久删除「<strong>{title}</strong>
              」及其在知识库中的所有向量切片（Astra chunks）。此操作不可撤销。
            </p>
          )}
        </div>
        <div className="kb-modal-actions">
          <button
            type="button"
            className="kb-btn kb-btn-ghost"
            onClick={onCancel}
            disabled={loading}
          >
            取消
          </button>
          <button
            type="button"
            className="kb-btn kb-btn-danger"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "删除中…" : "确认删除"}
          </button>
        </div>
      </div>
    </div>
  );
}
