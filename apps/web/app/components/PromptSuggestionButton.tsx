interface PromptSuggestionButtonProps {
  text: string;
  description?: string;
  onClick: () => void;
}

const PromptSuggestionButton = ({ text, description, onClick }: PromptSuggestionButtonProps) => {
  return (
    <button type="button" className="suggestion-card" onClick={onClick}>
      <span className="suggestion-card-title">{text}</span>
      {description ? <span className="suggestion-card-desc">{description}</span> : null}
    </button>
  );
};

export default PromptSuggestionButton;
