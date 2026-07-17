/**
 * @file ChatStateMachine.ts
 * @description State machine for managing chat state transitions.
 *
 * This file provides a typed state machine specifically for chat operations.
 * The state machine pattern improves:
 * - Predictable state transitions
 * - Easy debugging (can log transitions)
 * - Extensibility via callbacks
 *
 * State transitions:
 * - IDLE -> SENDING (on message send)
 * - SENDING -> STREAMING (after message sent)
 * - SENDING -> CANCELLING (on cancel)
 * - STREAMING -> IDLE (on complete)
 * - STREAMING -> CANCELLING (on cancel)
 * - STREAMING -> IDLE (on error)
 * - CANCELLING -> IDLE (after cancelled)
 */

import { StateMachine } from '@solo-io/ui-components-enterprise/utils';

// ----------------------------------------------------------------------------
// region Chat State Enum
// ----------------------------------------------------------------------------

/**
 * Possible states for a chat session.
 * Uses numeric enum values to satisfy StateMachine constraint.
 */
export enum ChatState {
  /** Ready to send a message */
  IDLE = 0,

  /** Message is being sent to the agent */
  SENDING = 1,

  /** Receiving streaming response from the agent */
  STREAMING = 2,

  /** Cancel request in progress */
  CANCELLING = 3
}

// ----------------------------------------------------------------------------
// region State Machine
// ----------------------------------------------------------------------------

/**
 * State machine for chat state management.
 *
 * Extends the generic StateMachine utility with chat-specific logic.
 * Callbacks can be registered for:
 * - 'on-enter' - Called when entering a state
 * - 'on-exit' - Called when leaving a state
 * - 'on-transition' - Called on any state change
 *
 * @example
 * ```typescript
 * const csm = new ChatStateMachine();
 *
 * csm.registerTransitionCallback('on-transition', (machine) => {
 *   console.log(`State changed to: ${ChatState[machine.curState]}`);
 * });
 *
 * csm.transition(ChatState.SENDING);
 * ```
 */
export class ChatStateMachine extends StateMachine<ChatState> {
  constructor() {
    super(ChatState.IDLE);
  }

  /**
   * Check if a transition to the target state is valid.
   * Override this method to enforce specific transition rules.
   */
  canTransitionTo(targetState: ChatState): boolean {
    const validTransitions: Record<ChatState, ChatState[]> = {
      [ChatState.IDLE]: [ChatState.SENDING],
      [ChatState.SENDING]: [ChatState.STREAMING, ChatState.CANCELLING, ChatState.IDLE],
      [ChatState.STREAMING]: [ChatState.IDLE, ChatState.CANCELLING],
      [ChatState.CANCELLING]: [ChatState.IDLE]
    };

    return validTransitions[this.curState]?.includes(targetState) ?? false;
  }

  /**
   * Check if the chat is in an active (non-idle) state.
   */
  isActive(): boolean {
    return this.curState !== ChatState.IDLE;
  }

  /**
   * Check if the chat is currently streaming.
   */
  isStreaming(): boolean {
    return this.curState === ChatState.STREAMING;
  }

  /**
   * Check if the chat is in the process of sending.
   */
  isSending(): boolean {
    return this.curState === ChatState.SENDING;
  }

  /**
   * Reset the state machine to idle.
   * Use cautiously - prefer proper transitions.
   */
  reset(): void {
    this.transition(ChatState.IDLE);
  }
}

// ----------------------------------------------------------------------------
// region Helper Functions
// ----------------------------------------------------------------------------

/**
 * Get a human-readable description of the current chat state.
 */
export function getChatStateDescription(state: ChatState): string {
  switch (state) {
    case ChatState.IDLE:
      return 'Ready';
    case ChatState.SENDING:
      return 'Sending message...';
    case ChatState.STREAMING:
      return 'Receiving response...';
    case ChatState.CANCELLING:
      return 'Cancelling...';
    default:
      return 'Unknown';
  }
}

/**
 * Get a loading indicator text for the current state.
 */
export function getChatStateLoadingText(state: ChatState): string | null {
  switch (state) {
    case ChatState.SENDING:
      return 'Sending';
    case ChatState.STREAMING:
      return 'Thinking';
    case ChatState.CANCELLING:
      return 'Cancelling';
    default:
      return null;
  }
}
