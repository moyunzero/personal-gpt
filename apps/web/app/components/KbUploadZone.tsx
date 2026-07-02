"use client";

import { useCallback, useRef, useState } from "react";

import type { KbDocumentItem } from "./KbDocumentList";

type KbUploadZoneProps = {
  onUploaded: (item: KbDocumentItem) => void;
};

const ACCEPT_TYPES = [
  "application/pdf",
  "text/markdown",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
].join(",");

/**
 * 拖拽/点击上传区；成功后由父组件 optimistic unshift（D-10）。
 */
export default function KbUploadZone({ onUploaded }: KbUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadFile = useCallback(
    async (file: File) => {
      setError(null);
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);

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
      } catch (err) {
        setError(err instanceof Error ? err.message : "上传失败");
      } finally {
        setUploading(false);
      }
    },
    [onUploaded],
  );

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void uploadFile(file);
  };

  return (
    <section className="kb-upload-zone" aria-label="上传文档">
      <div
        className={`kb-dropzone${dragOver ? " kb-dropzone-active" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        role="button"
        tabIndex={0}
      >
        <p className="kb-dropzone-title">
          {uploading ? "上传中…" : "拖拽文件到此处，或点击选择"}
        </p>
        <p className="kb-dropzone-hint">PDF · Markdown · TXT · DOCX · 最大 20MB</p>
        <input
          ref={inputRef}
          type="file"
          className="kb-file-input"
          accept={ACCEPT_TYPES}
          onChange={(e) => handleFiles(e.target.files)}
          disabled={uploading}
        />
      </div>
      {error ? <p className="kb-upload-error">{error}</p> : null}
    </section>
  );
}
