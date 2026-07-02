interface PromptSuggestionButtonProps {
  text: string;
  onClick: () => void;
}

/**
 * 空状态下的引导卡片，单卡使用 feature-card 风格：
 * canvas 底 + hairline 边 + lg 圆角，hover 时切换到 surface-card。
 */
const PromptSuggestionButton = ({
  text,
  onClick,
}: PromptSuggestionButtonProps) => {
  return (
    <button type="button" className="suggestion-card" onClick={onClick}>
      {text}
    </button>
  );
};

export default PromptSuggestionButton;
