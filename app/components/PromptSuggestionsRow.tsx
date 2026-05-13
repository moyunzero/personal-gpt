import PromptSuggestionsButton from './PromptSuggestionButton'

interface PromptSuggestionsRowProps {
  onPromptClick: (prompt: string) => void;
}

const PromptSuggestionsRow = ({onPromptClick}: PromptSuggestionsRowProps)=>{
    const prompts = [
        "介绍一下'心晴MO'",
        "介绍一下'修仙欠费中'",
        "介绍一下自己",
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