import { DataPart, Message, Part, Task } from '@a2a-js/sdk';
import { AdkRequestConfirmationData, ToolDecision } from 'Api/external/kagent/types';
import { createMessage, getMetadataValue, ProcessedToolCallData, ProcessedToolResultData } from 'Components/Chat/core/render/helpers/messageHelpers';

/**
 * HITL (Human-in-the-Loop) detection, message decomposition, and decision
 * resolution utilities — ported from the upstream kagent OSS
 * `messageHandlers.ts` (`handleA2ATaskStatusUpdate` + `extractMessagesFromTasks`).
 *
 * The core idea (matching OSS): every raw A2A message is decomposed into
 * one synthetic `Message` per DataPart so that each tool call, tool response,
 * and approval request gets its own card in the chat UI.
 */

/** Find adk_request_confirmation DataParts in a message's parts. */
export function findConfirmationParts(message: Message): DataPart[] {
  if (!message.parts) return [];
  return message.parts.filter((part: Part) => {
    if (part.kind !== 'data') return false;
    const dp = part as DataPart;
    const meta = dp.metadata as Record<string, unknown> | undefined;
    return (
      getMetadataValue<string>(meta, 'type') === 'function_call' &&
      getMetadataValue<boolean>(meta, 'is_long_running') === true &&
      (dp.data as Record<string, unknown>)?.name === 'adk_request_confirmation'
    );
  }) as DataPart[];
}

/** Returns true if the message is a user HITL decision (approve/reject) or ask-user answer. */
export function isUserDecisionMessage(message: Message): boolean {
  if (message.role !== 'user' || !message.parts) return false;
  return message.parts.some((p: Part) => {
    if (p.kind !== 'data') return false;
    const data = (p as DataPart).data as Record<string, unknown> | undefined;
    return data?.decision_type != null;
  });
}

/** Tool IDs that have HITL request messages superseding plain ToolCallRequestEvent rows. */
export function getSupersededToolIds(history: Task['history'] | undefined): Set<string> {
  const ids = new Set<string>();
  for (const msg of history ?? []) {
    const meta = msg.metadata;
    if (meta?.originalType === 'ToolApprovalRequest' && meta.toolCallData) {
      for (const t of meta.toolCallData as Array<{ id: string }>) {
        ids.add(t.id);
      }
    }
    if (meta?.originalType === 'AskUserRequest' && meta.askUserData) {
      ids.add((meta.askUserData as { id: string }).id);
    }
  }
  return ids;
}

/**
 * Extract tool IDs from a confirmation DataPart.
 * For subagent HITL, returns the inner tool IDs from hitl_parts[].originalFunctionCall.
 * For direct HITL, returns the single outer tool ID.
 */
export function getConfirmationToolIds(confPart: DataPart): string[] {
  const data = confPart.data as unknown as AdkRequestConfirmationData;
  const origFc = data.args.originalFunctionCall;
  const outerToolId = origFc.id || data.id;
  const hitlParts = data.args.toolConfirmation?.payload?.hitl_parts;

  if (hitlParts && hitlParts.length > 0) {
    return hitlParts.map((hp, idx) => {
      if (hp.originalFunctionCall?.id) return hp.originalFunctionCall.id;
      return `${outerToolId}_${idx}`;
    });
  }

  return [outerToolId];
}

/** Resolved ask-user turns use `decision_type: "approve"` (with optional `ask_user_answers`). */
function resolvedAskUserApprovalDecision(decisionData: Record<string, unknown> | undefined): 'approve' | undefined {
  return decisionData?.decision_type === 'approve' ? 'approve' : undefined;
}

/**
 * Pending HITL for a task in `input-required` when the status message carries
 * `adk_request_confirmation` parts (used by streaming UI and `processTasksForHitl`).
 */
export function getPendingApprovalFromStatus(
  taskId: string,
  status: { state?: string; message?: unknown } | undefined
): { taskId: string; toolIds: string[] } | null {
  if (status?.state !== 'input-required' || !status.message) return null;
  const parts = findConfirmationParts(status.message as Message);
  if (parts.length === 0) return null;
  return { taskId, toolIds: parts.flatMap(getConfirmationToolIds) };
}

/**
 * Find the user's HITL decision data from task history, starting after a
 * specific index.
 */
export function findDecisionAfterIndex(
  history: Array<{ kind?: string; role?: string; parts?: Part[] }>,
  startIndex: number
): Record<string, unknown> | undefined {
  for (let i = startIndex + 1; i < history.length; i++) {
    const item = history[i];
    if (item.kind !== 'message' || item.role !== 'user' || !item.parts) continue;
    for (const p of item.parts) {
      if (p.kind !== 'data') continue;
      const data = (p as DataPart).data as Record<string, unknown> | undefined;
      if (data?.decision_type != null) {
        return data;
      }
    }
  }
  return undefined;
}

/**
 * Resolve the decision for a specific tool from the user's decision data.
 * Handles uniform ("approve"/"reject") and batch modes.
 */
export function resolveToolDecision(
  decisionData: Record<string, unknown> | undefined,
  toolId: string
): ToolDecision | undefined {
  if (!decisionData) return undefined;
  const decisionType = decisionData.decision_type as string;
  if (decisionType === 'batch') {
    const decisions = decisionData.decisions as Record<string, string> | undefined;
    return decisions?.[toolId] as ToolDecision | undefined;
  }
  return decisionType as ToolDecision; // "approve" | "reject"
}

/**
 * Build a synthetic message from an adk_request_confirmation DataPart.
 *   - "ask_user" → AskUserRequest message
 *   - everything else → ToolApprovalRequest message
 */
export function buildApprovalMessage(
  confPart: DataPart,
  contextId: string | undefined,
  taskId: string | undefined,
  decisionData?: Record<string, unknown>
): Message {
  const data = confPart.data as unknown as AdkRequestConfirmationData;
  const origFc = data.args.originalFunctionCall;
  const toolId = origFc.id || data.id;

  // Subagent HITL: check for hitl_parts in toolConfirmation payload
  const hitlParts = data.args.toolConfirmation?.payload?.hitl_parts;
  const subagentName = data.args.toolConfirmation?.payload?.subagent_name;

  // If hitl_parts has a single ask_user entry, treat as subagent ask_user.
  // Per protocol, hitl_parts entries are adk_request_confirmation wrappers —
  // the actual ask_user name and questions are in originalFunctionCall.
  if (hitlParts && hitlParts.length === 1) {
    const innerFc = hitlParts[0].originalFunctionCall;
    if (innerFc?.name === 'ask_user') {
      const innerToolId = innerFc.id || toolId;
      const askUserAnswers = decisionData?.ask_user_answers as Array<{ answer: string[] }> | undefined;
      return createMessage('', 'agent', {
        originalType: 'AskUserRequest',
        contextId,
        taskId,
        additionalMetadata: {
          askUserData: {
            id: innerToolId,
            questions: (innerFc.args as { questions?: unknown })?.questions || []
          },
          askUserAnswers: askUserAnswers || null,
          approvalDecision: resolvedAskUserApprovalDecision(decisionData),
          subagentName
        }
      });
    }
  }

  // Non-subagent ask_user (direct ask_user tool call)
  if (origFc.name === 'ask_user') {
    const askUserAnswers = decisionData?.ask_user_answers as Array<{ answer: string[] }> | undefined;
    return createMessage('', 'agent', {
      originalType: 'AskUserRequest',
      contextId,
      taskId,
      additionalMetadata: {
        askUserData: {
          id: toolId,
          questions: (origFc.args as { questions?: unknown }).questions || []
        },
        askUserAnswers: askUserAnswers || null,
        approvalDecision: resolvedAskUserApprovalDecision(decisionData)
      }
    });
  }

  // Subagent HITL: hitl_parts present — unwrap inner tool info.
  // Per the protocol, each hitl_parts entry is an adk_request_confirmation wrapper
  // whose originalFunctionCall contains the actual inner tool name/args/id.
  if (hitlParts && hitlParts.length > 0) {
    const toolCallContent: ProcessedToolCallData[] = hitlParts.map((hp, idx) => {
      const innerFc = hp.originalFunctionCall;
      if (innerFc) {
        // Use the inner tool's own ID for batch decisions, fall back to synthetic
        return {
          id: innerFc.id || `${toolId}_${idx}`,
          name: innerFc.name,
          args: innerFc.args || {}
        };
      }
      // Fallback for entries without originalFunctionCall
      return {
        id: `${toolId}_${idx}`,
        name: hp.name,
        args: hp.args || {}
      };
    });

    // For batch decisions with subagent tools, resolve per-tool decisions as a map
    let approvalDecision: Record<string, ToolDecision> | ToolDecision | undefined;
    if (decisionData) {
      if (decisionData.decision_type === 'batch') {
        approvalDecision = (decisionData.decisions as Record<string, ToolDecision>) || {};
      } else {
        approvalDecision = decisionData.decision_type as ToolDecision;
      }
    }

    return createMessage('', 'agent', {
      originalType: 'ToolApprovalRequest',
      contextId,
      taskId,
      additionalMetadata: {
        toolCallData: toolCallContent,
        approvalDecision,
        subagentName
      }
    });
  }

  // Standard (non-subagent) tool approval
  const toolCallContent: ProcessedToolCallData[] = [{ id: toolId, name: origFc.name, args: origFc.args || {} }];
  return createMessage('', 'agent', {
    originalType: 'ToolApprovalRequest',
    contextId,
    taskId,
    additionalMetadata: {
      toolCallData: toolCallContent,
      approvalDecision: resolveToolDecision(decisionData, toolId)
    }
  });
}

/**
 * Decompose a single raw A2A message into one synthetic `Message` per
 * meaningful DataPart, exactly matching the upstream OSS
 * `handleA2ATaskStatusUpdate` logic:
 *
 *  - `function_call` with name `adk_request_confirmation` / `adk_request_credential` → skipped
 *  - `function_response` with status `confirmation_requested` / `pending` → skipped
 *  - Other `function_call` → ToolCallRequestEvent message
 *  - Other `function_response` → ToolCallExecutionEvent message
 *  - Text parts → kept in a single message (if non-empty)
 *  - User messages → passed through as-is
 *
 * Returns an array of 0+ messages.
 */
export function decomposeMessage(msg: Message): Message[] {
  // User messages pass through unchanged
  if (msg.role === 'user') return [msg];
  if (!msg.parts || msg.parts.length === 0) return [];

  const results: Message[] = [];
  const textParts: Part[] = [];

  for (const part of msg.parts) {
    if (part.kind === 'text') {
      if ((part as any).text) textParts.push(part);
      continue;
    }

    if (part.kind !== 'data') {
      // file / unknown parts — collect with text
      textParts.push(part);
      continue;
    }

    const dp = part as DataPart;
    const partMeta = dp.metadata as Record<string, unknown> | undefined;
    const partType = getMetadataValue<string>(partMeta, 'type');
    const data = dp.data as Record<string, unknown>;

    if (partType === 'function_call') {
      const name = data.name as string | undefined;
      // Skip internal HITL function calls
      if (name === 'adk_request_confirmation' || name === 'adk_request_credential') continue;

      // Read subagent_session_id from part metadata
      const subagentSessionId = getMetadataValue<string>(partMeta, 'subagent_session_id');

      // Create a ToolCallRequestEvent message for this tool call
      const toolCallContent: ProcessedToolCallData[] = [
        {
          id: (data.id as string) || '',
          name: name || '',
          args: (data.args as Record<string, unknown>) || {},
          ...(subagentSessionId ? { subagent_session_id: subagentSessionId } : {})
        }
      ];
      results.push(
        createMessage('', 'agent', {
          originalType: 'ToolCallRequestEvent',
          contextId: msg.contextId,
          taskId: msg.taskId,
          additionalMetadata: { toolCallData: toolCallContent }
        })
      );
      continue;
    }

    if (partType === 'function_response') {
      const response = data.response as Record<string, unknown> | undefined;
      const status = response?.status as string | undefined;
      // Skip internal HITL stub responses
      if (status === 'confirmation_requested' || status === 'pending') continue;

      // Read subagent_session_id from response object
      const subagentSessionId =
        (response?.subagent_session_id as string | undefined) ||
        getMetadataValue<string>(partMeta, 'subagent_session_id');

      // Create a ToolCallExecutionEvent message for this tool response
      const result = response?.result ?? response;
      // Determine the content string from the result.
      // If the result is already an MCP-style content object ({content: [{text: "..."}]}),
      // extract the text directly to avoid double-encoding when processToolCallMessage
      // wraps it in another content array later.
      let contentStr: string;
      if (typeof result === 'string') {
        contentStr = result;
      } else if (result && typeof result === 'object' && Array.isArray((result as any).content)) {
        contentStr = (result as any).content
          .filter((c: any) => c.text != null)
          .map((c: any) => c.text)
          .join('\n');
      } else {
        contentStr = JSON.stringify(result);
      }
      const toolResultContent: ProcessedToolResultData[] = [
        {
          call_id: (data.id as string) || '',
          name: (data.name as string) || '',
          content: contentStr,
          is_error: false,
          ...(subagentSessionId ? { subagent_session_id: subagentSessionId } : {})
        }
      ];
      results.push(
        createMessage('', 'agent', {
          originalType: 'ToolCallExecutionEvent',
          contextId: msg.contextId,
          taskId: msg.taskId,
          additionalMetadata: { toolResultData: toolResultContent }
        })
      );
      continue;
    }

    // Generic DataPart (no function_call / function_response type) — keep as-is
    // This handles e.g. inline data, images, etc.
    textParts.push(part);
  }

  // Collect any remaining text / generic parts into a single message
  if (textParts.length > 0) {
    results.push({ ...msg, parts: textParts });
  }

  return results;
}

/**
 * Merge persisted task history with live stream output without duplicating rows.
 *
 * A2A status updates often carry **cumulative** message history. The HITL change
 * prepends `mergedHistory` so tool-call context stays on one task; naively doing
 * `[...mergedHistory, ...stream]` then repeats every message already in
 * `mergedHistory` (notably the latest user turn). Reload avoids that because it
 * only uses `processTasksForHitl` on fetched tasks.
 *
 * Upserts by `messageId`: same id replaces the existing slot (newer streamed
 * content wins); unknown ids append in stream order.
 */
export function mergeStreamingTaskHistory(mergedHistory: Message[], streamDecomposed: Message[]): Message[] {
  if (mergedHistory.length === 0) return streamDecomposed;

  const indexById = new Map<string, number>();
  for (let i = 0; i < mergedHistory.length; i++) {
    const id = mergedHistory[i].messageId;
    if (id) indexById.set(id, i);
  }

  const result = [...mergedHistory];
  for (const m of streamDecomposed) {
    const id = m.messageId;
    if (id && indexById.has(id)) {
      result[indexById.get(id)!] = m;
      continue;
    }
    if (id) {
      indexById.set(id, result.length);
    }
    result.push(m);
  }
  return result;
}

/**
 * Process an array of raw status-update messages from SSE events into the
 * decomposed message list used for `curStreamingTask.history`.
 *
 * Mirrors the OSS `handleA2ATaskStatusUpdate` flow:
 *  1. If the message is a HITL confirmation → create ToolApprovalRequest(s)
 *  2. If the message is a user decision → skip
 *  3. Otherwise → decompose into per-part synthetic messages
 */
export function decomposeStreamingMessages(
  rawMessages: Message[],
  contextId: string | undefined,
  taskId: string
): Message[] {
  const messages: Message[] = [];

  for (const msg of rawMessages) {
    // Skip user decision messages
    if (isUserDecisionMessage(msg)) continue;

    // Check for HITL confirmation — create standalone approval messages
    const confParts = findConfirmationParts(msg);
    if (confParts.length > 0) {
      for (const confPart of confParts) {
        messages.push(buildApprovalMessage(confPart, contextId, taskId));
      }
      continue;
    }

    // Decompose into per-part synthetic messages
    messages.push(...decomposeMessage(msg));
  }

  return messages;
}

/**
 * Process persisted tasks for HITL display on page load / reload.
 * Mirrors the OSS `extractMessagesFromTasks` + `extractApprovalMessagesFromTasks`:
 *
 *  - Confirmation messages → ToolApprovalRequest with resolved decision
 *  - User decision messages → skipped
 *  - All other messages → decomposed via decomposeMessage
 *  - Detects still-pending approvals (task in input-required with unresolved confirmations)
 */
export function processTasksForHitl(tasks: Task[]): {
  processedTasks: Task[];
  pendingApproval: { taskId: string; toolIds: string[] } | null;
} {
  let pendingApproval: { taskId: string; toolIds: string[] } | null = null;

  const processedTasks = tasks.map(task => {
    if (!task.history || task.history.length === 0) return task;

    const newHistory: Message[] = [];
    const seenMessageIds = new Set<string>();

    for (let i = 0; i < task.history.length; i++) {
      const message = task.history[i];

      // Dedup by messageId (matches OSS extractMessagesFromTasks)
      const mid = message.messageId;
      if (mid && seenMessageIds.has(mid)) continue;
      if (mid) seenMessageIds.add(mid);

      // Skip user decision messages
      if (isUserDecisionMessage(message)) continue;

      // Confirmation messages → standalone approval messages with resolved decision
      const confirmationParts = findConfirmationParts(message);
      if (confirmationParts.length > 0) {
        const decision = findDecisionAfterIndex(
          task.history as Array<{ kind?: string; role?: string; parts?: Part[] }>,
          i
        );
        for (const confPart of confirmationParts) {
          newHistory.push(buildApprovalMessage(confPart, task.contextId, task.id, decision));
        }
        continue;
      }

      // All other messages → decompose into per-part synthetic messages
      newHistory.push(...decomposeMessage(message));
    }

    return { ...task, history: newHistory };
  });

  // Detect still-pending approvals
  for (const task of tasks) {
    const pa = getPendingApprovalFromStatus(task.id, task.status);
    if (pa) {
      pendingApproval = pa;
      break;
    }
  }

  return { processedTasks, pendingApproval };
}
