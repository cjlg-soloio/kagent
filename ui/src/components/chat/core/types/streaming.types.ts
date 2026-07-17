/**
 * @file streaming.types.ts
 * @description Types for streaming chat events.
 *
 * Defines the event structures received during SSE streaming from A2A agents.
 * These types are compatible with the @a2a-js/sdk event format.
 */

// ----------------------------------------------------------------------------
// region Event Kinds
// ----------------------------------------------------------------------------

/**
 * All possible streaming event kinds.
 */
export type StreamingEventKind = 'status-update' | 'artifact-update' | 'message' | 'error' | 'done';

// ----------------------------------------------------------------------------
// region Event Payloads
// ----------------------------------------------------------------------------

/**
 * Status update event payload.
 * Received when task status changes.
 */
export interface StatusUpdatePayload {
  state: string;
  message?: {
    kind: string;
    messageId: string;
    contextId: string;
    role: string;
    parts: Array<{
      kind: string;
      text?: string;
    }>;
  };
}

/**
 * Artifact update event payload.
 * Received when a task produces an artifact.
 */
export interface ArtifactUpdatePayload {
  artifactId: string;
  name?: string;
  parts: Array<{
    kind: string;
    text?: string;
    [key: string]: unknown;
  }>;
}

// ----------------------------------------------------------------------------
// region Streaming Events
// ----------------------------------------------------------------------------

/**
 * Base streaming event structure.
 * All streaming events share these common properties.
 */
export interface BaseStreamingEvent {
  /** The type of event */
  kind: StreamingEventKind;

  /** Task ID this event relates to */
  taskId?: string;

  /** Session/context ID */
  contextId?: string;
}

/**
 * Status update streaming event.
 */
export interface StatusUpdateEvent extends BaseStreamingEvent {
  kind: 'status-update';
  status: StatusUpdatePayload;
}

/**
 * Artifact update streaming event.
 */
export interface ArtifactUpdateEvent extends BaseStreamingEvent {
  kind: 'artifact-update';
  artifact: ArtifactUpdatePayload;
}

/**
 * Message streaming event.
 * Direct message event (less common than status-update with message).
 */
export interface MessageEvent extends BaseStreamingEvent {
  kind: 'message';
  messageId: string;
  role: string;
  parts: Array<{
    kind: string;
    text?: string;
  }>;
}

/**
 * Error streaming event.
 */
export interface ErrorEvent extends BaseStreamingEvent {
  kind: 'error';
  error: {
    code: string;
    message: string;
  };
}

/**
 * Done streaming event.
 * Signals the end of a streaming session.
 */
export interface DoneEvent extends BaseStreamingEvent {
  kind: 'done';
}

/**
 * Union type of all streaming events.
 * This is the primary type used when processing streaming responses.
 */
export type StreamingEvent = StatusUpdateEvent | ArtifactUpdateEvent | MessageEvent | ErrorEvent | DoneEvent;

// ----------------------------------------------------------------------------
// region Callback Types
// ----------------------------------------------------------------------------

/**
 * Callback for receiving streaming events.
 */
export type OnStreamingEvent = (event: StreamingEvent) => void;

/**
 * Callback for streaming errors.
 */
export type OnStreamingError = (error: Error) => void;

/**
 * Callback for streaming completion.
 */
export type OnStreamingComplete = () => void;

// ----------------------------------------------------------------------------
// region Type Guards
// ----------------------------------------------------------------------------

/**
 * Type guard for status update events.
 */
export function isStatusUpdateEvent(event: StreamingEvent): event is StatusUpdateEvent {
  return event.kind === 'status-update';
}

/**
 * Type guard for artifact update events.
 */
export function isArtifactUpdateEvent(event: StreamingEvent): event is ArtifactUpdateEvent {
  return event.kind === 'artifact-update';
}

/**
 * Type guard for message events.
 */
export function isMessageEvent(event: StreamingEvent): event is MessageEvent {
  return event.kind === 'message';
}

/**
 * Type guard for error events.
 */
export function isErrorEvent(event: StreamingEvent): event is ErrorEvent {
  return event.kind === 'error';
}

/**
 * Type guard for done events.
 */
export function isDoneEvent(event: StreamingEvent): event is DoneEvent {
  return event.kind === 'done';
}
