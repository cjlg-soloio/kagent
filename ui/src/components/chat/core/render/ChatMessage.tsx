import { SendStreamingMessageSuccessResponse, Task } from '@a2a-js/sdk';
import { Card } from '@solo-io/ui-components-enterprise';
import ArtifactUpdateMessage from 'Components/Chat/core/render/ArtifactUpdateMessage';
import MessageDisplay, { RenderUserMessageActions } from 'Components/Chat/core/render/MessageDisplay';
import StatusUpdateMessage from 'Components/Chat/core/render/StatusUpdateMessage';

interface ChatMessageProps {
  task: Task;
  message: SendStreamingMessageSuccessResponse['result'];
  invocationId?: string;
  onRewindToMessage?: (rewindBeforeInvocationId: string) => void;
  onForkFromMessage?: (rewindBeforeInvocationId: string) => void;
  onRewindAndSend?: (rewindBeforeInvocationId: string, text: string) => void;
  supersededToolIds?: Set<string>;
  renderUserMessageActions?: RenderUserMessageActions;
}

const ChatMessage = ({
  task,
  message,
  invocationId,
  onRewindToMessage,
  onForkFromMessage,
  onRewindAndSend,
  supersededToolIds,
  renderUserMessageActions
}: ChatMessageProps) => {
  // Route to appropriate component based on message kind
  switch (message.kind) {
    case 'message':
      return (
        <MessageDisplay
          task={task}
          message={message}
          invocationId={invocationId}
          onRewindToMessage={onRewindToMessage}
          onForkFromMessage={onForkFromMessage}
          onRewindAndSend={onRewindAndSend}
          supersededToolIds={supersededToolIds}
          renderUserMessageActions={renderUserMessageActions}
        />
      );

    case 'status-update':
      return <StatusUpdateMessage task={task} statusUpdate={message} />;

    case 'artifact-update':
      return <ArtifactUpdateMessage task={task} artifactUpdate={message} />;

    default:
      return <Card>Unable to display message kind: {(message as any).kind}</Card>;
  }
};

export default ChatMessage;
