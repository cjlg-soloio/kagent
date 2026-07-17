/**
 * @file useChatManager.ts
 * @description React hook for managing chat state with the BaseChatManager.
 *
 * This hook provides a React-friendly interface to the BaseChatManager,
 * handling state synchronization and lifecycle management.
 *
 * @example
 * ```typescript
 * const { messages, isLoading, sendMessage, clearMessages } = useChatManager({
 *   endpoint: '/api/a2a/agent',
 *   getAccessToken: () => authService.getToken(),
 *   sessionStorageKey: 'my-chat-session',
 * });
 * ```
 */

import { useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { AuthContext } from 'context/AuthContext';

import type { BaseChatManagerConfig } from 'Components/Chat/core/managers/BaseChatManager';
import { BaseChatManager } from 'Components/Chat/core/managers/BaseChatManager';
import { ChatState } from 'Components/Chat/core/state/ChatStateMachine';
import type { ChatMessage } from 'Components/Chat/core/types/chat.types';
import type { StreamingEvent } from 'Components/Chat/core/types/streaming.types';

// ----------------------------------------------------------------------------
// region Hook Options
// ----------------------------------------------------------------------------

/**
 * Options for the useChatManager hook.
 */
export interface UseChatManagerOptions {
  /** A2A endpoint URL */
  endpoint: string;

  /**
   * Optional: Key for localStorage session persistence.
   */
  sessionStorageKey?: string;

  /**
   * Optional: Custom access token provider.
   * If not provided, uses AuthContext.latestAccessToken.
   */
  getAccessToken?: () => Promise<string>;

  /**
   * Optional: Callback when session is created.
   */
  onSessionCreated?: (sessionId: string) => void;

  /**
   * Optional: Callback when an error occurs.
   */
  onError?: (error: Error) => void;

  /**
   * Optional: Callback when streaming events are received.
   */
  onStreamingEvent?: (event: StreamingEvent) => void;

  /**
   * Optional: Auto-create session on mount.
   * @default true
   */
  autoCreateSession?: boolean;
}

/**
 * Return type for useChatManager hook.
 */
export interface UseChatManagerReturn {
  /** The chat manager instance */
  manager: BaseChatManager;

  /** Current chat messages */
  messages: ChatMessage[];

  /** Whether a request is in progress */
  isLoading: boolean;

  /** Current chat state */
  chatState: ChatState;

  /** Current session ID */
  sessionId: string | null;

  /** Send a message */
  sendMessage: (message: string) => Promise<void>;

  /** Send a streaming message */
  sendStreamingMessage: (message: string) => Promise<AsyncIterable<StreamingEvent>>;

  /** Clear messages and start new session */
  clearMessages: () => void;

  /** Cancel current request */
  cancelRequest: () => void;

  /** Create a new session manually */
  createSession: () => string;
}

// ----------------------------------------------------------------------------
// region Hook Implementation
// ----------------------------------------------------------------------------

/**
 * React hook for chat functionality.
 *
 * Creates and manages a BaseChatManager instance, syncing its state
 * with React state for reactive UI updates.
 */
export function useChatManager(options: UseChatManagerOptions): UseChatManagerReturn {
  const { latestAccessToken } = useContext(AuthContext);

  // -------------------------------------------------------------------------
  // region State
  // -------------------------------------------------------------------------

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [chatState, setChatState] = useState<ChatState>(ChatState.IDLE);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // region Manager Creation
  // -------------------------------------------------------------------------

  /**
   * Create the chat manager with configuration.
   * Memoized to prevent recreation on every render.
   */
  const manager = useMemo(() => {
    const config: BaseChatManagerConfig = {
      endpoint: options.endpoint,
      sessionStorageKey: options.sessionStorageKey,
      getAccessToken:
        options.getAccessToken ??
        (async () => {
          if (!latestAccessToken) {
            throw new Error('No access token available');
          }
          return latestAccessToken;
        })
    };

    const mgr = new BaseChatManager(config);

    // Set up callbacks for state synchronization
    mgr.setOnMessagesChanged(() => {
      setMessages(mgr.getMessages());
    });

    mgr.setOnLoadingChanged(() => {
      setIsLoading(mgr.isLoading());
    });

    mgr.onStateChange = (_manager, state) => {
      setChatState(state);
    };

    mgr.onError = (_manager, error) => {
      options.onError?.(error);
    };

    mgr.onEventReceived = (_manager, event) => {
      options.onStreamingEvent?.(event);
    };

    return mgr;
  }, [options.endpoint, options.sessionStorageKey]);

  // -------------------------------------------------------------------------
  // region Session Management
  // -------------------------------------------------------------------------

  /**
   * Initialize session on mount if autoCreateSession is true.
   */
  useEffect(() => {
    const autoCreate = options.autoCreateSession ?? true;

    if (autoCreate && !manager.getSessionId()) {
      const newSessionId = manager.createSession();
      setSessionId(newSessionId);
      options.onSessionCreated?.(newSessionId);
    } else if (manager.getSessionId()) {
      setSessionId(manager.getSessionId());
    }
  }, [manager, options.autoCreateSession, options.onSessionCreated]);

  /**
   * Cleanup on unmount.
   */
  useEffect(() => {
    return () => {
      manager.cleanup();
    };
  }, [manager]);

  // -------------------------------------------------------------------------
  // region Actions
  // -------------------------------------------------------------------------

  /**
   * Send a message and wait for response.
   */
  const sendMessage = useCallback(
    async (message: string): Promise<void> => {
      try {
        await manager.sendMessage(message);
      } catch (error) {
        // Error is already handled by onError callback
        // eslint-disable-next-line no-console
        console.error('Error sending message:', error);
      }
    },
    [manager]
  );

  /**
   * Send a streaming message.
   */
  const sendStreamingMessage = useCallback(
    async (message: string): Promise<AsyncIterable<StreamingEvent>> => {
      return manager.sendStreamingMessage(message);
    },
    [manager]
  );

  /**
   * Clear messages and start new session.
   */
  const clearMessages = useCallback(() => {
    manager.clearMessages();
    setSessionId(manager.getSessionId());
  }, [manager]);

  /**
   * Cancel current request.
   */
  const cancelRequest = useCallback(() => {
    manager.cancelCurrentRequest();
  }, [manager]);

  /**
   * Create a new session.
   */
  const createSession = useCallback(() => {
    const newSessionId = manager.createSession();
    setSessionId(newSessionId);
    options.onSessionCreated?.(newSessionId);
    return newSessionId;
  }, [manager, options.onSessionCreated]);

  // -------------------------------------------------------------------------
  // region Return
  // -------------------------------------------------------------------------

  return {
    manager,
    messages,
    isLoading,
    chatState,
    sessionId,
    sendMessage,
    sendStreamingMessage,
    clearMessages,
    cancelRequest,
    createSession
  };
}
