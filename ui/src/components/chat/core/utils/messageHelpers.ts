/**
 * @file messageHelpers.ts
 * @description Utility functions for message format conversion and manipulation.
 *
 * These helpers enable interoperability between different message formats
 * used in ARE (simple messages) and KE (task-based messages).
 */

import type { ChatMessage, ChatTask, SDKMessage } from 'Components/Chat/core/types/chat.types';

// ----------------------------------------------------------------------------
// region Format Conversion
// ----------------------------------------------------------------------------

/**
 * Convert a simple ChatMessage to SDK message format.
 */
export function chatMessageToSDKMessage(message: ChatMessage, contextId: string): SDKMessage {
  if (message.metadata?.fullMessage) {
    return message.metadata.fullMessage as SDKMessage;
  }
  return {
    kind: 'message',
    messageId: message.id,
    contextId,
    role: message.role === 'user' ? 'user' : 'agent',
    parts: [{ kind: 'text', text: message.content }],
    metadata: message.metadata
  };
}

/**
 * Convert an SDK message to simple ChatMessage format.
 */
export function sdkMessageToChatMessage(message: SDKMessage): ChatMessage {
  // Extract text content from parts
  const textContent = message.parts
    .filter(part => part.kind === 'text')
    .map(part => part.text || '')
    .join('');

  return {
    id: message.messageId,
    role: message.role === 'user' ? 'user' : 'assistant',
    content: textContent,
    timestamp: new Date(),
    metadata: message.metadata
  };
}

/**
 * Convert an array of ChatMessages to a single ChatTask.
 * Useful for displaying simple messages in task-based UI.
 */
export function messagesToTask(messages: ChatMessage[], contextId: string, taskId?: string): ChatTask {
  return {
    kind: 'task',
    id: taskId || `task-${contextId}`,
    contextId,
    history: messages.map(msg => chatMessageToSDKMessage(msg, contextId)),
    status: { state: 'completed' },
    metadata: {}
  };
}

/**
 * Extract all messages from a task's history.
 */
export function taskToMessages(task: ChatTask): ChatMessage[] {
  if (!task.history) return [];

  return task.history.map(sdkMessageToChatMessage);
}

// ----------------------------------------------------------------------------
// region Message Filtering
// ----------------------------------------------------------------------------

/**
 * Get all user messages from an array of messages.
 */
export function getUserMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter(msg => msg.role === 'user');
}

/**
 * Get all assistant/agent messages from an array of messages.
 */
export function getAssistantMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter(msg => msg.role === 'assistant' || msg.role === 'agent');
}

/**
 * Get user message texts for history navigation.
 */
export function getUserMessageTexts(messages: ChatMessage[]): string[] {
  return getUserMessages(messages).map(msg => msg.content);
}

// ----------------------------------------------------------------------------
// region Message Creation
// ----------------------------------------------------------------------------

/**
 * Create a unique message ID.
 */
export function createMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a user message.
 */
export function createUserMessage(content: string): ChatMessage {
  return {
    id: createMessageId(),
    role: 'user',
    content,
    timestamp: new Date()
  };
}

/**
 * Create an assistant message.
 */
export function createAssistantMessage(content: string): ChatMessage {
  return {
    id: createMessageId(),
    role: 'assistant',
    content,
    timestamp: new Date()
  };
}

/**
 * Create an error message from the assistant.
 */
export function createErrorMessage(
  errorText: string = 'Sorry, I encountered an error. Please try again.'
): ChatMessage {
  return {
    id: createMessageId(),
    role: 'assistant',
    content: errorText,
    timestamp: new Date(),
    metadata: { error: true }
  };
}

// ----------------------------------------------------------------------------
// region Text Extraction
// ----------------------------------------------------------------------------

/**
 * Extract text content from message parts.
 */
export function extractTextFromParts(parts: Array<{ kind?: string; text?: string }>): string {
  return parts
    .filter(part => part.kind === 'text')
    .map(part => part.text || '')
    .join('');
}

/**
 * Extract text content from a streaming event's artifact.
 */
export function extractTextFromArtifact(
  artifact: { parts?: Array<{ kind?: string; text?: string }> } | undefined
): string {
  if (!artifact?.parts) return '';
  return extractTextFromParts(artifact.parts);
}

/**
 * Extract text content from a streaming event's status message.
 */
export function extractTextFromStatus(
  status: { message?: { parts?: Array<{ kind?: string; text?: string }> } } | undefined
): string {
  if (!status?.message?.parts) return '';
  return extractTextFromParts(status.message.parts);
}
