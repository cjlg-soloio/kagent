import { Message } from '@a2a-js/sdk';

export function processToolCallMessage(message: Message): Message {
  const processedMessage = { ...message };

  const meta = message.metadata;
  const originalType = meta?.originalType;
  const toolCallData = meta?.toolCallData;
  const expandsToolCallParts =
    (originalType === 'ToolCallRequestEvent' || originalType === 'ToolApprovalRequest') &&
    toolCallData &&
    Array.isArray(toolCallData);

  if (expandsToolCallParts) {
    if (message.parts.length === 1 && message.parts[0].kind === 'text' && message.parts[0].text === '') {
      processedMessage.parts = (toolCallData as any).map((data: any) => ({
        kind: 'data',
        data
      }));
    }
  }

  // Process tool call execution events
  if (
    message.metadata?.originalType === 'ToolCallExecutionEvent' &&
    message.metadata.toolResultData &&
    Array.isArray(message.metadata.toolResultData)
  ) {
    if (message.parts.length === 1 && message.parts[0].kind === 'text' && message.parts[0].text === '') {
      processedMessage.parts = (message.metadata.toolResultData as any).map((d: any) => ({
        kind: 'data',
        data: {
          id: d.call_id ?? '',
          name: d.name ?? '',
          response: {
            result: {
              content: [
                {
                  type: 'text',
                  text: d.content
                }
              ],
              isError: false
            }
          }
        }
      }));
    }
  }

  return processedMessage;
}
