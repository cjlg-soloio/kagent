import { Task } from '@a2a-js/sdk';
import { useMemo } from 'react';
import ChatMessage from 'Components/Chat/core/render/ChatMessage';
import { RenderUserMessageActions } from 'Components/Chat/core/render/MessageDisplay';
import { getSupersededToolIds } from 'Components/Chat/oss-plugins/hitl/hitlHelpers';
import { getMetadataValue } from 'Components/Chat/core/render/helpers/messageHelpers';
import { TaskContainer } from 'Components/Chat/core/render/TaskBlockStyles';

interface TaskBlockProps {
  task: Task;
  onRewindToMessage?: (rewindBeforeInvocationId: string) => void;
  onForkFromMessage?: (rewindBeforeInvocationId: string) => void;
  onRewindAndSend?: (rewindBeforeInvocationId: string, text: string) => void;
  renderUserMessageActions?: RenderUserMessageActions;
}

const TaskBlock = ({
  task,
  onRewindToMessage,
  onForkFromMessage,
  onRewindAndSend,
  renderUserMessageActions
}: TaskBlockProps) => {
  const messages = task.history || [];

  /**
   * Pre-computes the set of tool IDs that have ToolApprovalRequest or AskUserRequest messages.
   * These IDs supersede the raw ToolCallRequestEvent for the same tool, allowing MessageDisplay
   * to efficiently filter them using Set.has() instead of scanning the full history for each message.
   */
  const supersededToolIds = useMemo(() => getSupersededToolIds(task.history), [task.history]);

  // console.log('block', duplicateObj(task));

  return (
    <TaskContainer>
      {/* Render all messages in chronological order */}
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

      {/* Task Artifacts */}
      {/* {task.artifacts && task.artifacts.length > 0 && (
        <TaskArtifactsContainer>
          <Text size={fontSizePx.sm} weight='bold' color={colors.NEW_fontDimGray}>
            Generated Artifacts:
          </Text>
          {task.artifacts.map(artifact => (
            <ArtifactDisplay key={artifact.artifactId} artifact={artifact} />
          ))}
        </TaskArtifactsContainer>
      )} */}

      {/* Task Status */}
      {/* <TaskStatusContainer>
        <TaskStatusDisplay status={task.status} />
      </TaskStatusContainer> */}
    </TaskContainer>
  );
};

export default TaskBlock;
