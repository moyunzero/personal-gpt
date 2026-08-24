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
    <label className="corpus-toggle" title="默认只查用户库；打开后检索种子语料库">
      <input
        type="checkbox"
        className="corpus-toggle-input"
        checked={seedOn}
        disabled={disabled}
        aria-label="检索种子知识库"
        onChange={(e) => onChange(e.target.checked ? "seed" : "user")}
      />
      <span className="corpus-toggle-label">同时检索种子库</span>
    </label>
  );
}
