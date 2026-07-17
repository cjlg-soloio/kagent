/**
 * @file ChatInput.tsx
 * @description Unified chat input component with optional advanced features.
 *
 * Consolidates functionality from:
 * - ChatPromptBox.tsx (KE) - Rainbow border, example cards, history navigation
 * - SharedChatInput.tsx (Common) - Simple input with cancel button
 *
 * The component can be used in two variants:
 * - 'rainbow' (default): Full featured with fancy styling
 * - 'simple': Minimal styling for embedded use
 *
 * @example
 * ```typescript
 * // Full featured input
 * <ChatInput
 *   onSend={handleSend}
 *   sessionId={sessionId}
 *   allUserMessages={previousMessages}
 *   variant="rainbow"
 *   showExampleCards
 *   exampleMessages={["What can you do?", "Help me with..."]}
 * />
 *
 * // Simple input
 * <ChatInput
 *   onSend={handleSend}
 *   variant="simple"
 *   placeholder="Type a message..."
 * />
 * ```
 */

import { css } from '@emotion/react';
import styled from '@emotion/styled';
import { Button, Card, FlexLayout, Text, Tooltip, UnstyledButton } from '@solo-io/ui-components-enterprise';
import { CardStyles, fontSizePx, spacingPx } from '@solo-io/ui-components-enterprise/styles';
import { useEventListener } from '@solo-io/ui-components-enterprise/utils';
import { Asset } from 'assets';
import { useCallback, useContext, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { colors } from 'Styles';
import { AppUtilsContext } from 'utils/context/AppUtilsContext';

import { useChatHistory } from 'Components/Chat/core/hooks/useChatHistory';
import {
  ButtonContainer,
  ChatInputCard,
  MeasurementTextArea,
  PROMPT_BOX_FONT_SIZE,
  SimpleInputContainer,
  StyledTextArea,
  TextAreaContainer
} from 'Components/Chat/core/components/ChatInput/ChatInput.styles';

// ----------------------------------------------------------------------------
// region Types
// ----------------------------------------------------------------------------

/**
 * Input variant determining styling and feature set.
 */
export interface ChatInputHandle {
  setText: (text: string) => void;
  focus: () => void;
}

export type ChatInputVariant = 'rainbow' | 'simple';

/**
 * Props for the ChatInput component.
 */
export interface ChatInputProps {
  // -------------------------------------------------------------------------
  // Core Props
  // -------------------------------------------------------------------------

  /** Callback when user sends a message */
  onSend?: (message: string) => void;

  /** Callback when user cancels (during sending) */
  onCancel?: () => void;

  /**
   * Whether the input is disabled.
   * Note: this doesn't disable the text input. It disables the ability to send.
   */
  disabled?: boolean;

  /** Whether a message is currently being sent */
  isSending?: boolean;

  /** Placeholder text */
  placeholder?: string;

  // -------------------------------------------------------------------------
  // Variant & Styling
  // -------------------------------------------------------------------------

  /**
   * Input variant.
   * - 'rainbow': Full featured with fancy border
   * - 'simple': Minimal styling
   * @default 'rainbow'
   */
  variant?: ChatInputVariant;

  /** Maximum width of the input container */
  maxWidth?: string;

  // -------------------------------------------------------------------------
  // History Navigation (Rainbow variant)
  // -------------------------------------------------------------------------

  /** Session ID for history tracking */
  sessionId?: string;

  /** Previous user messages for up/down navigation */
  allUserMessages?: string[];

  /**
   * Whether to enable history navigation with arrow keys.
   * @default true (when sessionId is provided)
   */
  enableHistory?: boolean;

  // -------------------------------------------------------------------------
  // Example Cards (Rainbow variant)
  // -------------------------------------------------------------------------

  /** Whether to show example message cards */
  showExampleCards?: boolean;

  /** Example messages to display as clickable cards */
  exampleMessages?: string[];

  // -------------------------------------------------------------------------
  // Advanced
  // -------------------------------------------------------------------------

  /** Override placeholder text (takes precedence over placeholder) */
  promptOverride?: string;

  /** Ref to access the chat input handle */
  innerRef?: React.Ref<ChatInputHandle>;

  /**
   * Custom render function for action buttons.
   * If provided, overrides default send/cancel buttons.
   */
  renderActions?: (props: {
    onSend: () => void;
    onCancel: () => void;
    canSend: boolean;
    isSending: boolean;
  }) => React.ReactNode;
}

// ----------------------------------------------------------------------------
// region Styled Components (Example Cards)
// ----------------------------------------------------------------------------

const ExampleMessageButton = styled(UnstyledButton)(() => {
  return css`
    display: contents;
    ${CardStyles.Card} {
      position: relative;
    }
    &:hover {
      ${CardStyles.Card} {
        background: #37373d;
      }
      &:active {
        ${CardStyles.Card} {
          background: #3f3f48ff;
        }
      }
    }
  `;
});

// ----------------------------------------------------------------------------
// region Component
// ----------------------------------------------------------------------------

/**
 * Unified chat input component.
 */
export const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  onCancel,
  disabled = false,
  isSending = false,
  placeholder = 'Ask something...',
  variant = 'rainbow',
  maxWidth = '770px',
  sessionId = '',
  allUserMessages = [],
  enableHistory = true,
  showExampleCards = false,
  exampleMessages = [],
  promptOverride,
  innerRef,
  renderActions
}) => {
  // -------------------------------------------------------------------------
  // region Refs
  // -------------------------------------------------------------------------

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hiddenTextRef = useRef<HTMLTextAreaElement>(null);

  // -------------------------------------------------------------------------
  // region History Navigation
  // -------------------------------------------------------------------------

  const historyEnabled = enableHistory && !!sessionId;
  const {
    currentText,
    setCurrentText,
    handleKeyDown: historyKeyDown,
    reset: resetHistory
  } = useChatHistory({
    messages: allUserMessages,
    sessionId: sessionId || 'default',
    enabled: historyEnabled
  });

  // For simple variant, use local state
  const [simpleText, setSimpleText] = useState('');
  const text = historyEnabled ? currentText : simpleText;
  const setText = historyEnabled ? setCurrentText : setSimpleText;

  useImperativeHandle(
    innerRef,
    () => ({
      setText: (value: string) => setText(value),
      focus: () => textareaRef.current?.focus()
    }),
    [setText]
  );

  // -------------------------------------------------------------------------
  // region Text Measurement (Rainbow variant)
  // -------------------------------------------------------------------------

  const [hasMultipleRows, setHasMultipleRows] = useState(false);
  const [numRows, setNumRows] = useState(1);
  const { measureText } = useContext(AppUtilsContext);

  useEffect(() => {
    if (variant !== 'rainbow' || !hiddenTextRef.current || text.trim().length < 2) {
      setHasMultipleRows(false);
      setNumRows(1);
      return;
    }

    // Check if on first row by measuring text width
    const textWidth = measureText(text, PROMPT_BOX_FONT_SIZE)?.width ?? 0;
    const containerWidth = textareaRef.current?.clientWidth ?? 500;

    if (textWidth < containerWidth) {
      setNumRows(1);
      return;
    }

    // Use hidden textarea to calculate rows for wrapped text
    setTimeout(() => {
      if (!hiddenTextRef.current) return;
      const newNumRows = Math.floor(hiddenTextRef.current.scrollHeight / 25);
      if (newNumRows > 1 && !hasMultipleRows) {
        setHasMultipleRows(true);
      }
      setNumRows(newNumRows);
    }, 0);
  }, [text, variant, measureText, hasMultipleRows]);

  // -------------------------------------------------------------------------
  // region Placeholder
  // -------------------------------------------------------------------------

  const firstExample = exampleMessages.length > 0 ? exampleMessages[0] : 'What can you do?';
  const effectivePlaceholder =
    promptOverride ?? (variant === 'rainbow' ? `Try asking: ${firstExample.substring(0, 30)}...` : placeholder);

  // -------------------------------------------------------------------------
  // region Send Handler
  // -------------------------------------------------------------------------

  const handleSend = useCallback(() => {
    if (disabled || !text.trim()) return;

    onSend?.(text.trim());

    // Reset input
    if (historyEnabled) {
      resetHistory();
    } else {
      setSimpleText('');
    }
  }, [disabled, text, onSend, historyEnabled, resetHistory]);

  // Enter key to send (without shift)
  useEventListener(
    window,
    'keydown',
    e => {
      if (e.key.toLowerCase() === 'enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // -------------------------------------------------------------------------
  // region Cancel Handler
  // -------------------------------------------------------------------------

  const handleCancel = useCallback(() => {
    if (historyEnabled) {
      resetHistory();
    } else {
      setSimpleText('');
    }
    onCancel?.();
  }, [historyEnabled, resetHistory, onCancel]);

  // -------------------------------------------------------------------------
  // region Key Handler
  // -------------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (disabled) return;

      // Pass to history handler for up/down navigation
      if (historyEnabled) {
        historyKeyDown(e);
      }
    },
    [disabled, historyEnabled, historyKeyDown]
  );

  // -------------------------------------------------------------------------
  // region Text Change
  // -------------------------------------------------------------------------

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      // Remove newlines for single-line behavior
      const newText = variant === 'rainbow' ? e.target.value.replaceAll('\n', ' ') : e.target.value;
      setText(newText);
    },
    [variant, setText]
  );

  // -------------------------------------------------------------------------
  // region Actions
  // -------------------------------------------------------------------------

  const canSend = text.trim().length > 0 && !disabled && !isSending;

  const defaultActions = isSending ? (
    <Tooltip placement='bottom' title='Cancel sending message'>
      <Button id='chat-cancel-button' color='black' rightIcon={<Asset.Stop width={16} />} onClick={handleCancel}>
        Cancel
      </Button>
    </Tooltip>
  ) : (
    <Tooltip placement='bottom' title='Send message (Enter)'>
      <Button
        id='chat-send-button'
        styleOverrides={css`
          min-width: unset;
        `}
        disabled={!canSend}
        color='black'
        rightIcon={<Asset.ArrowUp width={16} />}
        onClick={handleSend}
      />
    </Tooltip>
  );

  const actions = renderActions
    ? renderActions({ onSend: handleSend, onCancel: handleCancel, canSend, isSending })
    : defaultActions;

  // -------------------------------------------------------------------------
  // region Render - Rainbow Variant
  // -------------------------------------------------------------------------

  if (variant === 'rainbow') {
    return (
      <>
        {/* Hidden textarea for measurement */}
        <MeasurementTextArea
          widthPx={textareaRef.current?.getBoundingClientRect().width ?? 500}
          ref={hiddenTextRef}
          readOnly
          value={text}
        />

        <FlexLayout wrap justifyContent='center' width='100%'>
          <ChatInputCard
            hasMultipleRows={hasMultipleRows}
            showRainbowBorder={true}
            maxWidth={maxWidth}
            boxShadowType='rainbow'
            width='100%'
            onClick={() => textareaRef.current?.focus()}>
            <TextAreaContainer>
              <StyledTextArea
                id='chat-input'
                ref={textareaRef}
                variant='rainbow'
                value={text}
                rows={numRows}
                onKeyDown={handleKeyDown}
                placeholder={effectivePlaceholder}
                onChange={handleTextChange}
              />
            </TextAreaContainer>
            <ButtonContainer>{actions}</ButtonContainer>
          </ChatInputCard>

          {/* Example Cards */}
          {showExampleCards && exampleMessages.length > 0 && (
            <FlexLayout mt='29px' flexWrap='nowrap' gap={spacingPx.xl}>
              {exampleMessages.map(msg => (
                <ExampleMessageButton key={msg} onClick={() => setText(msg)}>
                  <Card height='unset'>
                    <Text color={colors.NEW_fontWhite} size={fontSizePx.xs} weight='normal' lineHeight='20px'>
                      {msg}
                    </Text>
                  </Card>
                </ExampleMessageButton>
              ))}
            </FlexLayout>
          )}
        </FlexLayout>
      </>
    );
  }

  // -------------------------------------------------------------------------
  // region Render - Simple Variant
  // -------------------------------------------------------------------------

  return (
    <FlexLayout
      flexDirection='column'
      gap={spacingPx.sm}
      padding={`${spacingPx.md} 0`}
      style={{
        borderTop: `1px solid ${colors.slate700}`,
        backgroundColor: colors.slate800
      }}>
      <SimpleInputContainer>
        <StyledTextArea
          ref={textareaRef}
          variant='simple'
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder={isSending ? 'Sending...' : effectivePlaceholder}
          style={{ minHeight: '60px' }}
        />
        {actions}
      </SimpleInputContainer>
    </FlexLayout>
  );
};

export default ChatInput;
