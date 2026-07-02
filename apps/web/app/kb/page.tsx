"use client";

import { useCallback, useEffect, useState } from "react";

import AppHeader from "../components/AppHeader";
import KbDocumentList, {
  type KbDocumentItem,
} from "../components/KbDocumentList";
import KbUploadZone from "../components/KbUploadZone";

type ListResponse = {
  items: KbDocumentItem[];
  total: number;
};

/**
 * 知识库管理页（KB-01）：上传、列表、SSE 进度、CRUD（D-03/D-18 单列响应式）。
 */
export default function KbPage() {
  const [items, setItems] = useState<KbDocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [tags, setTags] = useState("");

  const fetchList = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (category.trim()) params.set("category", category.trim());
      if (status) params.set("status", status);
      if (tags.trim()) params.set("tags", tags.trim());

      const res = await fetch(`/api/kb/documents?${params.toString()}`);
      const data = (await res.json()) as ListResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "加载失败");
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [search, category, status, tags]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const handleUploaded = (doc: KbDocumentItem) => {
    // D-10：上传后立即出现在列表顶部
    setItems((prev) => [doc, ...prev.filter((row) => row.id !== doc.id)]);
  };

  return (
    <main className="kb-page">
      <AppHeader activePage="kb" />

      <div className="kb-content">
        <header className="kb-page-header">
          <h1 className="kb-page-title">知识库</h1>
          <p className="kb-page-sub">
            上传文档后自动切块入库，聊天时可基于这些内容回答。
          </p>
        </header>

        <KbUploadZone onUploaded={handleUploaded} />

        <section className="kb-filters" aria-label="筛选文档">
          <input
            className="kb-filter-input"
            placeholder="搜索标题…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <input
            className="kb-filter-input"
            placeholder="分类"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
          <input
            className="kb-filter-input"
            placeholder="标签（逗号分隔）"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
          <select
            className="kb-filter-select"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">全部状态</option>
            <option value="pending">等待中</option>
            <option value="processing">处理中</option>
            <option value="ready">就绪</option>
            <option value="failed">失败</option>
          </select>
        </section>

        {loading ? <p className="kb-loading">加载中…</p> : null}
        {error ? <p className="kb-upload-error">{error}</p> : null}

        <KbDocumentList items={items} onItemsChange={setItems} />
      </div>
    </main>
  );
}
