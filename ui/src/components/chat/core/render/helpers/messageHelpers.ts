import { Message } from '@a2a-js/sdk';
import { ApprovalDecision } from 'Api/external/kagent/types';
import { v4 as uuidv4 } from 'uuid';

//
// region Imported
// Partially from Kagent OSS
//

export type OriginalMessageType =
  | 'TextMessage'
  | 'ToolCallRequestEvent'
  | 'ToolCallExecutionEvent'
  | 'ToolCallSummaryMessage'
  | 'ToolApprovalRequest'
  | 'AskUserRequest';

// Types for the processed tool call data stored in metadata
export interface ProcessedToolCallData {
  id: string;
  name: string;
  args: Record<string, unknown>;
  subagent_session_id?: string;
}

export interface ProcessedToolResultData {
  call_id: string;
  name: string;
  content: string;
  is_error: boolean;
  subagent_session_id?: string;
}

export interface AskUserQuestion {
  question: string;
  choices?: string[];
  multiple?: boolean;
}

export interface ADKMetadata {
  adk_app_name?: string;
  adk_session_id?: string;
  adk_user_id?: string;
  adk_usage_metadata?: {
    totalTokenCount?: number;
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
  adk_type?: 'function_call' | 'function_response';
  adk_author?: string;
  adk_invocation_id?: string;
  originalType?: OriginalMessageType;
  displaySource?: string;
  toolCallData?: ProcessedToolCallData[];
  toolResultData?: ProcessedToolResultData[];
  approvalDecision?: ApprovalDecision;
  askUserData?: { id: string; questions: AskUserQuestion[] };
  askUserAnswers?: Array<{ answer: string[] }> | null;
  [key: string]: unknown; // Allow for additional metadata fields
}

export function createMessage(
  content: string,
  source: string,
  options: {
    messageId?: string;
    originalType?: OriginalMessageType;
    contextId?: string;
    taskId?: string;
    additionalMetadata?: Record<string, unknown>;
  } = {}
): Message {
  const { messageId = uuidv4(), originalType, contextId, taskId, additionalMetadata = {} } = options;

  const message: Message = {
    kind: 'message',
    messageId,
    role: source === 'user' ? 'user' : 'agent',
    parts: [
      {
        kind: 'text',
        text: content
      }
    ],
    contextId,
    taskId,
    metadata: {
      originalType,
      displaySource: source,
      ...additionalMetadata
    }
  };
  // console.log(duplicateObj(message));
  return message;
}

export function convertToUserFriendlyName(name: string): string {
  if (!name) return 'Unknown Source';
  return name.replace(/__NS__/g, '/').replace(/_/g, '-');
}

export function getSourceFromMetadata(metadata: ADKMetadata | undefined, fallback: string): string {
  if (metadata?.adk_app_name) {
    return convertToUserFriendlyName(metadata.adk_app_name);
  }
  return fallback;
}

/**
 * Read a metadata value checking `adk_<key>` first, then `kagent_<key>`.
 * Allows interoperability with upstream ADK (adk_ prefix) while preserving
 * backward-compatibility with kagent's own kagent_ prefix.
 */
export function getMetadataValue<T = unknown>(
  metadata: Record<string, unknown> | undefined | null,
  key: string
): T | undefined {
  if (!metadata) return undefined;
  const adkKey = `adk_${key}`;
  if (adkKey in metadata) return metadata[adkKey] as T;
  const kagentKey = `kagent_${key}`;
  if (kagentKey in metadata) return metadata[kagentKey] as T;
  return undefined;
}
