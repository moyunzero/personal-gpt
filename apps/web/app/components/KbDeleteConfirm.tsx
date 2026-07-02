"use client";

type KbDeleteConfirmProps = {
  open: boolean;
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
  loading?: boolean;
};

/**
 * 删除二次确认（D-20）：明确说明将同时删除 Astra 向量 chunks。
 */
export default function KbDeleteConfirm({
  open,
  title,
  onCancel,
  onConfirm,
  loading = false,
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
          确认删除文档？
        </h2>
        <p className="kb-modal-body">
          将永久删除「<strong>{title}</strong>
          」及其在知识库中的所有向量切片（Astra chunks）。此操作不可撤销。
        </p>
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
