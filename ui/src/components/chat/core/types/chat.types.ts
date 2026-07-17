/**
 * @file chat.types.ts
 * @description Core chat type definitions used across the application.
 *
 * This file defines the fundamental data structures for chat functionality,
 * designed to be extensible via the metadata field and role unions.
 *
 * @example
 * ```typescript
 * const message: ChatMessage = {
 *   id: 'msg-123',
 *   role: 'user',
 *   content: 'Hello, agent!',
 *   timestamp: new Date(),
 *   metadata: { source: 'web' }
 * };
 * ```
 */

// ----------------------------------------------------------------------------
// region Message Types
// ----------------------------------------------------------------------------

/**
 * The role of a message participant.
 * Can be extended by specific implementations using type intersection.
 */
export type MessageRole = 'user' | 'assistant' | 'agent' | 'system';

/**
 * Core chat message structure.
 * Extensible via the generic metadata type parameter.
 *
 * @template TMetadata - Custom metadata type for extension (defaults to Record<string, unknown>)
 */
export interface ChatMessage<TMetadata = Record<string, unknown>> {
  /** Unique identifier for the message */
  id: string;

  /** The role of the message sender */
  role: MessageRole;

  /** The text content of the message */
  content: string;

  /** When the message was created */
  timestamp: Date;

  /**
   * Optional extensible metadata.
   * Feature-specific data can be added here without modifying the base interface.
   */
  metadata?: TMetadata;
}

/**
 * Message part structure for streaming/SDK compatibility.
 * Matches the A2A SDK message part format.
 */
export interface MessagePart {
  /** The kind of content in this part */
  kind: 'text' | 'file' | 'data';

  /** Text content (for kind='text') */
  text?: string;

  /** Additional data depending on kind */
  [key: string]: unknown;
}

/**
 * Full message structure compatible with A2A SDK.
 * Used for streaming responses and task history.
 */
export interface SDKMessage {
  kind: 'message';
  messageId: string;
  contextId: string;
  role: 'user' | 'agent';
  parts: MessagePart[];
  metadata?: Record<string, unknown>;
}

// ----------------------------------------------------------------------------
// region Session Types
// ----------------------------------------------------------------------------

/**
 * Chat session state.
 */
export type SessionState = 'idle' | 'active' | 'closed';

/**
 * Represents a chat session/conversation.
 *
 * @template TMetadata - Custom metadata type for extension
 */
export interface ChatSession<TMetadata = Record<string, unknown>> {
  /** Unique session identifier */
  id: string;

  /** Display name for the session */
  name?: string;

  /** Current state of the session */
  state: SessionState;

  /** When the session was created */
  createdAt: Date;

  /** When the session was last updated */
  updatedAt: Date;

  /** Optional extensible metadata */
  metadata?: TMetadata;
}

// ----------------------------------------------------------------------------
// region Task Types
// ----------------------------------------------------------------------------

/**
 * Task status states matching A2A SDK.
 */
export type TaskStatusState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'auth-required'
  | 'completed'
  | 'failed'
  | 'canceled';

/**
 * Task status structure.
 */
export interface TaskStatus {
  /** Current state of the task */
  state: TaskStatusState;

  /** Optional message providing status details */
  message?: SDKMessage;
}

/**
 * Artifact produced by a task.
 */
export interface TaskArtifact {
  /** Unique artifact identifier */
  artifactId: string;

  /** The type/name of the artifact */
  name?: string;

  /** Content parts of the artifact */
  parts: MessagePart[];

  /** Additional artifact metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Chat task structure.
 * Groups related messages and tracks execution status.
 * Compatible with A2A SDK Task type.
 */
export interface ChatTask {
  /** Always 'task' for type discrimination */
  kind: 'task';

  /** Unique task identifier */
  id: string;

  /** Session this task belongs to */
  contextId: string;

  /** Message history for this task */
  history?: SDKMessage[];

  /** Current task status */
  status: TaskStatus;

  /** Artifacts produced by this task */
  artifacts?: TaskArtifact[];

  /** Additional task metadata */
  metadata?: Record<string, unknown>;
}

// ----------------------------------------------------------------------------
// region Utility Types
// ----------------------------------------------------------------------------

/**
 * Type guard to check if a message is from the user.
 */
export function isUserMessage(message: ChatMessage): boolean {
  return message.role === 'user';
}

/**
 * Type guard to check if a message is from an assistant/agent.
 */
export function isAssistantMessage(message: ChatMessage): boolean {
  return message.role === 'assistant' || message.role === 'agent';
}
