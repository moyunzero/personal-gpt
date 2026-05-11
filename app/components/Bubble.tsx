import { UIMessage } from "@ai-sdk/react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface BubbleProps {
    message: UIMessage;
}

const Bubble = ({ message }: BubbleProps) => {
    // 从 parts 中提取文本内容
    const content = message.parts
        .filter((part) => 'type' in part && part.type === 'text' && 'text' in part)
        .map((part) => ('text' in part ? (part.text as string) : ''))
        .join('');
    
    const { role } = message;
    
    if (!content) {
        return null;
    }
    
    return (
        <div className={`${role} bubble`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content}
            </ReactMarkdown>
        </div>
    );
};

export default Bubble;