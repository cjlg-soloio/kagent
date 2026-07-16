// a2aChatProvider — adapts kagent's A2A / SSE transport to the shared
// `ChatProvider` seam consumed by `<Chat>` from `@solo-io-public/ui-components`.
//
// The shared component knows nothing about A2A, ADK metadata, sessions, or SSE.
// It only talks to a provider that can (a) hand back the current transcript as
// `ChatMessage[]` + a status, (b) let it subscribe to changes, and (c) accept
// `send` / `cancel`. Everything kagent-specific — session creation, task
// loading, tool-call / approval / token-usage metadata — is translated HERE and
// projected onto the generic `ChatMessage` shape (via `kind` + `metadata`), so
// the matching `renderers` in KagentChat can rebuild the rich kagent UI.
//
// This is a BASE adapter: the imperative send/stream plumbing is wired, but the
// full cross-tab sync guard, session-rename, and sandbox-readiness flows from
// ChatInterface.tsx are intentionally reduced to TODO markers. See
// ./CONTRIBUTING_CHAT.md.

import { v4 as uuidv4 } from "uuid";
import type { Message, Task } from "@a2a-js/sdk";
// TODO(shared-chat): these types come from the extracted package; the import
// will resolve once the ui-components-oss version is bumped and installed.
import type { ChatProvider, ChatMessage } from "@solo-io-public/ui-components";

import { kagentA2AClient } from "@/lib/a2aClient";
import {
  createMessage,
  createMessageHandlers,
  extractMessagesFromTasks,
  extractApprovalMessagesFromTasks,
  extractTokenStatsFromTasks,
  getMetadataValue,
  ADKMetadata,
} from "@/lib/messageHandlers";
import { getSessionTasks, createSession, getSessionWithEvents } from "@/app/actions/sessions";
import { deriveSessionTitle } from "@/lib/sessionTitle";
import type { TokenStats } from "@/types";

// region Helpers

/** kagent A2A roles → the shared ChatMessage role vocabulary. */
function a2aRoleToChatRole(role: Message["role"]): ChatMessage["role"] {
  return role === "user" ? "user" : "assistant";
}

/**
 * Derive the shared-component `kind` for an A2A message. `<Chat>` uses this to
 * pick a custom `renderers[kind]` entry; a plain assistant/user turn returns
 * `undefined` and falls through to the component's default markdown bubble.
 *
 * The mapping is the crux of the adapter: it is how kagent's tool-call cards,
 * approvals, ask-user prompts and MCP apps survive the trip through a generic
 * transport-agnostic component.
 */
function messageKind(
  message: Message,
  getMcpAppForTool?: (toolName: string) => unknown,
): string | undefined {
  const meta = message.metadata as ADKMetadata | undefined;
  const originalType = meta?.originalType;

  if (originalType === "AskUserRequest") return "ask-user";

  // A tool call that maps to an MCP App with interactive UI renders the app,
  // not the generic tool-call card. We detect it by the tool name on the call.
  const toolName = firstToolName(message);
  if (toolName && getMcpAppForTool?.(toolName)) return "data:mcp-app";

  const hasToolParts = message.parts?.some((part) => {
    if (part.kind === "data" && part.metadata) {
      const t = getMetadataValue<string>(part.metadata as Record<string, unknown>, "type");
      return t === "function_call" || t === "function_response";
    }
    return false;
  });
  const isStreamingToolCall =
    originalType === "ToolCallRequestEvent" ||
    originalType === "ToolCallExecutionEvent" ||
    originalType === "ToolCallSummaryMessage" ||
    originalType === "ToolApprovalRequest";

  if (hasToolParts || isStreamingToolCall) return "tool-call";

  return undefined;
}

/** Best-effort extraction of the first tool name referenced by a message. */
function firstToolName(message: Message): string | undefined {
  const meta = message.metadata as ADKMetadata | undefined;
  const calls = meta?.toolCallData;
  if (calls && calls.length > 0) return calls[0]?.name;
  // TODO(shared-chat): also inspect data parts for function_call names when the
  // tool name is not lifted into metadata.
  return undefined;
}

/** Flatten the text parts of an A2A message into the ChatMessage `content`. */
function messageText(message: Message): string {
  return (message.parts ?? [])
    .filter((p) => p.kind === "text")
    .map((p) => (p as { text: string }).text)
    .join("");
}

/**
 * The single projection from a kagent A2A `Message` to a shared `ChatMessage`.
 * The ORIGINAL A2A message is stashed on `metadata.a2a` so the kagent renderers
 * (ToolCallGroup / ToolCallDisplay / AskUserDisplay / MCP app) can reconstruct
 * the exact same UI they render today from the raw message + its ADK metadata.
 */
function toChatMessage(
  message: Message,
  getMcpAppForTool?: (toolName: string) => unknown,
): ChatMessage {
  const meta = message.metadata as ADKMetadata | undefined;
  return {
    id: message.messageId ?? uuidv4(),
    role: a2aRoleToChatRole(message.role),
    content: messageText(message),
    kind: messageKind(message, getMcpAppForTool),
    timestamp: (meta?.timestamp as number | undefined) ?? undefined,
    metadata: {
      // Raw A2A message + ADK metadata — the renderers read from here.
      a2a: message,
      adk: meta,
      // Surface per-message token usage so `tokenStats` / renderers can show it.
      tokenStats: (meta as { tokenStats?: TokenStats } | undefined)?.tokenStats,
    },
  };
}

// endregion

// region Provider

export interface A2aChatProviderOptions {
  namespace: string;
  agentName: string;
  /** DB/session id; undefined for a brand-new chat until the first send. */
  sessionId?: string;
  /** Read/stream through a share link (read-only viewers pass this). */
  shareToken?: string;
  /** Sandbox agents stream through the a2a-sandboxes proxy. */
  runInSandbox?: boolean;
  /** MCP-app resolver from ChatMcpAppsContext (drives the `data:mcp-app` kind). */
  getMcpAppForTool?: (toolName: string) => unknown;
  /** Notify the sidebar/router when the first send lazily creates a session. */
  onSessionCreated?: (sessionId: string) => void;
}

type Status = "idle" | "loading" | "ready" | "streaming" | "input-required" | "error";

/**
 * Build a ChatProvider backed by kagent's A2A client. This is a plain (non-React)
 * store so it can be memoized once per session inside KagentChat and handed to
 * `<Chat>`. Internally it keeps the same stored/streaming split ChatInterface
 * uses and re-runs the projection to `ChatMessage[]` on every mutation.
 */
export function createA2aChatProvider(opts: A2aChatProviderOptions): ChatProvider {
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((cb) => cb());

  // Internal A2A state, mirroring ChatInterface's stored + streaming split.
  let storedA2A: Message[] = [];
  let streamingA2A: Message[] = [];
  let streamingContent = "";
  let isStreaming = false;
  let status: Status = opts.sessionId ? "loading" : "idle";
  let error: string | undefined;
  let sessionId = opts.sessionId;
  let abortController: AbortController | null = null;
  const pendingTurnStatsRef: { current: TokenStats | undefined } = { current: undefined };

  // Recompute the flattened ChatMessage[] the shared component reads. Cached so
  // getState() is cheap and stable between notifications.
  let cachedMessages: ChatMessage[] = [];
  const recompute = () => {
    const combined = [...storedA2A, ...streamingA2A];
    cachedMessages = combined.map((m) => toChatMessage(m, opts.getMcpAppForTool));
    notify();
  };

  // createMessageHandlers speaks React setState (value OR functional updater);
  // bridge those onto our plain fields.
  const makeSetter =
    <T,>(get: () => T, set: (v: T) => void) =>
    (next: T | ((prev: T) => T)) => {
      const value = typeof next === "function" ? (next as (p: T) => T)(get()) : next;
      set(value);
    };

  const { handleMessageEvent } = createMessageHandlers({
    setMessages: makeSetter(
      () => streamingA2A,
      (v) => {
        streamingA2A = v;
        recompute();
      },
    ),
    setIsStreaming: makeSetter(
      () => isStreaming,
      (v) => {
        isStreaming = v;
      },
    ),
    setStreamingContent: makeSetter(
      () => streamingContent,
      (v) => {
        streamingContent = v;
        recompute();
      },
    ),
    // Map kagent's fine-grained ChatStatus onto our coarse provider status.
    setChatStatus: makeSetter(
      () => status,
      (v) => {
        status = v === "ready" ? "ready" : v === "input_required" ? "input-required" : "streaming";
        notify();
      },
    ),
    // TODO(shared-chat): session token totals currently only feed the
    // `tokenStats` prop indirectly via per-message metadata; expose an
    // aggregate on the provider for the header stat.
    setSessionStats: () => {},
    pendingTurnStats: pendingTurnStatsRef,
    agentContext: { namespace: opts.namespace, agentName: opts.agentName },
  });

  // Load the persisted transcript for an existing session on first getState.
  let loaded = false;
  const loadOnce = async () => {
    if (loaded || !sessionId) return;
    loaded = true;
    status = "loading";
    notify();
    try {
      if (opts.shareToken) {
        // Read-only share links resolve read_only via the session-info endpoint.
        await getSessionWithEvents(sessionId, opts.shareToken);
      }
      const res = await getSessionTasks(sessionId, opts.shareToken);
      const tasks = (res.data ?? []) as Task[];
      const extracted = extractMessagesFromTasks(tasks);
      const { messages: pending, hasPendingApproval } = extractApprovalMessagesFromTasks(tasks);
      storedA2A = hasPendingApproval ? [...extracted, ...pending] : extracted;
      // extractTokenStatsFromTasks(tasks) → aggregate usage; see setSessionStats TODO.
      void extractTokenStatsFromTasks;
      status = hasPendingApproval ? "input-required" : "ready";
      // TODO(shared-chat): resubscribe to a still-running task (RESUBSCRIBE_TASK_STATES)
      // via kagentA2AClient.resubscribeStream so a reopened in-flight chat keeps streaming.
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load messages";
      status = "error";
    }
    recompute();
  };

  const streamMessage = async (a2aMessage: Message, sid: string) => {
    abortController = new AbortController();
    status = "streaming";
    notify();
    try {
      const stream = await kagentA2AClient.sendMessageStream(
        opts.namespace,
        opts.agentName,
        { message: a2aMessage, metadata: {} },
        abortController.signal,
        opts.runInSandbox ?? false,
        opts.shareToken,
      );
      for await (const event of stream) {
        try {
          handleMessageEvent(event as Message);
        } catch (err) {
          console.error("a2aChatProvider: error handling stream event", err);
        }
        if (abortController?.signal.aborted) break;
      }
      // Fold the completed streaming turn into the stored transcript.
      storedA2A = [...storedA2A, ...streamingA2A];
      streamingA2A = [];
      streamingContent = "";
      isStreaming = false;
      if (status !== "input-required") status = "ready";
      void sid; // TODO(shared-chat): refresh the cross-tab high-water mark here.
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        status = "ready";
      } else {
        error = e instanceof Error ? e.message : "Streaming failed";
        status = "error";
      }
    } finally {
      abortController = null;
      recompute();
    }
  };

  return {
    getState() {
      // Lazily kick off the initial load the first time the component reads state.
      void loadOnce();
      return { messages: cachedMessages, status, error };
    },

    subscribe(cb: () => void) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    async send(text: string) {
      const trimmed = text.trim();
      if (!trimmed) return;

      const messageId = uuidv4();
      // Optimistically show the user's message immediately.
      const optimistic = createMessage(trimmed, "user", { messageId, contextId: sessionId });
      streamingA2A = [optimistic];
      recompute();

      // Lazily create a session on the first send of a new chat.
      if (!sessionId) {
        try {
          const created = await createSession({
            agent_ref: `${opts.namespace}/${opts.agentName}`,
            name: deriveSessionTitle(trimmed),
          });
          if (created.error || !created.data) {
            error = created.error ?? "Failed to create session";
            status = "error";
            recompute();
            return;
          }
          sessionId = created.data.id;
          opts.onSessionCreated?.(sessionId);
          // TODO(shared-chat): also mirror ChatInterface's URL replaceState +
          // "new-session-created" event + placeholder-title rename here.
        } catch (e) {
          error = e instanceof Error ? e.message : "Failed to create session";
          status = "error";
          recompute();
          return;
        }
      }

      const a2aMessage = createMessage(trimmed, "user", { messageId, contextId: sessionId });
      await streamMessage(a2aMessage, sessionId!);
    },

    cancel() {
      abortController?.abort();
      isStreaming = false;
      streamingContent = "";
      status = "ready";
      recompute();
    },

    capabilities: {
      supportsCancel: true,
      // kagent-specific capability flags the renderers/messageActions can read.
      supportsToolApproval: true,
      supportsShare: !opts.shareToken,
      supportsAskUser: true,
    },
  };
}

// endregion
