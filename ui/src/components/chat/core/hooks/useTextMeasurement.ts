/**
 * @file useTextMeasurement.ts
 * @description Hook for measuring text and calculating textarea rows.
 *
 * Used for auto-resizing textareas in chat inputs.
 * This implementation is more resilient with multiple measurement strategies and proper error handling.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseTextMeasurementOptions {
  /** The text to measure */
  text: string;
  /** Whether measurement is enabled */
  enabled?: boolean;
  /** Minimum rows */
  minRows?: number;
  /** Maximum rows */
  maxRows?: number;
  /** Debounce delay in ms */
  debounceMs?: number;
  /** Available width for text (accounts for buttons, padding, etc.) */
  availableWidth?: number;
}

export interface UseTextMeasurementReturn {
  /** Number of rows to display */
  numRows: number;
  /** Whether the text spans multiple rows */
  hasMultipleRows: boolean;
  /** Ref for the visible textarea */
  textareaRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  /** Whether measurement is currently active */
  isMeasuring: boolean;
}

/**
 * Hook for measuring text and calculating textarea rows.
 * Uses multiple resilient strategies for accurate measurement.
 */
export function useTextMeasurement({
  text,
  enabled = true,
  minRows = 1,
  maxRows = 10,
  debounceMs = 16, // ~60fps
  availableWidth
}: UseTextMeasurementOptions): UseTextMeasurementReturn {
  const [numRows, setNumRows] = useState(minRows);
  const [hasMultipleRows, setHasMultipleRows] = useState(false);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastMeasuredTextRef = useRef<string>('');

  // Calculate actual line height from the textarea
  const getLineHeight = useCallback((element: HTMLTextAreaElement): number => {
    const computedStyle = window.getComputedStyle(element);
    const lineHeight = computedStyle.lineHeight;

    if (lineHeight === 'normal') {
      // Estimate based on font-size
      const fontSize = parseFloat(computedStyle.fontSize);
      return Math.round(fontSize * 1.2); // Typical line-height multiplier
    }

    return parseFloat(lineHeight) || 20; // Fallback
  }, []);

  // Primary measurement strategy: Use a temporary textarea with identical styling
  const measureWithTempTextarea = useCallback(
    (element: HTMLTextAreaElement, textToMeasure: string): number => {
      const computedStyle = window.getComputedStyle(element);

      // Create a temporary textarea with identical styling
      const tempTextarea = document.createElement('textarea');
      tempTextarea.value = textToMeasure;
      tempTextarea.style.cssText = `
      position: absolute;
      top: -9999px;
      left: -9999px;
      width: ${availableWidth ?? element.clientWidth}px;
      font-family: ${computedStyle.fontFamily};
      font-size: ${computedStyle.fontSize};
      font-weight: ${computedStyle.fontWeight};
      line-height: ${computedStyle.lineHeight};
      letter-spacing: ${computedStyle.letterSpacing};
      word-spacing: ${computedStyle.wordSpacing};
      padding: ${computedStyle.padding};
      border: ${computedStyle.border};
      margin: 0;
      resize: none;
      overflow: hidden;
      white-space: pre-wrap;
      word-wrap: break-word;
      visibility: hidden;
    `;

      document.body.appendChild(tempTextarea);

      try {
        // Force layout calculation
        tempTextarea.scrollTop = 0;
        const scrollHeight = tempTextarea.scrollHeight;
        const lineHeight = getLineHeight(tempTextarea);

        // Calculate rows based on content height
        const rows = Math.max(1, Math.round(scrollHeight / lineHeight));

        return Math.max(minRows, Math.min(maxRows, rows));
      } finally {
        document.body.removeChild(tempTextarea);
      }
    },
    [getLineHeight, minRows, maxRows]
  );

  // Fallback measurement strategy: Simple character-based estimation
  const measureWithFallback = useCallback(
    (element: HTMLTextAreaElement, textToMeasure: string): number => {
      const avgCharsPerLine = 50; // Rough estimate
      const lines = Math.ceil(textToMeasure.length / avgCharsPerLine);
      return Math.max(minRows, Math.min(maxRows, lines));
    },
    [minRows, maxRows]
  );

  // Main measurement function with error handling
  const performMeasurement = useCallback(async () => {
    if (!enabled || !textareaRef.current || !text.trim()) {
      setNumRows(minRows);
      setHasMultipleRows(false);
      setIsMeasuring(false);
      return;
    }

    setIsMeasuring(true);

    try {
      const element = textareaRef.current;
      let calculatedRows: number;

      // Try primary measurement strategy
      try {
        calculatedRows = measureWithTempTextarea(element, text);
      } catch (error) {
        // Fallback to simple estimation
        calculatedRows = measureWithFallback(element, text);
      }

      // Ensure we're within bounds
      calculatedRows = Math.max(minRows, Math.min(maxRows, calculatedRows));

      setNumRows(calculatedRows);
      setHasMultipleRows(calculatedRows > 1);
    } catch (error) {
      // Ultimate fallback
      setNumRows(minRows);
      setHasMultipleRows(false);
    } finally {
      setIsMeasuring(false);
    }
  }, [enabled, text, minRows, maxRows, measureWithTempTextarea, measureWithFallback]);

  // Debounced measurement
  const debouncedMeasure = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      performMeasurement();
    }, debounceMs);
  }, [performMeasurement, debounceMs]);

  // Effect to trigger measurement when text changes
  useEffect(() => {
    if (!enabled || text === lastMeasuredTextRef.current) {
      return;
    }

    lastMeasuredTextRef.current = text;
    debouncedMeasure();
  }, [text, enabled, debouncedMeasure]);

  // Effect to measure when textarea becomes available
  useEffect(() => {
    if (enabled && textareaRef.current && text.trim() && lastMeasuredTextRef.current !== text) {
      lastMeasuredTextRef.current = text;
      performMeasurement();
    }
  }, [enabled, performMeasurement]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    numRows,
    hasMultipleRows,
    textareaRef,
    isMeasuring
  };
}
