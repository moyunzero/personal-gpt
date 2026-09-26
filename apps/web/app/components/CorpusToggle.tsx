"use client";

export type CorpusChoice = "user" | "seed";

type CorpusToggleProps = {
  value: CorpusChoice;
  onChange: (value: CorpusChoice) => void;
  disabled?: boolean;
};

/**
 * Explicit seed corpus switch (D-28). Default remains user — never silent seed.
 */
export default function CorpusToggle({ value, onChange, disabled = false }: CorpusToggleProps) {
  const seedOn = value === "seed";

  return (
    <label className="corpus-toggle" title="只查种子资料，不和用户上传的文档混在一起">
      <input
        type="checkbox"
        className="corpus-toggle-input"
        checked={seedOn}
        disabled={disabled}
        aria-label="检索种子知识库"
        onChange={(e) => onChange(e.target.checked ? "seed" : "user")}
      />
      <span className="corpus-toggle-label">只查种子库</span>
    </label>
  );
}
