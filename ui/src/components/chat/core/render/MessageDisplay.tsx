import { Message, Task } from '@a2a-js/sdk';
import styled from '@emotion/styled';
import { Button, FlexLayout, Text, UserIconCircle } from '@solo-io/ui-components-enterprise';
import { fontSizePx, radiusPx, spacingPx } from '@solo-io/ui-components-enterprise/styles';
import { ApprovalDecision, ToolDecision } from 'Api/external/kagent/types';
import { PROMPT_BOX_FONT_SIZE } from 'Components/Chat/core/components/ChatInput/ChatInput.styles';
import { ApprovalStatus } from 'Components/Chat/core/render/DataPartRenderer';
import { ADKMetadata, ProcessedToolCallData } from 'Components/Chat/core/render/helpers/messageHelpers';
import { processToolCallMessage } from 'Components/Chat/core/render/helpers/toolHelpers';
import MessagePartRenderer from 'Components/Chat/core/render/MessagePartRenderer';
import { TaskContainer } from 'Components/Chat/core/render/TaskBlockStyles';
import AskUserDisplay from 'Components/Chat/oss-plugins/ask-user/AskUserDisplay';
import { HitlContext } from 'Components/Chat/oss-plugins/hitl/HitlContext';
import { AuthContext } from 'context/AuthContext';
import { ReactNode, useContext, useMemo, useState } from 'react';
import { colors } from 'Styles';
import { basePathNoSuffixSlash } from 'utils/environment-variables';

const ChatMessageContainer = styled.div`
  max-width: 100%;
  position: relative;
`;

const EditTextarea = styled.textarea`
  width: 100%;
  min-height: 100px;
  padding: ${spacingPx.sm};
  border-radius: ${radiusPx.md};
  border: 1px solid ${colors.zinc700};
  background-color: ${colors.slate800};
  color: ${colors.white};
  font-size: ${PROMPT_BOX_FONT_SIZE}px;
  font-family: inherit;
  resize: vertical;

  &:focus-visible {
    outline: none;
    border-color: ${colors.grayLight300};
  }

  &:focus:not(.focus-visible) {
    outline: none;
  }
`;

/**
 * Context handed to the {@link MessageDisplayProps.renderUserMessageActions} slot.
 *
 * This is the seam that keeps `core/` free of enterprise concepts: the core render
 * tree renders a user message and offers this slot; the enterprise host
 * (kagent-enterprise) fills it with the trace + rewind/fork actions from
 * `ent-plugins/`. When no slot is supplied (e.g. kagent OSS), no enterprise UI
 * mounts and no enterprise code is imported.
 */
export interface UserMessageActionsContext {
  task: Task;
  message: Message;
  invocationId?: string;
  /** True when a rewind/fork/edit action is possible for this message. */
  hasRewindActions: boolean;
  /** Puts this message into inline edit mode (core-owned). */
  startEditing: () => void;
  onRewindToMessage?: (rewindBeforeInvocationId: string) => void;
  onForkFromMessage?: (rewindBeforeInvocationId: string) => void;
}

export type RenderUserMessageActions = (ctx: UserMessageActionsContext) => ReactNode;

interface MessageDisplayProps {
  task: Task;
  message: Message;
  invocationId?: string;
  onRewindToMessage?: (rewindBeforeInvocationId: string) => void;
  onForkFromMessage?: (rewindBeforeInvocationId: string) => void;
  onRewindAndSend?: (rewindBeforeInvocationId: string, text: string) => void;
  supersededToolIds?: Set<string>;
  /**
   * Optional enterprise seam. When provided, its return value is rendered as the
   * trailing action cluster for user messages (trace, rewind/fork). Supplied by the
   * host; `core/` never imports the enterprise components directly.
   */
  renderUserMessageActions?: RenderUserMessageActions;
}

const MessageDisplay = ({
  task,
  message: originalMessage,
  invocationId,
  onRewindToMessage,
  onForkFromMessage,
  onRewindAndSend,
  supersededToolIds,
  renderUserMessageActions
}: MessageDisplayProps) => {
  const { curUser } = useContext(AuthContext);
  // HitlContext may be null when MessageDisplay is rendered outside of a HitlProvider.
  // Fall back to no-ops and readOnly=true so HITL UI is display-only or hidden.
  const hitl = useContext(HitlContext);
  const handleApprove = hitl?.handleApprove ?? (() => {});
  const handleReject = hitl?.handleReject ?? (() => {});
  const pendingDecisions = hitl?.pendingDecisions ?? {};
  const handleAskUserSubmit = hitl?.handleAskUserSubmit ?? (() => {});
  const readOnly = hitl?.readOnly ?? true;
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');

  // Process tool call metadata if present
  const message = processToolCallMessage(originalMessage);
  const metadata = message.metadata as ADKMetadata | undefined;

  const senderRole = message.role;
  const senderName = senderRole === 'agent' ? 'Agent' : curUser.name;
  const senderProfileImageUrl =
    senderRole === 'agent' ? `${basePathNoSuffixSlash}/agent-chat-icon.png` : curUser.profileImageUrl;

  // Compute approval status for ToolApprovalRequest messages
  const isToolApprovalRequest = metadata?.originalType === 'ToolApprovalRequest';
  const isAskUserRequest = metadata?.originalType === 'AskUserRequest';
  const toolCallData = metadata?.toolCallData as ProcessedToolCallData[] | undefined;

  // Pre-resolved approval decision set by buildApprovalMessage (from history recovery)
  // Can be a uniform string ('approve'/'reject') or a per-tool batch map
  const approvalDecision = metadata?.approvalDecision as ApprovalDecision | undefined;
  const subagentName = metadata?.subagentName as string | undefined;

  const approvalStatusMap = useMemo<Record<string, ApprovalStatus>>(() => {
    if (!isToolApprovalRequest || !toolCallData) return {};
    const map: Record<string, ApprovalStatus> = {};
    for (const tool of toolCallData) {
      let resolved: ToolDecision | undefined;
      if (typeof approvalDecision === 'string') {
        resolved = approvalDecision;
      } else if (approvalDecision && typeof approvalDecision === 'object') {
        resolved = approvalDecision[tool.id];
      }

      if (resolved === 'approve') {
        map[tool.id] = 'approved';
      } else if (resolved === 'reject') {
        map[tool.id] = 'rejected';
      } else if (!readOnly) {
        // Only mark as pending_approval when the context allows interaction.
        // In read-only contexts (e.g. subagent panels), unresolved approvals
        // are shown as a static "waiting" state instead of interactive buttons.
        map[tool.id] = 'pending_approval';
      }
    }
    return map;
  }, [isToolApprovalRequest, toolCallData, approvalDecision, readOnly]);

  // Check which parts we can render.
  // Since if we only have hidden parts in this message, we don't want to show anything here.
  // (e.g. tool call responses are rendered in the ToolArgumentsCard, so they aren't shown)
  const renderableParts = useMemo(() => {
    return message.parts.filter(p => {
      const isToolCallResponse = p.kind === 'data' && 'response' in p.data;
      return !isToolCallResponse;
    });
  }, [message]);

  // Skip tool call summary messages
  if (message.metadata?.originalType === 'ToolCallSummaryMessage') {
    return null;
  }

  // Hide raw ToolCallRequestEvent if there's a ToolApprovalRequest for the same tool ID.
  // Uses the pre-computed set from TaskBlock instead of scanning full history per message.
  const isSupersededToolCall = useMemo(() => {
    if (metadata?.originalType !== 'ToolCallRequestEvent' || !toolCallData) return false;
    if (!supersededToolIds || supersededToolIds.size === 0) return false;
    return toolCallData.some(t => supersededToolIds.has(t.id));
  }, [metadata, toolCallData, supersededToolIds]);

  if (isSupersededToolCall) {
    return null;
  }

  if (renderableParts.length === 0) {
    return null;
  }

  // Handle AskUserRequest messages — render the AskUserDisplay component
  if (isAskUserRequest && metadata?.askUserData) {
    const askData = metadata.askUserData;
    // In read-only contexts (e.g. subagent panels), always treat as resolved
    // so inputs are never interactive.
    const isResolved = readOnly || !!metadata.approvalDecision;
    const resolvedAnswers = metadata.askUserAnswers ?? null;

    return (
      <ChatMessageContainer>
        <FlexLayout wrap maxWidth={'700px'} gap={spacingPx.lg} mb={spacingPx.xl} alignItems='center'>
          <FlexLayout wrap gap={spacingPx.lg} alignItems='center'>
            <UserIconCircle imageUrl={senderProfileImageUrl} fullName={curUser.name} />
            <Text size={fontSizePx.sm} weight='semibold' color={colors.NEW_fontDimGray}>
              {senderName}
            </Text>
          </FlexLayout>
        </FlexLayout>
        <AskUserDisplay
          questions={askData.questions}
          onSubmit={answers => handleAskUserSubmit(answers)}
          isResolved={isResolved}
          resolvedAnswers={resolvedAnswers}
          subagentName={subagentName}
        />
      </ChatMessageContainer>
    );
  }

  const isUserMessage = senderRole === 'user';
  const hasRewindActions = !!invocationId && (!!onRewindToMessage || !!onForkFromMessage);
  // Enterprise action cluster (trace, rewind/fork) is injected by the host via the
  // renderUserMessageActions slot. In OSS there is no slot, so no actions render.
  const showActions = isUserMessage && !!renderUserMessageActions;

  const startEditing = () => {
    // Extract text from parts
    const text = message.parts
      .filter(p => p.kind === 'text')
      .map(p => (p as any).text)
      .join('\n');
    setEditText(text);
    setIsEditing(true);
  };

  const isEditTextEmpty = editText.trim() === '';

  const handleSaveEdit = () => {
    if (isEditTextEmpty) return;
    if (onRewindAndSend && invocationId) {
      onRewindAndSend(invocationId, editText);
    }
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <ChatMessageContainer>
        <FlexLayout wrap maxWidth={'700px'} gap={spacingPx.lg} mb={spacingPx.xl} alignItems='center'>
          <UserIconCircle imageUrl={senderProfileImageUrl} fullName={curUser.name} />
          <Text size={fontSizePx.sm} weight='semibold' color={colors.NEW_fontDimGray}>
            Editing {senderName}'s message
          </Text>
        </FlexLayout>
        <EditTextarea value={editText} onChange={e => setEditText(e.target.value)} />
        <FlexLayout wrap gap={spacingPx.sm} mt={spacingPx.sm} justifyContent='flex-end'>
          <Button onClick={() => setIsEditing(false)} variant='bare' color='gray'>
            Cancel
          </Button>
          <Button onClick={handleSaveEdit} variant='solid' color='purple' disabled={isEditTextEmpty}>
            Rewind & Send
          </Button>
        </FlexLayout>
      </ChatMessageContainer>
    );
  }

  // The shared message body (header + parts).
  // Rendered inside ChatMessageContainer in both the action and no-action paths.
  const messageBody = (
    <>
      {/* Message Header */}
      <FlexLayout wrap maxWidth={'700px'} gap={spacingPx.lg} mb={spacingPx.xl} alignItems='center'>
        <FlexLayout wrap gap={spacingPx.lg} alignItems='center'>
          <UserIconCircle imageUrl={senderProfileImageUrl} fullName={curUser.name} />
          <Text size={fontSizePx.sm} weight='semibold' color={colors.NEW_fontDimGray}>
            {senderName}
          </Text>
        </FlexLayout>
      </FlexLayout>

      {/* Message Parts — clickable for user messages to enter edit mode */}
      <TaskContainer
        onClick={isUserMessage && hasRewindActions && onRewindAndSend ? startEditing : undefined}
        css={
          isUserMessage && hasRewindActions && onRewindAndSend
            ? { cursor: 'pointer', '&:hover': { opacity: 0.7 }, '&:hover:active': { opacity: 0.5 } }
            : undefined
        }
        title={isUserMessage && hasRewindActions && onRewindAndSend ? 'Click to edit & rewind' : undefined}>
        {renderableParts.map((part, idx) => {
          // For ToolApprovalRequest messages, compute per-tool approval props
          const isToolCallRequest = metadata?.originalType === 'ToolCallRequestEvent';
          const toolId =
            (isToolApprovalRequest || isToolCallRequest) && part.kind === 'data'
              ? (((part.data as Record<string, unknown>)?.id as string) ?? '')
              : '';
          const approvalStatus = isToolApprovalRequest ? approvalStatusMap[toolId] : undefined;
          // isDecided = user has clicked approve/deny locally, but submission may still be pending
          // (e.g., waiting for other parallel tools to be decided before batch submit)
          const isDecided = !readOnly && isToolApprovalRequest && !!pendingDecisions[toolId];

          return (
            <MessagePartRenderer
              key={`${message.messageId}_${idx}`}
              task={task}
              message={message}
              part={part}
              messageId={message.messageId}
              partIndex={idx}
              approvalStatus={approvalStatus}
              isDecided={isDecided}
              onApprove={!readOnly && isToolApprovalRequest && toolId ? () => handleApprove(toolId) : undefined}
              onReject={
                !readOnly && isToolApprovalRequest && toolId
                  ? (reason?: string) => handleReject(toolId, reason)
                  : undefined
              }
              subagentName={isToolApprovalRequest ? subagentName : undefined}
              subagentSessionId={toolCallData?.find(t => t.id === toolId)?.subagent_session_id}
            />
          );
        })}
      </TaskContainer>
    </>
  );

  // User messages with actions: the injected slot is rendered as a fragment sibling of
  // ChatMessageContainer, making it a direct flex child of TaskContainer. Because
  // TaskContainer has position:relative and no overflow, a sticky anchor inside the slot
  // is bounded by the task — not the message.
  if (showActions) {
    return (
      <>
        {renderUserMessageActions!({
          task,
          message,
          invocationId,
          hasRewindActions,
          startEditing,
          onRewindToMessage,
          onForkFromMessage
        })}
        <ChatMessageContainer>{messageBody}</ChatMessageContainer>
      </>
    );
  }

  // Agent/tool messages, or user messages without an injected action slot: plain container.
  return <ChatMessageContainer>{messageBody}</ChatMessageContainer>;
};

export default MessageDisplay;
