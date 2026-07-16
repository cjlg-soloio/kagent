// acpChatProvider — adapts kagent's ACP harness transport to the shared
// `ChatProvider` seam consumed by `<Chat>` from `@solo-io-public/ui-components`.
//
// Unlike the A2A adapter, the ACP transport already lives behind a React hook
// (`useAcpHarnessChat`) that owns the WebSocket, the JSON-RPC bookkeeping and
// the session lifecycle, and exposes it as React state. So the cleanest wrapper
// is itself a hook: `useAcpChatProvider` calls the harness hook and projects its
// `{ conn, messages, streamingContent, sendMessage, cancel }` surface onto a
// stable ChatProvider object.
//
// This is a PARTIAL, illustrative adapter. The message-kind mapping is shared
// with the A2A adapter (the ACP hook already normalizes ACP `session/update`
// notifications into the same A2A `Message` shapes the rest of the chat UI
// renders), but a few mappings are non-trivial and left as TODO markers. See
// ./CONTRIBUTING_CHAT.md.

import { useMemo, useRef } from "react";
import type { Message } from "@a2a-js/sdk";
// TODO(shared-chat): resolves once the ui-components-oss version is bumped.
import type { ChatProvider, ChatMessage } from "@solo-io-public/ui-components";

import { useAcpHarnessChat, type UseAcpHarnessChatOptions } from "@/hooks/useAcpHarnessChat";
import { connToChatStatus } from "@/lib/acp";
import type { ChatStatus } from "@/types";
import { ADKMetadata, getMetadataValue } from "@/lib/messageHandlers";

// region Helpers

// NOTE: this mirrors a2aChatProvider.messageKind. Because useAcpHarnessChat
// already emits A2A `Message` shapes (tool calls carry the same data parts /
// originalType metadata), the SAME projection works for both transports.
// TODO(shared-chat): lift this into a single shared `a2aMessageToChatMessage`
// helper imported by both providers instead of duplicating it.
function messageKind(message: Message): string | undefined {
  const meta = message.metadata as ADKMetadata | undefined;
  const originalType = meta?.originalType;
  if (originalType === "AskUserRequest") return "ask-user";
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
    originalType === "ToolCallSummaryMessage";
  if (hasToolParts || isStreamingToolCall) return "tool-call";
  // TODO(shared-chat): ACP surfaces plan updates and permission prompts that
  // don't exist in A2A — map those to dedicated kinds (e.g. "acp-plan",
  // "acp-permission") and add matching renderers in KagentChat.
  return undefined;
}

function messageText(message: Message): string {
  return (message.parts ?? [])
    .filter((p) => p.kind === "text")
    .map((p) => (p as { text: string }).text)
    .join("");
}

function toChatMessage(message: Message, index: number): ChatMessage {
  const meta = message.metadata as ADKMetadata | undefined;
  return {
    id: message.messageId ?? `acp-${index}`,
    role: message.role === "user" ? "user" : "assistant",
    content: messageText(message),
    kind: messageKind(message),
    metadata: { a2a: message, adk: meta },
  };
}

/** ACP connection state → the shared provider status vocabulary. */
function chatStatusToProviderStatus(status: ChatStatus): "ready" | "streaming" | "error" {
  if (status === "ready") return "ready";
  if (status === "error") return "error";
  return "streaming";
}

// endregion

// region Provider

export type UseAcpChatProviderOptions = UseAcpHarnessChatOptions;

/**
 * Adapt the ACP harness hook into a ChatProvider. Because the underlying
 * transport is React state, this MUST be a hook. KagentChat calls it and passes
 * the returned provider to `<Chat>` when the agent is a substrate AgentHarness.
 */
export function useAcpChatProvider(options: UseAcpChatProviderOptions): ChatProvider {
  const { conn, messages, streamingContent, sendMessage, cancel } = useAcpHarnessChat(options);

  // The shared component subscribes via getState/subscribe. Under the hood the
  // hook re-renders KagentChat whenever ACP state changes, so a bare
  // getState()/no-op-subscribe provider re-reads fresh state on every render.
  // We keep a stable object identity (via refs) and only swap the closed-over
  // getState each render.
  const stateRef = useRef<{ messages: ChatMessage[]; status: string }>({ messages: [], status: "idle" });
  stateRef.current = {
    messages: (messages as Message[]).map(toChatMessage),
    status: chatStatusToProviderStatus(connToChatStatus(conn)),
  };

  // Streaming partial: append the in-flight assistant chunk as a synthetic
  // streaming message so `<Chat>` shows the live token stream.
  if (streamingContent) {
    stateRef.current.messages = [
      ...stateRef.current.messages,
      {
        id: "acp-streaming",
        role: "assistant",
        content: streamingContent,
        isStreaming: true,
      },
    ];
  }

  return useMemo<ChatProvider>(
    () => ({
      getState() {
        return stateRef.current;
      },
      // TODO(shared-chat): wire a real subscription. The hook drives re-renders
      // of the component that owns this provider, so today `<Chat>` sees fresh
      // state on each render; a proper store subscription would let `<Chat>`
      // update without a parent re-render.
      subscribe() {
        return () => {};
      },
      send(text: string) {
        sendMessage(text);
      },
      cancel() {
        cancel();
      },
      capabilities: {
        supportsCancel: true,
        // TODO(shared-chat): the ACP harness supports permission prompts and
        // plan streaming; expose those as capabilities once mapped to kinds.
        supportsAcpPlan: true,
      },
    }),
    // Stable identity for the lifetime of the mounted chat; the closures read
    // live values via refs / the hook's stable callbacks.
    [sendMessage, cancel],
  );
}

// endregion
