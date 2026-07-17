import { Task } from '@a2a-js/sdk';
import { css } from '@emotion/react';
import styled from '@emotion/styled';
import { Button, Card, FlexLayout, Spacer, Text, Tooltip, UserIconCircle } from '@solo-io/ui-components-enterprise';
import { fontSizePx, spacingPx } from '@solo-io/ui-components-enterprise/styles';
import { useEventListener } from '@solo-io/ui-components-enterprise/utils';
import { Asset } from 'assets';
import { AuthContext } from 'context/AuthContext';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { colors } from 'Styles';
import { zIndex } from 'Styles/zIndex';
import { basePathNoSuffixSlash } from 'utils/environment-variables';
import { LoadingIndicator } from 'Components/Chat/core/components/LoadingIndicator/LoadingIndicator';
import { ChatState } from 'Components/Chat/core/state/ChatStateMachine';

export interface ChatTasksDisplayProps {
  /** Array of completed tasks to display */
  tasks: Task[] | undefined;

  /** Currently streaming task (if any) */
  streamingTask?: Task;

  /** Whether tasks are being loaded */
  isLoading?: boolean;

  /** Custom task renderer - receives task and whether it's streaming */
  renderTask: (task: Task, isStreaming: boolean) => React.ReactNode;

  /** Custom loading indicator */
  renderLoader?: () => React.ReactNode;

  /** Custom empty state */
  renderEmptyState?: () => React.ReactNode;

  /** Optional: Additional content to render above tasks (e.g., trace buttons) */
  renderTaskHeader?: (task: Task) => React.ReactNode;

  /** The current state of the chat */
  chatState?: ChatState;

  /** Dependencies that trigger scroll to bottom */
  scrollTriggerDeps?: any[];
}

// stylized scroll bar
const ScrollableArea = styled(FlexLayout)`
  scrollbar-color: ${colors.NEW_chatAgentScrollbarColor} transparent;
  :hover:active {
    scrollbar-color: ${colors.NEW_chatAgentScrollbarActiveColor} transparent;
  }
  padding-right: ${spacingPx.xl4};
  padding-bottom: ${spacingPx.xl10};
  isolation: isolate;
`;

// chat scroll wrapper
const ChatScrollWrapper = styled.div`
  position: relative;
  width: 100%;
  flex-grow: 1;
  overflow: hidden;
`;

/**
 * Reusable component for displaying chat tasks with scroll management.
 * Handles the presentation layer of task lists without managing API calls.
 */
export const ChatTasksDisplay = ({
  tasks,
  streamingTask,
  chatState,
  isLoading = false,
  renderTask,
  renderLoader,
  renderEmptyState,
  renderTaskHeader,
  scrollTriggerDeps = []
}: ChatTasksDisplayProps) => {
  //
  // region Refs & State
  //
  const scrollableAreaRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const isSentinelVisibleRef = useRef(true);
  const [showScrollToBottomButton, setShowScrollToBottomButton] = useState(false);
  const [scrollToBottomContainerWidth, setScrollToBottomContainerWidth] = useState('100%');

  const { curUser } = useContext(AuthContext);

  //
  // region Scroll Management
  //

  const scrollToBottom = useCallback((smooth = true) => {
    const el = scrollableAreaRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
    isSentinelVisibleRef.current = true;
    setShowScrollToBottomButton(false);
  }, []);

  // Track whether the user is at the bottom via IntersectionObserver on the sentinel.
  useEffect(() => {
    const container = scrollableAreaRef.current;
    const sentinel = bottomSentinelRef.current;
    if (!container || !sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        isSentinelVisibleRef.current = entry.isIntersecting;
        setShowScrollToBottomButton(!entry.isIntersecting);
      },
      { root: container, threshold: 0 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // On resize: update button width, and if sticky to bottom, scroll sentinel into view.
  const handleResize = useCallback(() => {
    setScrollToBottomContainerWidth(
      scrollableAreaRef.current?.clientWidth ? scrollableAreaRef.current.clientWidth + 'px' : '100%'
    );
    if (isSentinelVisibleRef.current) {
      const el = scrollableAreaRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    const el = scrollableAreaRef.current;
    if (!el) return;
    const observer = new ResizeObserver(handleResize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleResize]);

  useEffect(() => handleResize(), [handleResize]);
  useEventListener(window, 'resize', handleResize, [handleResize]);

  // Auto-scroll when tasks change or when loading/streaming state changes
  useEffect(() => {
    const el = scrollableAreaRef.current;
    if (!el) return;
    // Always scroll when streaming or there are tasks
    if (tasks?.length || streamingTask || chatState === ChatState.SENDING || chatState === ChatState.STREAMING) {
      scrollToBottom();
    }
  }, [scrollToBottom, tasks?.length, streamingTask, chatState, ...scrollTriggerDeps]);

  //
  // region Merged Tasks (avoid duplicates between completed and streaming)
  //
  const displayTasks = useMemo(() => {
    if (!tasks) return [];

    // Filter out any completed task that matches the streaming task ID
    // This prevents duplicates when the streaming task gets persisted
    return tasks.filter(task => {
      if (!streamingTask) return true;
      const isStreamingTask = task.id === streamingTask.id;
      if (isStreamingTask) {
        // Check if messages are different to avoid duplicate first-message problem
        return task.history?.at(0)?.messageId !== streamingTask.history?.at(0)?.messageId;
      }
      return true;
    });
  }, [tasks, streamingTask]);

  //
  // region Empty State
  //
  const shouldShowEmptyState = useMemo(() => {
    return (
      tasks !== undefined &&
      tasks.length === 0 &&
      !streamingTask &&
      !isLoading &&
      !displayTasks.length &&
      chatState === ChatState.IDLE
    );
  }, [tasks, streamingTask, isLoading, displayTasks, chatState]);

  const defaultEmptyState = (
    <FlexLayout wrap justifyContent='center' width='100%' pt={'20%'}>
      <Card maxWidth={'400px'} padding={spacingPx.xl2}>
        <FlexLayout wrap justifyContent='flex-start'>
          <Text size={fontSizePx.md} weight='bold' pb={spacingPx.md}>
            Start a conversation
          </Text>
          <Text color={colors.NEW_fontDimGray}>
            To begin chatting with the agent, type your message in the input box below.
          </Text>
        </FlexLayout>
      </Card>
    </FlexLayout>
  );

  //
  // region Render
  //
  return (
    <ChatScrollWrapper>
      <ScrollableArea
        ref={scrollableAreaRef}
        position='relative'
        flexDirection='column'
        alignItems='flex-start'
        flexWrap='nowrap'
        pt={'80px'}
        pb={'16px'}
        gap={'29px'}
        width={'100%'}
        height={'100%'}
        flexGrow={1}
        overflow={'auto'}>
        {/* Empty State */}
        {shouldShowEmptyState && (renderEmptyState ? renderEmptyState() : defaultEmptyState)}

        {/* Completed Tasks */}
        {displayTasks.map(task => (
          <div key={task.id} style={{ width: '100%', maxWidth: '100%' }}>
            {renderTaskHeader?.(task)}
            {renderTask(task, false)}
          </div>
        ))}

        {/* Streaming Task */}
        {streamingTask && (
          <div style={{ width: '100%', maxWidth: '100%' }}>
            {renderTaskHeader?.(streamingTask)}
            {renderTask(streamingTask, true)}
          </div>
        )}

        {/* Additional Streaming Indicators */}
        {chatState === ChatState.SENDING && (
          <>
            <LoadingIndicator baseText={'Sending'} />
          </>
        )}
        {chatState === ChatState.STREAMING && (
          <>
            <FlexLayout wrap maxWidth={'700px'} gap={spacingPx.lg} alignItems='center'>
              <UserIconCircle imageUrl={`${basePathNoSuffixSlash}/agent-chat-icon.png`} fullName={curUser.name} />
              <Text size={fontSizePx.sm} weight='semibold' color={colors.NEW_fontDimGray}>
                Agent
              </Text>
            </FlexLayout>
            <LoadingIndicator baseText={'Thinking'} />
          </>
        )}

        {/* Loading State */}
        {isLoading && renderLoader?.()}

        {/* Scroll anchor — IntersectionObserver tracks this to detect "at bottom". */}
        <div
          ref={bottomSentinelRef}
          aria-hidden
          style={{ height: '1px', lineHeight: 0, visibility: 'hidden', pointerEvents: 'none' }}
        />

        {/* Scroll to Bottom Button */}
        {showScrollToBottomButton && (
          <Spacer
            stylingOverrides={css`
              position: fixed;
              bottom: 100px;
              width: ${scrollToBottomContainerWidth};
              display: flex;
              justify-content: center;
              z-index: ${zIndex.tooltip};
            `}>
            <Tooltip title='Scroll to bottom'>
              <Button
                variant='solid'
                color='gray'
                leftIcon={<Asset.ChevronDown width={16} />}
                onClick={() => scrollToBottom()}
                styleOverrides={css`
                  padding: 0px;
                  width: 35px;
                  height: 35px;
                  min-width: unset;
                `}
              />
            </Tooltip>
          </Spacer>
        )}
      </ScrollableArea>
    </ChatScrollWrapper>
  );
};
