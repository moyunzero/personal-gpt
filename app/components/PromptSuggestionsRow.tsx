import PromptSuggestionsButton from "./PromptSuggestionButton";

interface PromptSuggestionsRowProps {
  onPromptClick: (prompt: string) => void;
}

const PromptSuggestionsRow = ({ onPromptClick }: PromptSuggestionsRowProps) => {
  const prompts = [
    "介绍一下 MoCode",
    "LookJob 怎么帮你找工作",
    "介绍一下你自己",
    "心情不好怎么办",
  ];
  return (
    <div className="suggestion-grid">
      {prompts.map((prompt, index) => (
        <PromptSuggestionsButton
          key={`suggestion-${index}`}
          text={prompt}
          onClick={() => onPromptClick(prompt)}
        />
      ))}
    </div>
  );
};

export default PromptSuggestionsRow;
