import { ToolDecision } from 'Api/external/kagent/types';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

/**
 * HITL (Human-in-the-Loop) decision context.
 *
 * Owns the per-tool decision collection state (approve/deny clicks) and
 * exposes callbacks for the approval UI components deep in the tree.
 *
 * The actual submission to the backend (`submitDecisions`) is injected by
 * the parent (`ScrollableChatTasks`) because it needs access to `chatManager`,
 * `curStreamingTask`, etc.
 */

// ---------------------------------------------------------------------------
// region  Types
// ---------------------------------------------------------------------------

export interface HitlContextValue {
  pendingApproval: { taskId: string; toolIds: string[] } | null;
  pendingDecisions: Record<string, ToolDecision>;
  handleApprove: (toolCallId: string) => void;
  handleReject: (toolCallId: string, reason?: string) => void;
  handleAskUserSubmit: (answers: Array<{ answer: string[] }>) => void;
  readOnly: boolean;
}

// ---------------------------------------------------------------------------
// region  Context
// ---------------------------------------------------------------------------

export const HitlContext = createContext<HitlContextValue | null>(null);

export function useHitl(): HitlContextValue {
  const ctx = useContext(HitlContext);
  if (!ctx) {
    throw new Error('useHitl must be used inside a <HitlProvider>');
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// region  Provider
// ---------------------------------------------------------------------------

interface HitlProviderProps {
  pendingApproval: { taskId: string; toolIds: string[] } | null;
  /** Called when all tools have been decided (or ask-user answered). */
  onSubmitDecisions: (decisionPayload: Record<string, unknown>) => void;
  /** When true the HITL UI is display-only — no interactive buttons or inputs. */
  readOnly?: boolean;
  children: React.ReactNode;
}

export function HitlProvider({ pendingApproval, onSubmitDecisions, readOnly = false, children }: HitlProviderProps) {
  // Per-tool decision state
  const [pendingDecisions, setPendingDecisions] = useState<Record<string, ToolDecision>>({});
  const pendingDecisionsRef = useRef<Record<string, ToolDecision>>({});
  const pendingRejectionReasonsRef = useRef<Record<string, string>>({});

  // ---- Decision collection helpers ----------------------------------------

  const checkAndSubmitDecisions = useCallback(() => {
    if (!pendingApproval) return;
    const { toolIds } = pendingApproval;
    const allDecided = toolIds.every(id => id in pendingDecisionsRef.current);
    if (!allDecided) return;

    const decisions = pendingDecisionsRef.current;
    const rejectionReasons = pendingRejectionReasonsRef.current;

    const allApprove = toolIds.every(id => decisions[id] === 'approve');
    const allDeny = toolIds.every(id => decisions[id] === 'reject');
    const hasRejectionReasons = Object.keys(rejectionReasons).length > 0;

    let decisionPayload: Record<string, unknown>;
    if (allApprove) {
      decisionPayload = { decision_type: 'approve' };
    } else if (allDeny && !hasRejectionReasons) {
      decisionPayload = { decision_type: 'reject' };
    } else {
      decisionPayload = {
        decision_type: 'batch',
        decisions,
        ...(hasRejectionReasons ? { rejection_reasons: rejectionReasons } : {})
      };
    }

    onSubmitDecisions(decisionPayload);
  }, [pendingApproval, onSubmitDecisions]);

  const handleApprove = useCallback(
    (toolCallId: string) => {
      pendingDecisionsRef.current = { ...pendingDecisionsRef.current, [toolCallId]: 'approve' };
      setPendingDecisions({ ...pendingDecisionsRef.current });
      checkAndSubmitDecisions();
    },
    [checkAndSubmitDecisions]
  );

  const handleReject = useCallback(
    (toolCallId: string, reason?: string) => {
      pendingDecisionsRef.current = { ...pendingDecisionsRef.current, [toolCallId]: 'reject' };
      setPendingDecisions({ ...pendingDecisionsRef.current });
      if (reason) {
        pendingRejectionReasonsRef.current = { ...pendingRejectionReasonsRef.current, [toolCallId]: reason };
      }
      checkAndSubmitDecisions();
    },
    [checkAndSubmitDecisions]
  );

  const handleAskUserSubmit = useCallback(
    (answers: Array<{ answer: string[] }>) => {
      if (!pendingApproval) return;
      const decisionPayload: Record<string, unknown> = {
        decision_type: 'approve',
        ask_user_answers: answers
      };
      onSubmitDecisions(decisionPayload);
    },
    [pendingApproval, onSubmitDecisions]
  );

  // Reset local decision state when pendingApproval is cleared externally
  // (submitDecisions in ScrollableChatTasks sets pendingApproval to null).
  useEffect(() => {
    if (!pendingApproval) {
      pendingDecisionsRef.current = {};
      pendingRejectionReasonsRef.current = {};
      setPendingDecisions({});
    }
  }, [pendingApproval]);

  const value: HitlContextValue = {
    pendingApproval,
    pendingDecisions,
    handleApprove,
    handleReject,
    handleAskUserSubmit,
    readOnly
  };

  return <HitlContext.Provider value={value}>{children}</HitlContext.Provider>;
}
