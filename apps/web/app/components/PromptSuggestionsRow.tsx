import PromptSuggestionsButton from "./PromptSuggestionButton";

interface PromptSuggestionsRowProps {
  onPromptClick: (prompt: string) => void;
}

const PROMPTS: { text: string; description: string }[] = [
  { text: "你能帮我做什么", description: "了解助手能力与使用方式" },
  { text: "随便聊聊", description: "没有主题也可以，想到哪说到哪" },
  { text: "帮我理清思路", description: "把一团乱麻慢慢说清楚" },
  { text: "心情不好怎么办", description: "慢慢说，这里先听你讲" },
];

const PromptSuggestionsRow = ({ onPromptClick }: PromptSuggestionsRowProps) => {
  return (
    <div className="suggestion-grid">
      {PROMPTS.map((prompt, index) => (
        <PromptSuggestionsButton
          key={`suggestion-${index}`}
          text={prompt.text}
          description={prompt.description}
          onClick={() => onPromptClick(prompt.text)}
        />
      ))}
    </div>
  );
};

export default PromptSuggestionsRow;
