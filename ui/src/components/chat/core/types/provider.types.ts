/**
 * @file provider.types.ts
 * @description Chat provider interfaces and configuration types.
 *
 * Defines the contracts that chat managers must implement.
 * Designed following the Open-Closed Principle - providers can extend
 * the base interface without modifying existing implementations.
 */

import type { ChatMessage, ChatSession } from 'Components/Chat/core/types/chat.types';
import type { StreamingEvent } from 'Components/Chat/core/types/streaming.types';

// ----------------------------------------------------------------------------
// region Configuration Types
// ----------------------------------------------------------------------------

/**
 * Configuration options for chat providers.
 * Can be extended by specific implementations.
 */
export interface ChatProviderConfig {
  /** The A2A endpoint URL for the agent */
  endpoint: string;

  /**
   * Key for storing session in localStorage.
   * If provided, session will be persisted across page reloads.
   */
  sessionStorageKey?: string;

  /**
   * Timeout in milliseconds for streaming responses.
   * @default 60000 (60 seconds)
   */
  streamTimeout?: number;

  /**
   * Whether to automatically create a session on initialization.
   * @default true
   */
  autoCreateSession?: boolean;
}

// ----------------------------------------------------------------------------
// region Callback Types
// ----------------------------------------------------------------------------

/**
 * Callbacks for chat provider lifecycle events.
 * These enable reactive updates to UI without tight coupling.
 */
export interface ChatProviderCallbacks {
  /** Called when the messages array changes */
  onMessagesChanged?: (messages: ChatMessage[]) => void;

  /** Called when loading state changes */
  onLoadingChanged?: (isLoading: boolean) => void;

  /** Called when a new session is created */
  onSessionCreated?: (session: ChatSession) => void;

  /** Called when a streaming event is received */
  onStreamingEvent?: (event: StreamingEvent) => void;

  /** Called when an error occurs */
  onError?: (error: Error) => void;
}

// ----------------------------------------------------------------------------
// region Provider Interface
// ----------------------------------------------------------------------------

/**
 * Core chat provider interface.
 *
 * This is the main contract that all chat implementations must fulfill.
 * Methods marked with `?` are optional and provide additional functionality.
 *
 * @example
 * ```typescript
 * class MyCustomProvider implements ChatProvider {
 *   // Implement required methods...
 * }
 * ```
 */
export interface ChatProvider {
  // -------------------------------------------------------------------------
  // Session Management
  // -------------------------------------------------------------------------

  /**
   * Get the current session ID.
   * Returns null if no session is active.
   */
  getSessionId(): string | null;

  /**
   * Get the current session object.
   */
  getSession(): ChatSession | null;

  /**
   * Create a new chat session.
   * Returns the new session ID.
   */
  createSession(): string;

  // -------------------------------------------------------------------------
  // Message Handling
  // -------------------------------------------------------------------------

  /**
   * Send a message and wait for the complete response.
   * This is the primary method for non-streaming chat.
   *
   * @param message - The message text to send
   * @returns The assistant's response text
   */
  sendMessage(message: string): Promise<string>;

  /**
   * Send a message and receive a streaming response.
   * Use this for real-time updates during long responses.
   *
   * @param message - The message text to send
   * @returns An async iterable of streaming events
   */
  sendStreamingMessage(message: string): Promise<AsyncIterable<StreamingEvent>>;

  /**
   * Get all messages in the current session.
   */
  getMessages(): ChatMessage[];

  /**
   * Clear all messages and optionally start a new session.
   */
  clearMessages(): void;

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  /**
   * Check if a request is currently in progress.
   */
  isLoading(): boolean;

  /**
   * Cancel the current request if one is in progress.
   * Optional - not all providers support cancellation.
   */
  cancelCurrentRequest?(): void;

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Clean up resources (abort pending requests, etc.).
   * Should be called when the provider is no longer needed.
   */
  cleanup(): void;

  // -------------------------------------------------------------------------
  // Callbacks (Optional)
  // -------------------------------------------------------------------------

  /**
   * Register a callback for when messages change.
   * Used for React state synchronization.
   */
  setOnMessagesChanged?(callback: () => void): void;

  /**
   * Register a callback for when loading state changes.
   * Used for React state synchronization.
   */
  setOnLoadingChanged?(callback: () => void): void;
}

// ----------------------------------------------------------------------------
// region Abstract Provider
// ----------------------------------------------------------------------------

/**
 * Base configuration for providers that need authentication.
 */
export interface AuthenticatedProviderConfig extends ChatProviderConfig {
  /**
   * Function to retrieve the current access token.
   * Called before each API request to ensure fresh tokens.
   */
  getAccessToken: () => Promise<string>;
}

/**
 * Result of a send message operation.
 * Includes both the response and any metadata about the request.
 */
export interface SendMessageResult {
  /** The response message */
  message: ChatMessage;

  /** The task ID if this created a new task */
  taskId?: string;

  /** Number of streaming events received (for streaming requests) */
  eventCount?: number;
}
