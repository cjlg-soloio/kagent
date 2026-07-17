import { Message, Task, TextPart } from '@a2a-js/sdk';
import { css } from '@emotion/react';
import { MarkdownRenderer, Text } from '@solo-io/ui-components-enterprise';

interface TextPartRendererProps {
  task: Task;
  message: Message;
  part: TextPart;
}

const TextPartRenderer = ({ part, message }: TextPartRendererProps) => {
  if (message.role === 'agent') {
    // Agent messages can be markdown.
    return <MarkdownRenderer text={part.text} />;
  }

  // User messages should be plain text.
  return (
    <Text
      stylingOverrides={css`
        white-space: normal;
        word-break: break-word;
      `}>
      {part.text}
    </Text>
  );
};

export default TextPartRenderer;
