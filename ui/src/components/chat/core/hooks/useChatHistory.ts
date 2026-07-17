/**
 * @file useChatHistory.ts
 * @description React hook for message history navigation with arrow keys.
 *
 * Enables users to navigate through their previous messages using
 * up/down arrow keys, similar to terminal command history.
 *
 * Extracted from ChatPromptBox.tsx.
 *
 * @example
 * ```typescript
 * const { currentText, setCurrentText, handleKeyDown } = useChatHistory({
 *   messages: allUserMessages,
 *   sessionId: 'session-123',
 * });
 *
 * return (
 *   <textarea
 *     value={currentText}
 *     onChange={e => setCurrentText(e.target.value)}
 *     onKeyDown={handleKeyDown}
 *   />
 * );
 * ```
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// ----------------------------------------------------------------------------
// region Hook Options
// ----------------------------------------------------------------------------

/**
 * Options for useChatHistory hook.
 */
export interface UseChatHistoryOptions {
  /** Array of previous user messages */
  messages: string[];

  /** Current session ID (for tracking per-session state) */
  sessionId: string;

  /**
   * Whether history navigation is enabled.
   * @default true
   */
  enabled?: boolean;
}

/**
 * Return type for useChatHistory hook.
 */
export interface UseChatHistoryReturn {
  /** Current text value */
  currentText: string;

  /** Set the current text (used for controlled input) */
  setCurrentText: (text: string) => void;

  /** Callback for handling key down events */
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;

  /** Current message index (undefined = at input buffer) */
  currentIndex: number | undefined;

  /** Reset to empty input buffer */
  reset: () => void;
}

// ----------------------------------------------------------------------------
// region Hook Implementation
// ----------------------------------------------------------------------------

/**
 * React hook for arrow-key message history navigation.
 */
export function useChatHistory(options: UseChatHistoryOptions): UseChatHistoryReturn {
  const { messages, sessionId, enabled = true } = options;

  // -------------------------------------------------------------------------
  // region State
  // -------------------------------------------------------------------------

  /** Current displayed text */
  const [currentText, setCurrentTextState] = useState('');

  /** Per-session text buffers (what user was typing before navigating) */
  const sessionTextBuffers = useRef<Record<string, string>>({});

  /** Per-session message index (undefined = at buffer, number = in history) */
  const sessionMsgIndex = useRef<Record<string, number | undefined>>({});

  // -------------------------------------------------------------------------
  // region Helpers
  // -------------------------------------------------------------------------

  /**
   * Get the text buffer for the current session.
   */
  const getSessionBuffer = useCallback((): string => {
    return sessionTextBuffers.current[sessionId] ?? '';
  }, [sessionId]);

  /**
   * Get the current message index for this session.
   */
  const getCurrentIndex = useCallback((): number | undefined => {
    return sessionMsgIndex.current[sessionId];
  }, [sessionId]);

  /**
   * Set the current text and update the session buffer.
   */
  const setCurrentText = useCallback(
    (text: string) => {
      setCurrentTextState(text);
      // When user types, save to buffer and reset index
      sessionTextBuffers.current[sessionId] = text;
      sessionMsgIndex.current[sessionId] = undefined;
    },
    [sessionId]
  );

  /**
   * Reset the input state for the current session.
   */
  const reset = useCallback(() => {
    sessionTextBuffers.current[sessionId] = '';
    sessionMsgIndex.current[sessionId] = undefined;
    setCurrentTextState('');
  }, [sessionId]);

  // -------------------------------------------------------------------------
  // region Effects
  // -------------------------------------------------------------------------

  /**
   * When session changes, restore the buffer for that session.
   */
  useEffect(() => {
    setCurrentTextState(getSessionBuffer());
  }, [sessionId, getSessionBuffer]);

  /**
   * When message index changes, update displayed text.
   */
  useEffect(() => {
    const currentIndex = getCurrentIndex();
    if (currentIndex === undefined) {
      // At buffer - show what user was typing
      setCurrentTextState(getSessionBuffer());
    } else {
      // In history - show that message
      const text = messages[currentIndex];
      if (text !== undefined) {
        setCurrentTextState(text);
      }
    }
  }, [messages, getCurrentIndex, getSessionBuffer]);

  // -------------------------------------------------------------------------
  // region Key Handler
  // -------------------------------------------------------------------------

  /**
   * Handle keyboard navigation.
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!enabled || e.shiftKey) return;

      const textarea = e.currentTarget;
      const upArrowPressed = e.key === 'ArrowUp';
      const downArrowPressed = e.key === 'ArrowDown';

      if (!upArrowPressed && !downArrowPressed) return;

      // Get cursor position
      const cursorPosition = textarea.selectionStart;
      const isAtStart = cursorPosition === 0;
      const isAtEnd = cursorPosition === currentText.length;

      const currentIndex = getCurrentIndex();
      let newIndex: number | undefined | null = null; // null = no change

      if (isAtStart && upArrowPressed) {
        // Navigate up through history
        if (messages.length === 0) {
          newIndex = undefined;
        } else if (currentIndex === undefined) {
          // At buffer - go to last message
          newIndex = messages.length - 1;
        } else {
          // Go to previous message
          newIndex = Math.max(0, currentIndex - 1);
        }
      } else if (isAtEnd && downArrowPressed) {
        // Navigate down through history
        if (messages.length === 0) {
          newIndex = undefined;
        } else if (currentIndex === undefined || currentIndex === messages.length - 1) {
          // At buffer or last message - go to buffer
          newIndex = undefined;
        } else {
          // Go to next message
          newIndex = currentIndex + 1;
        }
      }

      if (newIndex !== null) {
        sessionMsgIndex.current[sessionId] = newIndex;

        if (newIndex === undefined) {
          setCurrentTextState(getSessionBuffer());
        } else {
          setCurrentTextState(messages[newIndex] ?? '');
        }
      }
    },
    [enabled, currentText, messages, sessionId, getCurrentIndex, getSessionBuffer]
  );

  // -------------------------------------------------------------------------
  // region Return
  // -------------------------------------------------------------------------

  return {
    currentText,
    setCurrentText,
    handleKeyDown,
    currentIndex: getCurrentIndex(),
    reset
  };
}
