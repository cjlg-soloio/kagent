import { Message, Part, Task } from '@a2a-js/sdk';
import { ApprovalStatus } from 'Components/Chat/core/render/DataPartRenderer';
import DataPartRenderer from 'Components/Chat/core/render/DataPartRenderer';
import FilePartRenderer from 'Components/Chat/core/render/FilePartRenderer';
import TextPartRenderer from 'Components/Chat/core/render/TextPartRenderer';

interface MessagePartRendererProps {
  task: Task;
  message: Message;
  part: Part;
  messageId: string;
  partIndex: number;
  approvalStatus?: ApprovalStatus;
  isDecided?: boolean;
  onApprove?: () => void;
  onReject?: (reason?: string) => void;
  subagentName?: string;
  subagentSessionId?: string;
}

const MessagePartRenderer = ({
  task,
  message,
  part,
  approvalStatus,
  isDecided,
  onApprove,
  onReject,
  subagentName,
  subagentSessionId
}: MessagePartRendererProps) => {
  switch (part.kind) {
    case 'text':
      return <TextPartRenderer task={task} message={message} part={part} />;

    case 'data':
      return (
        <DataPartRenderer
          task={task}
          message={message}
          part={part}
          approvalStatus={approvalStatus}
          isDecided={isDecided}
          onApprove={onApprove}
          onReject={onReject}
          subagentName={subagentName}
          subagentSessionId={subagentSessionId}
        />
      );

    case 'file':
      return <FilePartRenderer task={task} message={message} part={part} />;

    default:
      return <div>Unsupported part type: {JSON.stringify(part)}</div>;
  }
};

export default MessagePartRenderer;
