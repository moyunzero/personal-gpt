import PromptSuggestionsButton from './PromptSuggestionButton'

interface PromptSuggestionsRowProps {
  onPromptClick: (prompt: string) => void;
}

const PromptSuggestionsRow = ({onPromptClick}: PromptSuggestionsRowProps)=>{
    const prompts = [
        "介绍一下心晴MO",
        "介绍一下欠费修仙中",
        "心情不好怎么办"
    ]
    return(
        <div className="prompt-suggestion-row">
            {prompts.map((prompt, index) =>
                <PromptSuggestionsButton
                    key={`suggestion-${index}`}
                    text={prompt}
                    onClick={()=>onPromptClick(prompt)}
                />
            )}
        </div>
    )
};

export default PromptSuggestionsRow