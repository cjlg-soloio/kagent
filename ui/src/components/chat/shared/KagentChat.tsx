"use client";

// KagentChat — kagent's single chat entry point, now rendered by the shared
// `<Chat>` component extracted into `@solo-io-public/ui-components`.
//
// See ./CONTRIBUTING_CHAT.md for the full picture. In short: the chat UI (input,
// transcript, minimap, token stats, share, feedback) is OWNED by ui-components-oss
// now. kagent contributes only two things:
//   1. a `ChatProvider` (the transport) — a2a or acp, chosen like the pages did;
//   2. kagent-specific rendering, injected via `renderers` (keyed by
//      `message.kind`), `messageActions`, and `slots` — tool-call cards, MCP
//      apps, ask-user prompts, and the voice/speech composer button.
// Built-in OSS features are toggled by named props: `tokenStats`, `minimap`,
// `share`, `feedback`.
//
// To add or change a SHARED chat feature, contribute to ui-components-oss
// (see that package's src/components/Chat/README.md) and bump the version here —
// do NOT re-fork the component into kagent.
//
// TODO(shared-chat): this is a BASE integration and does not yet typecheck.

import type React from "react";
import { useMemo } from "react";
import { Mic, Square } from "lucide-react";
// TODO(shared-chat): resolves once the ui-components-oss version is bumped.
import { Chat, type ChatMessage } from "@solo-io-public/ui-components";

import { createA2aChatProvider } from "./a2aChatProvider";
import { useAcpChatProvider } from "./acpChatProvider";

// Reused, unchanged kagent rendering primitives — injected as renderers/slots.
import ToolCallDisplay from "@/components/chat/ToolCallDisplay";
import AskUserDisplay, { type AskUserQuestion } from "@/components/chat/AskUserDisplay";
import { useChatMcpApps } from "@/components/chat/ChatMcpAppsContext";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { submitPositiveFeedback, submitNegativeFeedback } from "@/app/actions/feedback";
import { createSessionShare } from "@/app/actions/sessionShares";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Message } from "@a2a-js/sdk";

// region Component

export interface KagentChatProps {
  namespace: string;
  agentName: string;
  /** DB session id; for ACP harness chats this is also the ACP session id. */
  sessionId?: string;
  /** Read-only / interactive share link token. */
  shareToken?: string;
  shareReadOnly?: boolean;
  /** Sandbox agents stream through the a2a-sandboxes proxy. */
  runInSandbox?: boolean;
  /** Set for substrate AgentHarness agents: routes to the ACP provider. */
  acpPath?: string;
  /** ACP: connect + resume on mount (existing chats). */
  autoConnect?: boolean;
  /** ACP: session id to load on mount (sidebar click). */
  initialLoadSessionId?: string;
}

/**
 * Voice/speech composer button, injected via `slots.composerActions`. Uses
 * kagent's existing `useSpeechRecognition` hook; the shared component owns the
 * text input, so this only needs to push transcribed text into it. The input
 * value is bridged through the shared component's controlled input (via the
 * `onTranscript` handler passed down from Chat's composer context).
 */
function VoiceComposerButton({ onTranscript }: { onTranscript: (text: string) => void }) {
  const { isListening, isSupported, startListening, stopListening, error } = useSpeechRecognition({
    onResult: onTranscript,
    onError: (msg) => toast.error(msg),
  });
  if (!isSupported) return null;
  return (
    <Button
      type="button"
      variant={isListening ? "destructive" : "default"}
      size="icon"
      onClick={isListening ? stopListening : startListening}
      className={isListening ? "animate-pulse" : ""}
      aria-label={isListening ? "Stop listening" : "Voice input"}
      title={error ?? (isListening ? "Stop listening" : "Voice input — click and speak")}
    >
      {isListening ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
    </Button>
  );
}

export default function KagentChat({
  namespace,
  agentName,
  sessionId,
  shareToken,
  shareReadOnly,
  runInSandbox,
  acpPath,
  autoConnect,
  initialLoadSessionId,
}: KagentChatProps) {
  const { getMcpAppForTool } = useChatMcpApps();
  const isAcp = !!acpPath;

  // --- Choose the transport provider, exactly like the pages branched between
  // <ChatInterface> (A2A) and <AcpHarnessChat> (ACP). ------------------------

  // A2A: plain factory, memoized once per session.
  const a2aProvider = useMemo(
    () =>
      createA2aChatProvider({
        namespace,
        agentName,
        sessionId,
        shareToken,
        runInSandbox,
        getMcpAppForTool,
        onSessionCreated: () => {
          // TODO(shared-chat): mirror ChatInterface's URL replaceState +
          // "new-session-created" sidebar event on lazy session creation.
        },
      }),
    [namespace, agentName, sessionId, shareToken, runInSandbox, getMcpAppForTool],
  );

  // ACP: hook-based adapter (owns the WebSocket via useAcpHarnessChat).
  // TODO(shared-chat): rules-of-hooks — this hook is always called even for A2A
  // agents. Split KagentChat into <KagentA2aChat> / <KagentAcpChat> wrappers so
  // each only instantiates its own provider, or make the A2A adapter a hook too.
  const acpProvider = useAcpChatProvider({
    acpPath: acpPath ?? "",
    namespace,
    agentName,
    sessionId,
    initialLoadSessionId,
    autoConnect,
  });

  const provider = isAcp ? acpProvider : a2aProvider;

  // --- kagent-specific rendering, injected via the generic extension seams. --

  const renderers = useMemo(
    () => ({
      // Tool-call runs + approvals: reuse the existing kagent card. The raw A2A
      // message (and full transcript for result correlation) travels on
      // message.metadata.a2a, set by the provider's projection.
      "tool-call": (message: ChatMessage, ctx: { allMessages: ChatMessage[] }) => {
        const raw = message.metadata?.a2a as Message;
        const allRaw = (ctx?.allMessages ?? []).map((m) => m.metadata?.a2a as Message).filter(Boolean);
        return (
          <ToolCallDisplay
            currentMessage={raw}
            allMessages={allRaw}
            getMcpAppForTool={getMcpAppForTool}
            // TODO(shared-chat): route approvals back through provider.send with
            // the batch-decision payload (see ChatInterface.sendApprovalDecision).
            // onApprove / onReject / pendingDecisions belong here.
          />
        );
      },

      // MCP Apps with interactive UI: the same ToolCallDisplay renders the app
      // surface (via getMcpAppForTool + onMcpAppSendMessage) instead of a plain
      // tool card. Kept as its own kind so the minimap / grouping can treat MCP
      // apps as standalone, as ChatInterface did.
      "data:mcp-app": (message: ChatMessage, ctx: { allMessages: ChatMessage[] }) => {
        const raw = message.metadata?.a2a as Message;
        const allRaw = (ctx?.allMessages ?? []).map((m) => m.metadata?.a2a as Message).filter(Boolean);
        return (
          <ToolCallDisplay
            currentMessage={raw}
            allMessages={allRaw}
            getMcpAppForTool={getMcpAppForTool}
            // TODO(shared-chat): the MCP app's ui/message channel should call
            // provider.send() to inject a follow-up user turn (was
            // handleMcpAppSendMessage in ChatInterface).
          />
        );
      },

      // ask_user prompts render the interactive question card.
      "ask-user": (message: ChatMessage) => {
        const meta = message.metadata?.adk as
          | { askUserData?: { questions: AskUserQuestion[] }; approvalDecision?: unknown; askUserAnswers?: Array<{ answer: string[] }> }
          | undefined;
        return (
          <AskUserDisplay
            questions={meta?.askUserData?.questions ?? []}
            isResolved={!!meta?.approvalDecision}
            resolvedAnswers={meta?.askUserAnswers ?? null}
            // TODO(shared-chat): wire onSubmit to provider.send with the
            // ask_user_answers decision payload (see handleAskUserSubmit).
          />
        );
      },
    }),
    [getMcpAppForTool],
  );

  return (
    <Chat
      provider={provider}
      title={`${namespace}/${agentName}`}
      placeholder="Type your message…"
      // Built-in OSS features toggled by named props.
      tokenStats={{ label: "Usage" }}
      minimap
      feedback={{
        // Reuse kagent's feedback server actions. messageId is kagent's numeric id.
        onSubmit: (messageId, direction, detail) => {
          const numeric = Number(messageId);
          if (direction === "up") {
            void submitPositiveFeedback(numeric, detail ?? "");
          } else {
            void submitNegativeFeedback(numeric, detail ?? "");
          }
        },
      }}
      share={
        shareToken
          ? // Viewing through a share link: no create-link control.
            { onCreateLink: () => {}, readOnly: !!shareReadOnly }
          : {
              // Reuse kagent's share server action; the shared component owns the
              // link-management dialog UI.
              onCreateLink: async () => {
                if (!sessionId) return;
                const res = await createSessionShare(sessionId, /* readOnly */ true);
                if (res.error || !res.data) {
                  toast.error(res.error ?? "Failed to create share link");
                }
                // TODO(shared-chat): surface the created token/URL back to the
                // shared share dialog once its onCreateLink contract returns it.
              },
              readOnly: false,
            }
      }
      renderers={renderers}
      // TODO(shared-chat): messageActions could expose per-message kagent
      // actions (copy, re-run) once the seam is finalized.
      slots={{
        composerActions: (
          <VoiceComposerButton
            onTranscript={(text) => {
              // TODO(shared-chat): the shared composer must expose a setter for
              // its controlled input; today this is a placeholder that would
              // push transcribed text into Chat's input via composer context.
              void text;
            }}
          />
        ),
      }}
    />
  );
}

// endregion
