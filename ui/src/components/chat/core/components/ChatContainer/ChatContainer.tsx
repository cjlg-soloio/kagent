/**
 * @file ChatContainer.tsx
 * @description Scrollable chat container component with auto-scroll and empty state.
 *
 * A flexible container for displaying chat messages with:
 * - Auto-scroll to bottom on new messages
 * - "Scroll to bottom" button
 * - Empty state display
 * - Loading indicator
 *
 * Uses render props for maximum flexibility in message rendering.
 *
 * @example
 * ```typescript
 * <ChatContainer
 *   showEmptyState={messages.length === 0}
 *   isLoading={isLoading}
 *   loadingText="Agent is thinking..."
 * >
 *   {messages.map(msg => <Message key={msg.id} message={msg} />)}
 * </ChatContainer>
 * ```
 */

import { css, SerializedStyles } from '@emotion/react';
import { Button, Card, FlexLayout, Spacer, Text, Tooltip } from '@solo-io/ui-components-enterprise';
import { fontSizePx, spacingPx } from '@solo-io/ui-components-enterprise/styles';
import { Asset } from 'assets';
import { colors } from 'Styles';
import { zIndex } from 'Styles/zIndex';

import { useScrollBehavior } from 'Components/Chat/core/hooks/useScrollBehavior';

// ----------------------------------------------------------------------------
// region Types
// ----------------------------------------------------------------------------

/**
 * Props for the ChatContainer component.
 */
export interface ChatContainerProps {
  stylingOverrides?: SerializedStyles;
  /** Child elements (message list) */
  children: React.ReactNode;

  /**
   * Whether to show the empty state.
   * When true, children are hidden and empty state is shown.
   */
  showEmptyState?: boolean;

  /** Title for the empty state card */
  emptyStateTitle?: string;

  /** Message for the empty state card */
  emptyStateMessage?: string;

  /** Whether a loading indicator should be shown */
  isLoading?: boolean;

  /** Text to display in the loading indicator */
  loadingText?: string;

  /**
   * Height of the container.
   * @default 'calc(100% - 264px)'
   */
  height?: string;

  /**
   * Dependencies that trigger auto-scroll.
   * Pass values that change when new messages arrive.
   */
  scrollTriggerDeps?: unknown[];

  /**
   * Custom render function for the empty state.
   * If provided, overrides default empty state rendering.
   */
  renderEmptyState?: () => React.ReactNode;

  /**
   * Custom render function for the loading indicator.
   * If provided, overrides default loading indicator.
   */
  renderLoading?: () => React.ReactNode;

  /**
   * Custom render function for the scroll-to-bottom button.
   * If provided, overrides default button.
   */
  renderScrollButton?: (onClick: () => void) => React.ReactNode;
}

// ----------------------------------------------------------------------------
// region Component
// ----------------------------------------------------------------------------

/**
 * Scrollable chat container with auto-scroll and UI helpers.
 */
export const ChatContainer: React.FC<ChatContainerProps> = ({
  children,
  showEmptyState = false,
  emptyStateTitle = 'Start a conversation',
  emptyStateMessage = 'To begin chatting with the agent, type your message in the input box below.',
  isLoading = false,
  loadingText = 'Thinking...',
  stylingOverrides,
  scrollTriggerDeps = [],
  renderEmptyState,
  renderLoading,
  renderScrollButton
}) => {
  // -------------------------------------------------------------------------
  // region Scroll Behavior
  // -------------------------------------------------------------------------

  const { scrollableRef, bottomSentinelRef, showScrollButton, buttonContainerWidth, scrollToBottom } =
    useScrollBehavior({
      autoScrollOnChange: true,
      scrollTriggerDeps
    });

  // -------------------------------------------------------------------------
  // region Empty State
  // -------------------------------------------------------------------------

  const defaultEmptyState = (
    <FlexLayout wrap justifyContent='center' pt='20%' width='100%'>
      <Card maxWidth='400px' padding={spacingPx.xl2}>
        <FlexLayout wrap justifyContent='flex-start'>
          <Text size={fontSizePx.md} weight='bold' pb={spacingPx.md}>
            {emptyStateTitle}
          </Text>
          <Text color={colors.NEW_fontDimGray}>{emptyStateMessage}</Text>
        </FlexLayout>
      </Card>
    </FlexLayout>
  );

  const emptyStateContent = renderEmptyState ? renderEmptyState() : defaultEmptyState;

  // -------------------------------------------------------------------------
  // region Loading Indicator
  // -------------------------------------------------------------------------

  const defaultLoading = (
    <FlexLayout wrap justifyContent='flex-start' padding={spacingPx.sm}>
      <Text size={fontSizePx.sm} color={colors.zinc400}>
        {loadingText}
      </Text>
    </FlexLayout>
  );

  const loadingContent = renderLoading ? renderLoading() : defaultLoading;

  // -------------------------------------------------------------------------
  // region Scroll Button
  // -------------------------------------------------------------------------

  const defaultScrollButton = (
    <Tooltip title='Scroll to bottom'>
      <Button
        variant='solid'
        color='gray'
        leftIcon={<Asset.ChevronDown width={16} />}
        onClick={scrollToBottom}
        styleOverrides={css`
          padding: 0px;
          width: 35px;
          height: 35px;
          min-width: unset;
        `}
      />
    </Tooltip>
  );

  const scrollButtonContent = renderScrollButton ? renderScrollButton(scrollToBottom) : defaultScrollButton;

  // -------------------------------------------------------------------------
  // region Render
  // -------------------------------------------------------------------------

  return (
    <FlexLayout
      ref={scrollableRef}
      position='relative'
      flexDirection='column'
      alignItems='flex-start'
      flexWrap='nowrap'
      pt={spacingPx.xl}
      gap='29px'
      width='100%'
      flexGrow={1}
      overflow='auto'
      stylingOverrides={stylingOverrides}>
      {/* Main Content */}
      {showEmptyState ? emptyStateContent : children}

      {/* Loading Indicator */}
      {isLoading && loadingContent}

      {/* Scroll anchor — IntersectionObserver tracks this to detect "at bottom" */}
      <div ref={bottomSentinelRef} />

      {/* Scroll to Bottom Button */}
      {showScrollButton && (
        <Spacer
          stylingOverrides={css`
            position: fixed;
            bottom: 100px;
            width: ${buttonContainerWidth};
            display: flex;
            justify-content: center;
            z-index: ${zIndex.tooltip};
          `}>
          {scrollButtonContent}
        </Spacer>
      )}
    </FlexLayout>
  );
};

export default ChatContainer;
