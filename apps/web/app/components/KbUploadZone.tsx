"use client";

import { useCallback, useRef, useState } from "react";

import type { KbDocumentItem } from "./KbDocumentList";

type KbUploadZoneProps = {
  onUploaded: (item: KbDocumentItem) => void;
};

type UploadMeta = {
  category: string;
  tags: string;
  title: string;
  visibility: "workspace" | "private" | "restricted";
};

const ACCEPT_TYPES = [
  "application/pdf",
  "text/markdown",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
].join(",");

const EMPTY_META: UploadMeta = {
  category: "",
  tags: "",
  title: "",
  visibility: "workspace",
};

/**
 * 两步上传：选文件 → 填属性（可选）→ 确认上传（D-10）。
 */
export default function KbUploadZone({ onUploaded }: KbUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMeta, setShowMeta] = useState(false);
  const [meta, setMeta] = useState<UploadMeta>(EMPTY_META);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const resetPicker = () => {
    if (inputRef.current) inputRef.current.value = "";
  };

  const selectFile = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setPendingFile(file);
    setError(null);
    setShowMeta(true);
    resetPicker();
  };

  const uploadFile = useCallback(
    async (file: File, uploadMeta: UploadMeta) => {
      setError(null);
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);

        const category = uploadMeta.category.trim();
        const tags = uploadMeta.tags.trim();
        const title = uploadMeta.title.trim();
        if (category) formData.append("category", category);
        if (tags) formData.append("tags", tags);
        if (title) formData.append("title", title);
        formData.append("visibility", uploadMeta.visibility);

        const res = await fetch("/api/kb/documents", {
          method: "POST",
          body: formData,
        });
        const data = (await res.json()) as {
          error?: string;
          document?: KbDocumentItem;
        };

        if (!res.ok || !data.document) {
          throw new Error(data.error ?? "上传失败");
        }

        onUploaded(data.document);
        setMeta(EMPTY_META);
        setPendingFile(null);
        setShowMeta(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "上传失败");
      } finally {
        setUploading(false);
      }
    },
    [onUploaded],
  );

  const handleSubmit = () => {
    if (!pendingFile || uploading) return;
    void uploadFile(pendingFile, meta);
  };

  const handleCancel = () => {
    setPendingFile(null);
    setMeta(EMPTY_META);
    setError(null);
    resetPicker();
  };

  return (
    <section className="kb-upload-card" aria-label="上传文档">
      <div
        className={`kb-dropzone${dragOver ? " kb-dropzone-active" : ""}${pendingFile ? " kb-dropzone-has-file" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          selectFile(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        role="button"
        tabIndex={0}
      >
        <span className="kb-dropzone-icon" aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 16V4m0 0 7 7m-7-7 7 7M4 20h16"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        {pendingFile ? (
          <>
            <p className="kb-dropzone-title">{pendingFile.name}</p>
            <p className="kb-dropzone-hint">点击或拖拽可更换文件</p>
          </>
        ) : (
          <>
            <p className="kb-dropzone-title">拖拽文件到此处，或点击选择</p>
            <p className="kb-dropzone-hint">PDF · Markdown · TXT · DOCX · 最大 20MB</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          className="kb-file-input"
          accept={ACCEPT_TYPES}
          onChange={(e) => selectFile(e.target.files)}
          disabled={uploading}
          aria-label="选择要上传的文件"
        />
      </div>

      {showMeta ? (
        <div className="kb-meta-panel">
          <p className="kb-meta-panel-title">文档属性</p>
          <div className="kb-meta-grid">
            <label className="kb-field">
              <span className="kb-field-label">标题</span>
              <input
                className="kb-field-input"
                placeholder={pendingFile?.name.replace(/\.[^.]+$/, "") ?? "留空则用文件名"}
                value={meta.title}
                onChange={(e) => setMeta((m) => ({ ...m, title: e.target.value }))}
                disabled={uploading}
              />
            </label>
            <label className="kb-field">
              <span className="kb-field-label">分类</span>
              <input
                className="kb-field-input"
                placeholder="项目文档"
                value={meta.category}
                onChange={(e) => setMeta((m) => ({ ...m, category: e.target.value }))}
                disabled={uploading}
              />
            </label>
            <label className="kb-field">
              <span className="kb-field-label">标签</span>
              <input
                className="kb-field-input"
                placeholder="ai, rag"
                value={meta.tags}
                onChange={(e) => setMeta((m) => ({ ...m, tags: e.target.value }))}
                disabled={uploading}
              />
            </label>
            <label className="kb-field">
              <span className="kb-field-label">可见性</span>
              <select
                className="kb-field-input"
                value={meta.visibility}
                onChange={(e) =>
                  setMeta((m) => ({
                    ...m,
                    visibility: e.target.value as UploadMeta["visibility"],
                  }))
                }
                disabled={uploading}
              >
                <option value="workspace">工作区全员</option>
                <option value="private">仅自己</option>
                <option value="restricted">指定成员</option>
              </select>
            </label>
          </div>
        </div>
      ) : null}

      <div className="kb-upload-actions">
        <button
          type="button"
          className={`kb-card-accordion${showMeta ? " kb-card-accordion-open" : ""}`}
          onClick={() => setShowMeta((open) => !open)}
          aria-expanded={showMeta ? "true" : "false"}
        >
          <span>{showMeta ? "收起文档属性" : "添加文档属性（可选）"}</span>
          <span className="kb-card-accordion-chevron" aria-hidden />
        </button>

        <div className="kb-upload-submit-row">
          {pendingFile ? (
            <button
              type="button"
              className="kb-btn kb-btn-ghost"
              onClick={handleCancel}
              disabled={uploading}
            >
              取消
            </button>
          ) : null}
          <button
            type="button"
            className="kb-btn kb-btn-primary kb-upload-submit"
            onClick={handleSubmit}
            disabled={!pendingFile || uploading}
          >
            {uploading ? "上传中…" : "确认上传"}
          </button>
        </div>
      </div>

      {error ? <p className="kb-upload-error">{error}</p> : null}
    </section>
  );
}
