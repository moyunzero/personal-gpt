"use client";

import { useId, useState } from "react";

import type { GraphPathDisplay } from "@/lib/chat/graph-path-display";

export type { GraphPathDisplay };

interface GraphPathCardsProps {
  paths: GraphPathDisplay[];
}

function GraphPathCard({ path, index }: { path: GraphPathDisplay; index: number }) {
  const instanceId = useId();
  const [expanded, setExpanded] = useState(false);
  const cardId = `${instanceId}-graph-path-${index}`;
  const pathSummary = path.nodes.join(" → ");
  const relSummary = path.relationships.length > 0 ? path.relationships.join(" · ") : "";

  return (
    <article className="citation-card">
      <button
        type="button"
        className="citation-card-header"
        aria-expanded={expanded}
        aria-controls={`${cardId}-detail`}
        onClick={() => setExpanded((open) => !open)}
      >
        <span className="citation-card-title">{pathSummary}</span>
        <span className="citation-card-meta">
          {relSummary ? <span className="citation-card-similarity">{relSummary}</span> : null}
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
        <div id={`${cardId}-detail`} className="citation-card-snippet">
          <p>节点：{path.nodes.join(" → ")}</p>
          {path.relationships.length > 0 ? <p>关系：{path.relationships.join(" → ")}</p> : null}
        </div>
      ) : null}
    </article>
  );
}

export default function GraphPathCards({ paths }: GraphPathCardsProps) {
  if (paths.length === 0) {
    return null;
  }

  return (
    <div className="citation-cards" aria-label="图谱路径">
      <p className="citation-cards-label">图谱路径</p>
      <div className="citation-cards-list">
        {paths.map((path, index) => (
          <GraphPathCard key={`graph-path-${index}`} path={path} index={index} />
        ))}
      </div>
    </div>
  );
}
