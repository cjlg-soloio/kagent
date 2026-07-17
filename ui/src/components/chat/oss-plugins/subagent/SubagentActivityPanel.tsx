import { Task } from '@a2a-js/sdk';
import styled from '@emotion/styled';
import { FlexLayout, Text } from '@solo-io/ui-components-enterprise';
import { fontSizePx, spacingPx } from '@solo-io/ui-components-enterprise/styles';
import { BaseResponse } from 'Api/external/kagent/types';
import { kagentApi } from 'Api/kagent';
import { getBaseResponseData } from 'Api/utils/helpers';
import { LoadingIndicator } from 'Components/Chat/core/components/LoadingIndicator/LoadingIndicator';
import { AgentContext } from 'Components/Features/KE/Agents/context/AgentContext';
import { AuthContext } from 'context/AuthContext';
import { createContext, useCallback, useContext, useMemo } from 'react';
import { colors } from 'Styles';
import { HitlProvider } from 'Components/Chat/oss-plugins/hitl/HitlContext';
import TaskBlock from 'Components/Chat/core/render/TaskBlock';
import { processTasksForHitl } from 'Components/Chat/oss-plugins/hitl/hitlHelpers';

// ---------------------------------------------------------------------------
// region  Activity Depth Context — prevents infinite recursion
// ---------------------------------------------------------------------------

const MAX_ACTIVITY_DEPTH = 3;
export const ActivityDepthContext = createContext(0);

// ---------------------------------------------------------------------------
// region  Styles
// ---------------------------------------------------------------------------

const ActivityContainer = styled.div`
  border-left: 2px solid ${colors.zinc700};
  padding-left: 12px;
  margin-top: 8px;
`;

// ---------------------------------------------------------------------------
// region  Component
// ---------------------------------------------------------------------------

interface SubagentActivityPanelProps {
  sessionId: string;
  isComplete: boolean;
}

const SubagentActivityPanel = ({ sessionId, isComplete }: SubagentActivityPanelProps) => {
  const depth = useContext(ActivityDepthContext);
  const { curAgentRef } = useContext(AgentContext);
  const { curUser } = useContext(AuthContext);

  // No-op submit handler — subagent panels are always read-only for HITL.
  const noop = useCallback(() => {}, []);

  // Poll every 2s while the subagent is still running; stop when complete.
  const clusterNames = curAgentRef?.cluster ? [curAgentRef.cluster] : [];
  const { data: tasksResp, error } = kagentApi.useGetTasksForSession(clusterNames, sessionId, curUser.id, {
    refreshInterval: isComplete ? 0 : 2000
  });

  const rawTasks = useMemo(() => {
    if (!tasksResp?.[0]) return undefined;
    return getBaseResponseData(tasksResp[0] as BaseResponse<any[]>) ?? [];
  }, [tasksResp]);

  // Process tasks through the same HITL pipeline used by the main chat view.
  // This decomposes messages, builds approval cards, and filters decision messages.
  const processedTasks = useMemo<Task[]>(() => {
    if (!rawTasks || rawTasks.length === 0) return [];
    const { processedTasks: tasks } = processTasksForHitl(rawTasks);
    return tasks;
  }, [rawTasks]);

  // Determine if the subagent is still running based on its own task status
  const subagentStillRunning = useMemo(() => {
    if (isComplete) return false;
    for (const t of processedTasks) {
      const state = t.status?.state;
      if (state && state !== 'completed' && state !== 'failed' && state !== 'canceled') {
        return true;
      }
    }
    // No tasks yet or all completed — keep polling if parent says not complete
    return processedTasks.length === 0;
  }, [isComplete, processedTasks]);

  // Depth guard
  if (depth >= MAX_ACTIVITY_DEPTH) {
    return (
      <Text color={colors.zinc500} size={fontSizePx.sm}>
        Subagent activity (max depth reached)
      </Text>
    );
  }

  const loading = rawTasks === undefined && !error;

  if (loading) {
    return (
      <FlexLayout wrap gap={spacingPx.sm} alignItems='center'>
        <LoadingIndicator baseText='Loading subagent activity' />
      </FlexLayout>
    );
  }

  if (error) {
    return (
      <Text color={colors.zinc500} size={fontSizePx.sm}>
        Failed to load subagent activity
      </Text>
    );
  }

  if (processedTasks.every(t => !t.history?.length)) {
    return (
      <Text color={colors.zinc500} size={fontSizePx.sm}>
        No subagent activity yet
      </Text>
    );
  }

  // Wrap in a read-only HitlProvider
  return (
    <HitlProvider pendingApproval={null} onSubmitDecisions={noop} readOnly>
      <ActivityDepthContext.Provider value={depth + 1}>
        <ActivityContainer>
          {processedTasks.map(task => (
            <TaskBlock key={task.id} task={task} />
          ))}
          {subagentStillRunning && (
            <FlexLayout wrap gap={spacingPx.sm} alignItems='center'>
              <LoadingIndicator baseText='Subagent is still running' />
            </FlexLayout>
          )}
        </ActivityContainer>
      </ActivityDepthContext.Provider>
    </HitlProvider>
  );
};

export default SubagentActivityPanel;
