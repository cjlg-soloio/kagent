/**
 * @file processSSEStream.ts
 * @description Utility for processing Server-Sent Events (SSE) streams.
 *
 * Provides a generator function that parses SSE format and yields
 * individual events as they arrive. Handles:
 * - Buffering incomplete events
 * - Parsing JSON data payloads
 * - Detecting stream completion ([DONE] marker)
 *
 * @example
 * ```typescript
 * const response = await fetch('/api/stream');
 * if (response.body) {
 *   for await (const event of processSSEStream(response.body)) {
 *     console.log('Received event:', event);
 *   }
 * }
 * ```
 */

// ----------------------------------------------------------------------------
// region Types
// ----------------------------------------------------------------------------

/**
 * Options for processing SSE streams.
 */
export interface ProcessSSEStreamOptions {
  /**
   * Custom done marker to look for.
   * @default '[DONE]'
   */
  doneMarker?: string;

  /**
   * Whether to log parse errors to console.
   * @default true
   */
  logErrors?: boolean;
}

// ----------------------------------------------------------------------------
// region Stream Processor
// ----------------------------------------------------------------------------

/**
 * Generator function that processes SSE stream data.
 *
 * @param body - The readable stream body from a fetch response
 * @param options - Processing options
 * @yields Parsed event objects from the stream
 */
export async function* processSSEStream<T = unknown>(
  body: ReadableStream<Uint8Array>,
  options: ProcessSSEStreamOptions = {}
): AsyncIterable<T> {
  const { doneMarker = '[DONE]', logErrors = true } = options;

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      // Decode the chunk and add to buffer
      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE events (delimited by \n\n)
      let eventEndIndex: number;
      while ((eventEndIndex = buffer.indexOf('\n\n')) >= 0) {
        const eventText = buffer.substring(0, eventEndIndex);
        buffer = buffer.substring(eventEndIndex + 2);

        if (eventText.trim()) {
          // Parse SSE format: "data: <json>"
          const lines = eventText.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataString = line.substring(6);

              // Check for done marker
              if (dataString === doneMarker) {
                return;
              }

              try {
                const eventData = JSON.parse(dataString);
                // Yield either the 'result' property or the entire event
                yield (eventData.result || eventData) as T;
              } catch (error) {
                if (logErrors) {
                  // eslint-disable-next-line no-console
                  console.error('Failed to parse SSE data:', error, dataString);
                }
              }
            }
          }
        }
      }
    }
  } finally {
    // Always release the reader lock
    reader.releaseLock();
  }
}

// ----------------------------------------------------------------------------
// region Helper Functions
// ----------------------------------------------------------------------------

/**
 * Check if a value looks like a ReadableStream.
 */
export function isReadableStream(value: unknown): value is ReadableStream<Uint8Array> {
  return (
    value !== null &&
    typeof value === 'object' &&
    'getReader' in value &&
    typeof (value as ReadableStream).getReader === 'function'
  );
}

/**
 * Create an async iterable from an array (for testing).
 */
export async function* arrayToAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) {
    yield item;
  }
}
