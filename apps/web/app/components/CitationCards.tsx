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

function CitationCard({ group }: { group: CitationDocumentGroup }) {
  const [expanded, setExpanded] = useState(false);
  const panelId = `citation-${group.documentId}-panel`;

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
      {expanded ? (
        <div id={panelId}>
          {group.snippets.map((item) => (
            <p key={item.sourceNumber} className="citation-card-snippet">
              [S{item.sourceNumber}] {item.snippet}
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
