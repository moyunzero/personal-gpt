import PromptSuggestionsButton from "./PromptSuggestionButton";

interface PromptSuggestionsRowProps {
  onPromptClick: (prompt: string) => void;
}

const PROMPTS: { text: string; description: string }[] = [
  { text: "介绍一下 MoCode", description: "了解项目背景与核心能力" },
  { text: "LookJob 怎么帮你找工作", description: "求职流程与匹配思路" },
  { text: "介绍一下你自己", description: "认识这位个人助手" },
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
