const PromptSuggestionButton = ({text,onClick}) => {
  return (
    <button     
        className="prompt-suggestion-button"
        onClick={onClick}
    >
        {text}
    </button>
  )
};

export default PromptSuggestionButton