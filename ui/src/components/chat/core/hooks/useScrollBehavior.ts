/**
 * @file useScrollBehavior.ts
 * @description React hook for managing scroll behavior in chat containers.
 *
 * Provides:
 * - Auto-scroll to bottom on new content
 * - "Scroll to bottom" button visibility
 * - Container width tracking for fixed positioning
 * - Sticky scroll anchoring during window/container resize
 *
 * Uses an IntersectionObserver on a sentinel element at the bottom of the
 * container to track whether the user is "at bottom." On resize, if the
 * sentinel was visible (user was at bottom), it is scrolled back into view.
 *
 * @example
 * ```typescript
 * const {
 *   scrollableRef,
 *   bottomSentinelRef,
 *   showScrollButton,
 *   scrollToBottom,
 *   buttonContainerWidth,
 * } = useScrollBehavior({ autoScrollOnChange: true });
 *
 * return (
 *   <div ref={scrollableRef}>
 *     {messages}
 *     <div ref={bottomSentinelRef} />
 *     {showScrollButton && <button onClick={scrollToBottom}>↓</button>}
 *   </div>
 * );
 * ```
 */

import { useEventListener } from '@solo-io/ui-components-enterprise/utils';
import { useCallback, useEffect, useRef, useState } from 'react';

// ----------------------------------------------------------------------------
// region Hook Options
// ----------------------------------------------------------------------------

/**
 * Options for useScrollBehavior hook.
 */
export interface UseScrollBehaviorOptions {
  /**
   * Whether to auto-scroll when dependencies change.
   * @default true
   */
  autoScrollOnChange?: boolean;

  /**
   * Dependencies that trigger auto-scroll when changed.
   */
  scrollTriggerDeps?: unknown[];
}

/**
 * Return type for useScrollBehavior hook.
 */
export interface UseScrollBehaviorReturn {
  /** Ref to attach to the scrollable container */
  scrollableRef: React.RefObject<HTMLDivElement | null>;

  /** Ref to attach to the sentinel element at the bottom of scrollable content */
  bottomSentinelRef: React.RefObject<HTMLDivElement | null>;

  /** Whether to show the "scroll to bottom" button */
  showScrollButton: boolean;

  /** Width for the scroll button container (for fixed positioning) */
  buttonContainerWidth: string;

  /** Scroll to bottom of container */
  scrollToBottom: () => void;

  /** Check if currently at bottom */
  isAtBottom: () => boolean;
}

// ----------------------------------------------------------------------------
// region Hook Implementation
// ----------------------------------------------------------------------------

/**
 * React hook for scroll behavior in chat containers.
 */
export function useScrollBehavior(options: UseScrollBehaviorOptions = {}): UseScrollBehaviorReturn {
  const { autoScrollOnChange = true, scrollTriggerDeps = [] } = options;

  // -------------------------------------------------------------------------
  // region State
  // -------------------------------------------------------------------------

  const scrollableRef = useRef<HTMLDivElement | null>(null);
  const bottomSentinelRef = useRef<HTMLDivElement | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [buttonContainerWidth, setButtonContainerWidth] = useState('100%');

  // Tracks whether the sentinel is currently visible in the scroll container.
  // This is the single source of truth for "user is at the bottom."
  const isSentinelVisibleRef = useRef(true);

  // -------------------------------------------------------------------------
  // region Helpers
  // -------------------------------------------------------------------------

  /**
   * Check if the sentinel element is visible (user is at bottom).
   */
  const isAtBottom = useCallback((): boolean => {
    return isSentinelVisibleRef.current;
  }, []);

  /**
   * Scroll the sentinel into view, anchoring the chat to the bottom.
   */
  const scrollToBottom = useCallback(() => {
    const sentinel = bottomSentinelRef.current;
    if (!sentinel) return;

    sentinel.scrollIntoView({ behavior: 'instant', block: 'end' });
    isSentinelVisibleRef.current = true;
    setShowScrollButton(false);
  }, []);

  // -------------------------------------------------------------------------
  // region IntersectionObserver — sticky tracking
  // -------------------------------------------------------------------------

  useEffect(() => {
    const container = scrollableRef.current;
    const sentinel = bottomSentinelRef.current;
    if (!container || !sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        isSentinelVisibleRef.current = entry.isIntersecting;
        setShowScrollButton(!entry.isIntersecting);
      },
      { root: container, threshold: 0 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // -------------------------------------------------------------------------
  // region Resize handling
  // -------------------------------------------------------------------------

  /**
   * On resize: update button width, and if the user was at the bottom,
   * scroll the sentinel back into view.
   */
  const handleResize = useCallback(() => {
    const el = scrollableRef.current;
    setButtonContainerWidth(el?.clientWidth ? `${el.clientWidth}px` : '100%');

    if (isSentinelVisibleRef.current) {
      const sentinel = bottomSentinelRef.current;
      if (sentinel) {
        sentinel.scrollIntoView({ behavior: 'instant', block: 'end' });
      }
    }
  }, []);

  // Observe the scrollable container for size changes.
  useEffect(() => {
    const el = scrollableRef.current;
    if (!el) return;

    const observer = new ResizeObserver(handleResize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleResize]);

  // Window resize covers cases like DevTools toggle that may not trigger
  // a ResizeObserver on the container.
  useEventListener(window, 'resize', handleResize, [handleResize]);

  // Initial calculation.
  useEffect(() => {
    handleResize();
  }, [handleResize]);

  // -------------------------------------------------------------------------
  // region Auto-scroll on content change
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (autoScrollOnChange) {
      scrollToBottom();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoScrollOnChange, scrollToBottom, ...scrollTriggerDeps]);

  // -------------------------------------------------------------------------
  // region Return
  // -------------------------------------------------------------------------

  return {
    scrollableRef,
    bottomSentinelRef,
    showScrollButton,
    buttonContainerWidth,
    scrollToBottom,
    isAtBottom
  };
}
