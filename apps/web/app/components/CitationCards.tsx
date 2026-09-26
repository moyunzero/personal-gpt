"use client";

import { useState } from "react";

import type { Citation } from "@personal-gpt/shared/types/kb";

import { groupCitationsByDocument, type CitationDocumentGroup } from "./group-citations";

interface CitationCardsProps {
  citations: Citation[];
}

function formatSimilarity(similarity: number): string {
  return `${Math.round(similarity * 100)}%`;
}

function sharedPage(group: CitationDocumentGroup): number | undefined {
  const first = group.snippets[0]?.page;
  if (typeof first !== "number" || !Number.isFinite(first)) return undefined;
  return group.snippets.every((snippet) => snippet.page === first) ? first : undefined;
}

function pagesFollowSnippets(group: CitationDocumentGroup): boolean {
  if (group.snippets.length < 2) return false;
  const pages = new Set<number>();
  for (const snippet of group.snippets) {
    if (typeof snippet.page !== "number" || !Number.isFinite(snippet.page)) return false;
    pages.add(snippet.page);
  }
  return pages.size > 1;
}

function CitationCard({ group }: { group: CitationDocumentGroup }) {
  const [expanded, setExpanded] = useState(false);
  const panelId = `citation-${group.documentId}-panel`;
  const page = sharedPage(group);
  const labelPerSnippet = pagesFollowSnippets(group);

  return (
    <article className="citation-card">
      <button
        type="button"
        className="citation-card-header"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((open) => !open)}
      >
        <span className="citation-card-title">{group.title}</span>
        <span className="citation-card-meta">
          <span className="citation-card-similarity">{formatSimilarity(group.similarity)}</span>
          <svg
            className={`citation-card-chevron${expanded ? " citation-card-chevron-open" : ""}`}
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M4 6l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
      <a
        className="citation-card-meta"
        href={`/api/kb/documents/${group.documentId}/file${page != null ? `#page=${page}` : ""}`}
        target="_blank"
        rel="noreferrer"
      >
        {page != null ? `第 ${page} 页 · 打开原文` : "打开原文"}
      </a>
      {expanded ? (
        <div id={panelId}>
          {group.snippets.map((item) => (
            <p key={item.sourceNumber} className="citation-card-snippet">
              {`[S${item.sourceNumber}] ${
                labelPerSnippet && typeof item.page === "number" ? `第 ${item.page} 页 ` : ""
              }${item.snippet}`}
            </p>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export default function CitationCards({ citations }: CitationCardsProps) {
  if (citations.length === 0) {
    return null;
  }

  return (
    <div className="citation-cards" aria-label="引用来源">
      <p className="citation-cards-label">引用来源</p>
      <div className="citation-cards-list">
        {groupCitationsByDocument(citations).map((group) => (
          <CitationCard key={group.documentId} group={group} />
        ))}
      </div>
    </div>
  );
}
