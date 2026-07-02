"use client";

import { useState } from "react";

import type { Citation } from "@personal-gpt/shared/types/kb";

interface CitationCardsProps {
  citations: Citation[];
}

function formatSimilarity(similarity: number): string {
  return `${Math.round(similarity * 100)}%`;
}

function CitationCard({ citation }: { citation: Citation }) {
  const [expanded, setExpanded] = useState(false);
  const cardId = `citation-${citation.documentId}-${citation.chunkIndex ?? 0}`;

  return (
    <article className="citation-card">
      <button
        type="button"
        className="citation-card-header"
        aria-expanded={expanded}
        aria-controls={`${cardId}-snippet`}
        onClick={() => setExpanded((open) => !open)}
      >
        <span className="citation-card-title">{citation.title}</span>
        <span className="citation-card-meta">
          <span className="citation-card-similarity">
            {formatSimilarity(citation.similarity)}
          </span>
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
        <p id={`${cardId}-snippet`} className="citation-card-snippet">
          {citation.snippet}
        </p>
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
        {citations.map((citation, index) => (
          <CitationCard
            key={`${citation.documentId}-${citation.chunkIndex ?? index}`}
            citation={citation}
          />
        ))}
      </div>
    </div>
  );
}
