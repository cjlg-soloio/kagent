/**
 * @file BaseChatManager.ts
 * @description Unified chat manager with extension points for customization.
 *
 * This manager consolidates functionality from:
 * - UnifiedChatManager (Common/Chat)
 * - AgentChatManager (ARE)
 * - ChatManager (KE)
 *
 * Extension Points:
 * - Override `getAccessToken()` for custom auth
 * - Override `buildEndpointUrl()` for custom endpoint construction
 * - Set callbacks for event handling
 *
 * @example
 * ```typescript
 * const manager = new BaseChatManager({
 *   endpoint: 'https://api.example.com/a2a',
 *   getAccessToken: async () => myAuthService.getToken(),
 * });
 *
 * manager.setOnMessagesChanged(() => updateUI());
 * manager.createSession();
 * await manager.sendMessage('Hello!');
 * ```
 */

import { MessageSendParams } from '@a2a-js/sdk';
import { a2AClient } from 'Api/external/kagent/a2aClient';
import { v4 as uuidv4 } from 'uuid';

import { ChatState, ChatStateMachine } from 'Components/Chat/core/state/ChatStateMachine';
import type { ChatMessage, ChatSession } from 'Components/Chat/core/types/chat.types';
import type { ChatProvider } from 'Components/Chat/core/types/provider.types';
import type { StreamingEvent } from 'Components/Chat/core/types/streaming.types';

// ----------------------------------------------------------------------------
// region Configuration Types
// ----------------------------------------------------------------------------

/**
 * Configuration options for BaseChatManager.
 */
export interface BaseChatManagerConfig {
  /** Base endpoint URL for the A2A agent */
  endpoint: string;

  /**
   * Provide the current access token.
   * Called before each request to ensure fresh tokens.
   */
  getAccessToken: () => Promise<string>;

  /**
   * Optional: Key for localStorage session persistence.
   * If provided, session ID will be persisted and restored.
   */
  sessionStorageKey?: string;

  /**
   * Optional: Timeout for streaming responses in milliseconds.
   * @default 60000
   */
  streamTimeout?: number;
}

// ----------------------------------------------------------------------------
// region BaseChatManager Class
// ----------------------------------------------------------------------------

/**
 * Base chat manager implementing the ChatProvider interface.
 *
 * This class handles:
 * - Session management
 * - Message history
 * - Streaming request lifecycle
 * - State machine transitions
 *
 * Extend this class and override protected methods for customization.
 */
export class BaseChatManager implements ChatProvider {
  // -------------------------------------------------------------------------
  // region Private State
  // -------------------------------------------------------------------------

  /** Session identifier */
  private sessionId: string | null = null;

  /** Current session object */
  private session: ChatSession | null = null;

  /** Message history for the current session */
  private messages: ChatMessage[] = [];

  /** Whether a request is in progress */
  private isLoadingState = false;

  // -------------------------------------------------------------------------
  // region Configuration
  // -------------------------------------------------------------------------

  /** The A2A endpoint URL */
  protected readonly endpoint: string;

  /** Access token provider function */
  protected readonly getAccessTokenFn: () => Promise<string>;

  /** Optional localStorage key for session persistence */
  protected readonly sessionStorageKey?: string;

  /** Stream timeout in milliseconds */
  protected readonly streamTimeout: number;

  // -------------------------------------------------------------------------
  // region State Machine
  // -------------------------------------------------------------------------

  /** Public state machine for external state observation */
  public readonly csm: ChatStateMachine;

  // -------------------------------------------------------------------------
  // region Callbacks
  // -------------------------------------------------------------------------

  /** Called when messages array changes */
  private onMessagesChangedCallback?: () => void;

  /** Called when loading state changes */
  private onLoadingChangedCallback?: () => void;

  /** Called when a streaming event is received */
  public onEventReceived?: (manager: BaseChatManager, event: StreamingEvent) => void;

  /** Called when an error occurs */
  public onError?: (manager: BaseChatManager, error: Error) => void;

  /** Called on state machine transitions */
  public onStateChange?: (manager: BaseChatManager, state: ChatState) => void;

  // -------------------------------------------------------------------------
  // region Constructor
  // -------------------------------------------------------------------------

  constructor(config: BaseChatManagerConfig) {
    this.endpoint = config.endpoint;
    this.getAccessTokenFn = config.getAccessToken;
    this.sessionStorageKey = config.sessionStorageKey;
    this.streamTimeout = config.streamTimeout ?? 60000;

    // Initialize state machine
    this.csm = new ChatStateMachine();
    this.csm.registerTransitionCallback('on-transition', () => {
      this.onStateChange?.(this, this.csm.curState);
    });

    // Restore session from storage if available
    this.restoreSession();
  }

  // -------------------------------------------------------------------------
  // region Session Management
  // -------------------------------------------------------------------------

  /**
   * Restore session from localStorage if a storage key was provided.
   */
  private restoreSession(): void {
    if (!this.sessionStorageKey) return;

    const storedSessionId = localStorage.getItem(this.sessionStorageKey);
    if (storedSessionId) {
      this.sessionId = storedSessionId;
      this.session = {
        id: storedSessionId,
        state: 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }
  }

  /**
   * Persist session to localStorage if a storage key was provided.
   */
  private persistSession(): void {
    if (!this.sessionStorageKey || !this.sessionId) return;
    localStorage.setItem(this.sessionStorageKey, this.sessionId);
  }

  /**
   * Get the current session ID.
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Get the current session object.
   */
  getSession(): ChatSession | null {
    return this.session;
  }

  /**
   * Create a new chat session.
   * Returns the new session ID.
   */
  createSession(): string {
    const newId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.sessionId = newId;
    this.session = {
      id: newId,
      state: 'active',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.persistSession();
    return newId;
  }

  // -------------------------------------------------------------------------
  // region Authentication (Override Point)
  // -------------------------------------------------------------------------

  /**
   * Get the access token for API requests.
   * Override this method for custom authentication logic.
   *
   * @protected
   */
  protected async getAccessToken(): Promise<string> {
    return this.getAccessTokenFn();
  }

  // -------------------------------------------------------------------------
  // region Endpoint (Override Point)
  // -------------------------------------------------------------------------

  /**
   * Build the endpoint URL for the request.
   * Override this method to customize endpoint construction.
   *
   * @protected
   */
  protected buildEndpointUrl(): string {
    return this.endpoint;
  }

  // -------------------------------------------------------------------------
  // region Message Handling
  // -------------------------------------------------------------------------

  /**
   * Send a message and wait for the complete response.
   */
  async sendMessage(message: string): Promise<string> {
    if (!this.sessionId) {
      throw new Error('No session initialized. Call createSession() first.');
    }

    // Transition to SENDING state
    this.csm.transition(ChatState.SENDING);
    this.setLoading(true);

    // Add user message to history
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role: 'user',
      content: message,
      timestamp: new Date()
    };
    this.addMessage(userMessage);

    try {
      const accessToken = await this.getAccessToken();
      const endpointUrl = this.buildEndpointUrl();

      // Build the A2A message
      const params: MessageSendParams = {
        message: {
          kind: 'message',
          messageId: uuidv4(),
          contextId: this.sessionId,
          role: 'user',
          parts: [{ kind: 'text', text: message }]
        }
      };

      // Transition to STREAMING
      this.csm.transition(ChatState.STREAMING);

      // Send and process stream
      const stream = await a2AClient.sendMessageStream(endpointUrl, accessToken, params);
      const response = await this.processStream(stream);

      // Add assistant message to history
      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant',
        content: response || 'No response received',
        timestamp: new Date()
      };
      this.addMessage(assistantMessage);

      return assistantMessage.content;
    } catch (error) {
      // Handle error
      const errorObj = error instanceof Error ? error : new Error(String(error));
      this.onError?.(this, errorObj);

      // Add error message to history
      const errorMessage: ChatMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
        metadata: { error: true }
      };
      this.addMessage(errorMessage);

      throw error;
    } finally {
      // Always return to IDLE
      this.csm.transition(ChatState.IDLE);
      this.setLoading(false);
    }
  }

  /**
   * Send a message and receive streaming events.
   * Returns an async iterable that yields streaming events.
   */
  async sendStreamingMessage(message: string): Promise<AsyncIterable<StreamingEvent>> {
    if (!this.sessionId) {
      throw new Error('No session initialized. Call createSession() first.');
    }

    const accessToken = await this.getAccessToken();
    const endpointUrl = this.buildEndpointUrl();

    const params: MessageSendParams = {
      message: {
        kind: 'message',
        messageId: uuidv4(),
        contextId: this.sessionId,
        role: 'user',
        parts: [{ kind: 'text', text: message }]
      }
    };

    const stream = await a2AClient.sendMessageStream(endpointUrl, accessToken, params);

    // Wrap the stream to emit events through callbacks
    const emitEvent = (event: StreamingEvent) => {
      this.onEventReceived?.(this, event);
    };
    async function* wrappedStream() {
      for await (const event of stream) {
        emitEvent(event as StreamingEvent);
        yield event as StreamingEvent;
      }
    }

    return wrappedStream();
  }

  /**
   * Process a streaming response and extract the full text content.
   * Override this method to customize response extraction.
   *
   * Following the pattern from ScrollableChatTasks: extract messages only from
   * status-update events, not from artifact-update events. This maintains semantic
   * separation and naturally avoids duplicates.
   *
   * @protected
   */
  protected async processStream(stream: AsyncIterable<unknown>): Promise<string> {
    let fullResponse = '';
    let lastEventTime = Date.now();

    for await (const event of stream) {
      lastEventTime = Date.now();

      // Emit event through callback
      this.onEventReceived?.(this, event as StreamingEvent);

      // Extract text from different event types
      const eventAny = event as Record<string, unknown>;

      // Only extract messages from status-update events (not artifact-update)
      // This follows the pattern from ScrollableChatTasks and avoids duplicates
      // when both event types contain the same content
      if ('status' in eventAny && eventAny.status) {
        const status = eventAny.status as { message?: any };
        if (status.message) {
          const sdkMessage = status.message;
          // Check if it has non-text parts
          const hasNonTextParts = sdkMessage.parts?.some((part: any) => part.kind !== 'text');
          if (hasNonTextParts) {
            const textContent =
              sdkMessage.parts
                ?.filter((part: any) => part.kind === 'text')
                .map((part: any) => part.text || '')
                .join('') || '';
            const chatMessage: ChatMessage = {
              id: sdkMessage.messageId || `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              role: 'assistant',
              content: textContent,
              timestamp: new Date(),
              metadata: { fullMessage: sdkMessage }
            };
            // Add the message right away because this could be a multi-part call
            // (e.g. tool function calls and responses are separate).
            this.addMessage(chatMessage);
          } else if (status.message?.parts) {
            const textParts = status.message.parts
              .filter((part: any) => part.kind === 'text')
              .map((part: any) => part.text || '');
            if (textParts.length > 0) {
              // This is the text response that will show up after the tool call messages.
              fullResponse = textParts.join('');
            }
          }
        }
      }

      // Check for timeout
      if (Date.now() - lastEventTime > this.streamTimeout) {
        // eslint-disable-next-line no-console
        console.warn(`Stream timeout - no events received for ${this.streamTimeout / 1000} seconds`);
        break;
      }
    }

    return fullResponse;
  }

  /**
   * Get all messages in the current session.
   */
  getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  /**
   * Add a message to the history and notify listeners.
   */
  private addMessage(message: ChatMessage): void {
    this.messages.push(message);
    this.onMessagesChangedCallback?.();
  }

  /**
   * Clear all messages and create a new session.
   */
  clearMessages(): void {
    this.messages = [];

    // Clear stored session
    if (this.sessionStorageKey) {
      localStorage.removeItem(this.sessionStorageKey);
    }

    // Create a new session
    this.createSession();

    this.onMessagesChangedCallback?.();
  }

  // -------------------------------------------------------------------------
  // region State
  // -------------------------------------------------------------------------

  /**
   * Check if a request is currently in progress.
   */
  isLoading(): boolean {
    return this.isLoadingState;
  }

  /**
   * Set the loading state and notify listeners.
   */
  private setLoading(loading: boolean): void {
    this.isLoadingState = loading;
    this.onLoadingChangedCallback?.();
  }

  /**
   * Cancel the current request if one is in progress.
   */
  cancelCurrentRequest(): void {
    if (this.csm.isStreaming() || this.csm.isSending()) {
      this.csm.transition(ChatState.CANCELLING);
    }
    a2AClient.cancelMessageStream();
    this.csm.transition(ChatState.IDLE);
    this.setLoading(false);
  }

  // -------------------------------------------------------------------------
  // region Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Clean up resources.
   * Call this when the manager is no longer needed.
   */
  cleanup(): void {
    this.cancelCurrentRequest();
  }

  // -------------------------------------------------------------------------
  // region Callbacks
  // -------------------------------------------------------------------------

  /**
   * Register a callback for when messages change.
   */
  setOnMessagesChanged(callback: () => void): void {
    this.onMessagesChangedCallback = callback;
  }

  /**
   * Register a callback for when loading state changes.
   */
  setOnLoadingChanged(callback: () => void): void {
    this.onLoadingChangedCallback = callback;
  }
}
