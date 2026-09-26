"use client";

import Link from "next/link";
import { modelLabel } from "@personal-gpt/shared/ai/model-presets";

import PaperMenu from "./PaperMenu";
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
  if (models.length === 0) {
    return (
      <Link href="/settings/models" className="model-chip">
        添加模型
      </Link>
    );
  }

  return (
    <PaperMenu
      variant="chip"
      placement="up"
      value={modelId}
      placeholder="选择模型"
      ariaLabel={mode === "chat" ? "对话模型" : "Agent 模型"}
      disabled={disabled}
      options={models.map((model) => ({
        value: model.modelId,
        title: modelLabel(model.modelId),
        detail: model.modelId,
      }))}
      onChange={onSelect}
      footer={<Link href="/settings/models">管理模型</Link>}
    />
  );
}
