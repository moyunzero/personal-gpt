"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { ChatMode } from "./ModeSegmentedControl";

type ModelRow = { id: string; modelId: string };

type ModelChipProps = {
  mode: ChatMode;
  modelId: string;
  models: ModelRow[];
  disabled?: boolean;
  onSelect: (modelId: string) => void;
};

export default function ModelChip({ mode, modelId, models, disabled, onSelect }: ModelChipProps) {
  const [open, setOpen] = useState(false);
  const title = modelId ? modelId.split("/").pop() : "选择模型";

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);

  if (models.length === 0) {
    return (
      <Link href="/settings/models" className="model-chip">
        添加模型
      </Link>
    );
  }

  return (
    <span className="model-chip-wrap" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className="model-chip"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {title}
      </button>
      {open ? (
        <div className="model-menu" role="menu" aria-label={mode === "chat" ? "对话模型" : "Agent 模型"}>
          {models.map((model) => (
            <button
              key={model.id}
              type="button"
              className={model.modelId === modelId ? "on" : undefined}
              onClick={() => {
                onSelect(model.modelId);
                setOpen(false);
              }}
            >
              {model.modelId.split("/").pop()}
              <small>{model.modelId}</small>
            </button>
          ))}
          <Link href="/settings/models">管理模型</Link>
        </div>
      ) : null}
    </span>
  );
}
