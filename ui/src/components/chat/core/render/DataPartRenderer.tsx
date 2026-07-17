import { DataPart, Message, Task } from '@a2a-js/sdk';
import styled from '@emotion/styled';
import { Button, Card, CodeSyntaxHighlighter, FlexLayout, Spacer, Text } from '@solo-io/ui-components-enterprise';
import { fontSizePx, spacingPx } from '@solo-io/ui-components-enterprise/styles';
import { useMemo, useState } from 'react';
import { colors } from 'Styles';
import { useSubagentActivityPanel } from 'Components/Chat/oss-plugins/subagent/SubagentActivityPanelContext';
import { convertToUserFriendlyName } from 'Components/Chat/core/render/helpers/messageHelpers';
import { processToolCallMessage } from 'Components/Chat/core/render/helpers/toolHelpers';
import SubagentActivityPanel from 'Components/Chat/oss-plugins/subagent/SubagentActivityPanel';
import ToolCallResponsePartRenderer from 'Components/Chat/core/render/ToolCallResponsePartRenderer';

//
// region Types
//
export type ApprovalStatus = 'pending_approval' | 'approved' | 'rejected';

interface DataPartRendererProps {
  task: Task;
  message: Message;
  part: DataPart;
  approvalStatus?: ApprovalStatus;
  isDecided?: boolean; // decided locally but batch not yet submitted
  onApprove?: () => void;
  onReject?: (reason?: string) => void;
  subagentName?: string;
  subagentSessionId?: string;
}

//
// region Styled
//
const ApprovalBadge = styled.div<{ variant: 'approved' | 'rejected' }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 600;
  background: ${({ variant }) => (variant === 'approved' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)')};
  color: ${({ variant }) => (variant === 'approved' ? '#22c55e' : '#ef4444')};
`;

const RejectionTextarea = styled.textarea`
  width: 100%;
  min-height: 60px;
  padding: 8px;
  border-radius: 4px;
  border: 1px solid ${colors.gray300};
  background: ${colors.NEW_background};
  color: ${colors.NEW_fontWhite};
  font-size: 13px;
  resize: vertical;
`;

const WaitingText = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  font-size: 13px;
  color: ${colors.zinc500};
`;

export type ToolCallResponseType = {
  /**
   * Based off some testing, it seems that the following is true.
   *
   * If result is a string, then it could be:
   * - A markdown tool response.
   * - A serialized `ToolCallChainedResponseType`.
   *
   * If result is an object, then it is:
   * - The code result of a tool call.
   */
  result?:
    | string
    | {
        content: { text: string; type: string }[];
        isError: boolean;
      };
};

/**
 * The type that is serialized and returned in a `response.result`,
 * as the final tool call result, if the task included a chain of tool calls.
 */
export type ToolCallChainedResponseType = {
  id: string;
  name: string;
  response: ToolCallResponseType;
};

/**
 * Returns the `response` object which matches up with the
 * passed in tool call `part`.
 */
const getToolCallResponse = (task: Task, part: DataPart) => {
  const data = part.data;
  const toolCallId = data.id as string | undefined;
  const toolCallName = data.name as string | undefined;

  let foundToolCallResponse: ToolCallResponseType | undefined = undefined;
  if (!task.history) {
    return foundToolCallResponse;
  }

  // Tries to get the corresponding tool call response event from this task.
  for (let i = 0; i < task.history.length; i++) {
    // We must process the historical message to unpack synthetic metadata into raw DataParts
    const curMsg = processToolCallMessage(task.history[i]);
    for (let j = 0; j < curMsg.parts.length; j++) {
      const curPart = curMsg.parts[j];
      if (curPart?.kind == 'data' && 'response' in curPart.data && !!curPart.data.response) {
        const responseId = curPart.data.id as string | undefined;
        const responseName = curPart.data.name as string | undefined;

        const matchById = toolCallId && responseId && responseId === toolCallId;
        // If both sides have IDs, only match by ID to avoid cross-matching
        // parallel tool calls that share the same name (e.g., two k8s-get-resources calls)
        const bothHaveIds = !!(toolCallId && responseId);
        const matchByName = !bothHaveIds && toolCallName && responseName && responseName === toolCallName;

        if (matchById || matchByName) {
          const response = curPart.data.response as Record<string, unknown>;
          if (response && typeof response === 'object' && 'result' in response) {
            foundToolCallResponse = response as ToolCallResponseType;
          } else {
            foundToolCallResponse = { result: response as ToolCallResponseType['result'] };
          }
          break;
        }
      }
    }
  }
  return foundToolCallResponse;
};

//
// region Component
//

const DataPartRenderer = ({
  task,
  part,
  approvalStatus,
  isDecided,
  onApprove,
  onReject,
  subagentName,
  subagentSessionId
}: DataPartRendererProps) => {
  const data = part.data;
  const id = (data.id as string) ?? '';
  const name = (data.name as string) ?? '';
  const args = (data.args as Record<string, unknown>) ?? {};
  const { isPanelOpen, setPanelOpen } = useSubagentActivityPanel();
  const showActivity = isPanelOpen(task.contextId, id);

  const toolCallResponse = useMemo(() => getToolCallResponse(task, part), [task, part]);

  // Rejection reason state (only used when user clicks Reject)
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  //
  // region Render
  //
  return (
    <Card width={'100vw'} maxWidth={'100%'} padding={spacingPx.xl3} height={'fit-content'}>
      {/* Tool Header */}
      <FlexLayout wrap justifyContent='space-between' alignItems='center'>
        <FlexLayout wrap gap={spacingPx.sm} alignItems='center'>
          <Text color={colors.zinc500} size={fontSizePx.md}>
            {subagentSessionId ? 'Subagent:' : 'Tool:'}
          </Text>
          <Text color={colors.NEW_fontWhite} size={fontSizePx.md}>
            {convertToUserFriendlyName(name)}
          </Text>
          {subagentName && (
            <Text color={colors.zinc500} size={fontSizePx.sm}>
              via {convertToUserFriendlyName(subagentName)} subagent
            </Text>
          )}
        </FlexLayout>
        <Text size={fontSizePx.sm} color={colors.zinc500}>
          {id}
        </Text>
      </FlexLayout>

      {/* Arguments Section */}
      <Text mt={spacingPx.sm} color={colors.zinc500} size={fontSizePx.sm} weight='bold'>
        Arguments
      </Text>
      <Spacer mt={spacingPx.lg}>
        <CodeSyntaxHighlighter maxHeight={500} contentString={JSON.stringify(args, null, 2)} type={'json'} />
      </Spacer>

      {/* Approval Status / Buttons */}
      {approvalStatus === 'approved' && (
        <Spacer mt={spacingPx.lg}>
          <ApprovalBadge variant='approved'>Approved</ApprovalBadge>
        </Spacer>
      )}
      {approvalStatus === 'rejected' && (
        <Spacer mt={spacingPx.lg}>
          <ApprovalBadge variant='rejected'>Rejected</ApprovalBadge>
        </Spacer>
      )}
      {approvalStatus === 'pending_approval' && !isDecided && (
        <Spacer mt={spacingPx.lg}>
          {!showRejectInput ? (
            <FlexLayout wrap gap={spacingPx.md} alignItems='center'>
              <Button variant='solid' color='purple' size='sm' onClick={() => onApprove?.()}>
                Approve
              </Button>
              <Button variant='solid' color='red' size='sm' onClick={() => setShowRejectInput(true)}>
                Reject
              </Button>
            </FlexLayout>
          ) : (
            <FlexLayout flexDirection='column' gap={spacingPx.sm}>
              <Text color={colors.zinc500} size={fontSizePx.sm}>
                Rejection reason (optional):
              </Text>
              <RejectionTextarea
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                placeholder='Enter reason for rejection...'
              />
              <FlexLayout wrap gap={spacingPx.sm}>
                <Button
                  variant='solid'
                  color='red'
                  size='sm'
                  onClick={() => {
                    onReject?.(rejectionReason || undefined);
                    setShowRejectInput(false);
                  }}>
                  Confirm Reject
                </Button>
                <Button
                  variant='bare'
                  color='gray'
                  size='sm'
                  onClick={() => {
                    setShowRejectInput(false);
                    setRejectionReason('');
                  }}>
                  Cancel
                </Button>
              </FlexLayout>
            </FlexLayout>
          )}
        </Spacer>
      )}
      {isDecided && approvalStatus === 'pending_approval' && (
        <Spacer mt={spacingPx.lg}>
          <WaitingText>Waiting for other tools...</WaitingText>
        </Spacer>
      )}

      {/* Results Section — hide only while awaiting approval */}
      {approvalStatus !== 'pending_approval' && <ToolCallResponsePartRenderer response={toolCallResponse} />}

      {/* Subagent Activity Toggle + Panel */}
      {subagentSessionId && (
        <Spacer mt={spacingPx.lg}>
          <Button variant='bare' color='gray' size='sm' onClick={() => setPanelOpen(task.contextId, id, !showActivity)}>
            {showActivity ? 'Hide' : 'Show'} subagent activity
          </Button>
          {showActivity && (
            <Spacer mt={spacingPx.sm}>
              <SubagentActivityPanel
                sessionId={subagentSessionId}
                isComplete={approvalStatus !== 'pending_approval' && !!toolCallResponse}
              />
            </Spacer>
          )}
        </Spacer>
      )}
    </Card>
  );
};

export default DataPartRenderer;
