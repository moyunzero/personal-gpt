"use client";

import { useEffect, useMemo, useState } from "react";

import AppHeader from "../components/AppHeader";
import AppShell from "../components/AppShell";
import KbCategoryCombobox from "../components/KbCategoryCombobox";
import KbDocumentList, { type KbDocumentItem } from "../components/KbDocumentList";
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

  const categories = useMemo(
    () => [...new Set(items.map((i) => i.category).filter((c): c is string => Boolean(c)))],
    [items],
  );

  // 筛选变化时拉列表
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const params = new URLSearchParams();
        if (search.trim()) params.set("search", search.trim());
        if (category.trim()) params.set("category", category.trim());
        if (status) params.set("status", status);
        if (tags.trim()) params.set("tags", tags.trim());

        const res = await fetch(`/api/kb/documents?${params.toString()}`);
        const data = (await res.json()) as ListResponse & { error?: string };
        if (!res.ok) throw new Error(data.error ?? "加载失败");
        if (!cancelled) {
          setError(null);
          setItems(data.items);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "加载失败");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [search, category, status, tags]);

  const handleUploaded = (doc: KbDocumentItem) => {
    // D-10：上传后立即出现在列表顶部
    setItems((prev) => [doc, ...prev.filter((row) => row.id !== doc.id)]);
  };

  return (
    <AppShell activePage="kb">
      <main className="kb-page">
        <AppHeader activePage="kb" isAuthenticated={true} />

        <div className="kb-content">
          <header className="kb-page-header">
            <h1 className="kb-page-title">知识库</h1>
            <p className="kb-page-sub">上传文档后自动切块入库，聊天时可基于这些内容回答。</p>
          </header>

          <KbUploadZone onUploaded={handleUploaded} />

          <section className="kb-toolbar" aria-label="筛选文档">
            <div className="kb-toolbar-search">
              <input
                className="kb-field-input kb-toolbar-search-input"
                placeholder="搜索文档…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="搜索标题"
              />
            </div>
            <div className="kb-toolbar-filters">
              <KbCategoryCombobox
                className="kb-toolbar-filter"
                value={category}
                onChange={setCategory}
                options={categories}
                placeholder="分类"
                aria-label="按分类筛选"
              />
              <input
                className="kb-field-input kb-toolbar-filter"
                placeholder="标签"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                aria-label="按标签筛选"
              />
              <select
                className="kb-field-input kb-toolbar-select"
                aria-label="按状态筛选"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">全部状态</option>
                <option value="pending">等待中</option>
                <option value="processing">处理中</option>
                <option value="ready">就绪</option>
                <option value="failed">失败</option>
              </select>
            </div>
          </section>

          {loading ? <p className="kb-loading">加载中…</p> : null}
          {error ? <p className="kb-upload-error">{error}</p> : null}

          <KbDocumentList items={items} categories={categories} onItemsChange={setItems} />
        </div>
      </main>
    </AppShell>
  );
}
