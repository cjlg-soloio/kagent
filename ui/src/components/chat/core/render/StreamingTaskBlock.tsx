import { Task } from '@a2a-js/sdk';
import styled from '@emotion/styled';
import { Text } from '@solo-io/ui-components-enterprise';
import { fontSizePx, spacingPx } from '@solo-io/ui-components-enterprise/styles';
import { useMemo } from 'react';
import { colors } from 'Styles';
import { ChatState } from 'Components/Chat/core/transport/ChatManager';
import ChatMessage from 'Components/Chat/core/render/ChatMessage';
import { RenderUserMessageActions } from 'Components/Chat/core/render/MessageDisplay';
import { getSupersededToolIds } from 'Components/Chat/oss-plugins/hitl/hitlHelpers';
import { getMetadataValue } from 'Components/Chat/core/render/helpers/messageHelpers';
import { PulsingDot, TaskContainer, TaskStatusContainer } from 'Components/Chat/core/render/TaskBlockStyles';

const StreamingIndicator = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacingPx.sm};
  padding: ${spacingPx.md};
  background: ${colors.NEW_background};
  border-radius: 8px;
  border-left: 4px solid ${colors.brand400};
`;

interface StreamingTaskBlockProps {
  task: Task;
  curChatState: ChatState;
  onRewindToMessage?: (rewindBeforeInvocationId: string) => void;
  onForkFromMessage?: (rewindBeforeInvocationId: string) => void;
  onRewindAndSend?: (rewindBeforeInvocationId: string, text: string) => void;
  renderUserMessageActions?: RenderUserMessageActions;
}

const StreamingTaskBlock = ({
  task,
  curChatState,
  onRewindToMessage,
  onForkFromMessage,
  onRewindAndSend,
  renderUserMessageActions
}: StreamingTaskBlockProps) => {
  const messages = task.history || [];
  const hasPendingApproval = task.status.state === 'input-required';
  const statusText = getStreamingStatusText(curChatState, task.status.state);
  const showStreamingIndicator =
    curChatState !== ChatState.STREAMING && curChatState !== ChatState.SENDING && !!statusText && !hasPendingApproval;

  /**
   * Pre-computes the set of tool IDs that have ToolApprovalRequest or AskUserRequest messages.
   * These IDs supersede the raw ToolCallRequestEvent for the same tool, allowing MessageDisplay
   * to efficiently filter them using Set.has() instead of scanning the full history for each message.
   */
  const supersededToolIds = useMemo(() => getSupersededToolIds(task.history), [task.history]);

  return (
    <TaskContainer>
      {/* Messages */}
      {messages.map((message, idx) => {
        // Message and Tasks always have the same invocation ID
        const invocationId =
          getMetadataValue<string>(message.metadata as Record<string, unknown> | undefined, 'invocation_id') ??
          getMetadataValue<string>(task.metadata as Record<string, unknown> | undefined, 'invocation_id');

        return (
          <ChatMessage
            key={`${task.id}_${message.messageId}_${idx}`}
            task={task}
            message={{
              ...message,
              contextId: task.contextId,
              taskId: task.id
            }}
            invocationId={invocationId}
            onRewindToMessage={onRewindToMessage}
            onForkFromMessage={onForkFromMessage}
            onRewindAndSend={onRewindAndSend}
            supersededToolIds={supersededToolIds}
            renderUserMessageActions={renderUserMessageActions}
          />
        );
      })}

      {/* Streaming Status Indicator
      // TODO: Not sure if this shows up, but it should be improved since we should have the status.
      */}
      {showStreamingIndicator && (
        <TaskStatusContainer>
          <StreamingIndicator>
            <PulsingDot />
            <Text size={fontSizePx.sm} weight='semibold' color={colors.NEW_fontWhite}>
              {statusText}
            </Text>
          </StreamingIndicator>
        </TaskStatusContainer>
      )}

      {/* Streaming Artifacts */}
      {/* {task.artifacts && task.artifacts.length > 0 && (
        <div>
          <Text size={fontSizePx.sm} weight='bold' color={colors.NEW_fontDimGray} mb={spacingPx.md}>
            Generating Artifacts...
          </Text>
          {task.artifacts.map(artifact => (
            <ArtifactDisplay key={artifact.artifactId} artifact={artifact} isStreaming={isStreaming} />
          ))}
        </div>
      )} */}

      {/* Task Status Details */}
      {/* 
      // TODO: This looks to be unnecessary. Could pass status down into ChatMessage and then conditionally render some indicator if it's in progress.
      {(curChatState === ChatState.STREAMING || curChatState === ChatState.SENDING) && task.status.message && (
        <TaskStatusDisplay task={task} status={task.status} title='Task Details:' showOnlyNonCompleted={false} />
      )} */}
    </TaskContainer>
  );
};

// Helper function to get appropriate status text
function getStreamingStatusText(chatState: ChatState, taskState: string): string {
  // if (chatState === ChatState.SENDING) return 'Sending message...';
  // if (chatState === ChatState.STREAMING) return 'Agent is responding...';

  switch (taskState) {
    case 'submitted':
      return 'Task submitted...';
    case 'input-required':
      return 'Waiting for input...';
    case 'auth-required':
      return 'Authentication required...';
    case 'working':
    default:
      return '';
  }
}

export default StreamingTaskBlock;
