import { MessageSendParams, SendStreamingMessageSuccessResponse } from '@a2a-js/sdk';
import { StateMachine } from '@solo-io/ui-components-enterprise/utils';
import { a2AClient, buildKagentA2AUrl } from 'Api/external/kagent/a2aClient';
import { v4 as uuidv4 } from 'uuid';

/**
 * Summary of this file:
 *
 * - The `ChatStateMachine` class is used by the ChatManager class, and allows for configuring callbacks when entering/exiting states.
 * - The `ChatManager` also has callbacks, like `onEventReceived` and `onError`, that can be set directly on the class instance.
 * - `ChatManager.sendMessage` is how this class is interacted with, after callbacks are configured.
 * - The reasoning for these callbacks is because it improves:
 *   - Extensibility (adds the ability for React updates to be subsequently called)
 *   - Readability
 *   - Maintainability
 * - This file shouldn't need to be changed often, since logic is in callbacks.
 */

//
// region Chat State Machine
//

export enum ChatState {
  IDLE,
  SENDING,
  STREAMING,
  CANCELLING
}

/**
 * This class controls the different states that a chat session can be in.
 */
export class ChatStateMachine extends StateMachine<ChatState> {
  constructor() {
    super(ChatState.IDLE);
  }
}

//
// region Chat Manager
//

/**
 *
 * This manages a state machine, described with the following transitions:
 * Some of these are implicit, with the use of try/catch/finally.
 *
 * IDLE (initial state)
 *   -> SENDING (on message send)
 * SENDING
 *   -> STREAMING (after message is sent)
 *   -> CANCELLING (on cancel)
 * STREAMING
 *   -> STREAMING (on non-final event received)
 *   -> CANCELLING (on cancel)
 *   -> IDLE (on final event received)
 *   -> IDLE (on error)
 *   -> IDLE (on session change)
 * CANCELLING
 *   -> IDLE (after stream is cancelled)
 */
export class ChatManager {
  public csm = new ChatStateMachine();

  public onError: ((chatManger: ChatManager, error: any) => void) | undefined;
  public onEventReceived:
    | ((chatManger: ChatManager, event: SendStreamingMessageSuccessResponse['result']) => void)
    | undefined;

  /** Cancels the message stream. */
  cancelMessageStream() {
    a2AClient.cancelMessageStream();
    if (this.csm.curState === ChatState.STREAMING || this.csm.curState === ChatState.SENDING) {
      this.csm.transition(ChatState.CANCELLING);
    } else {
      this.csm.transition(ChatState.IDLE);
    }
  }

  public async sendMessage(
    agentCluster: string | undefined,
    agentNamespace: string | undefined,
    agentName: string | undefined,
    sessionId: string | undefined,
    latestAccessToken: string | undefined,
    messageString: string,
    /** Optional: provide a pre-built MessageSendParams (used for HITL decisions) */
    overrideParams?: MessageSendParams
  ) {
    if (!agentCluster || !agentNamespace || !agentName || !sessionId) {
      // eslint-disable-next-line no-console
      console.warn('Agent cluster, namespace, name, or session id not provided.');
      return;
    }

    try {
      this.csm.transition(ChatState.SENDING);

      const url = buildKagentA2AUrl(agentCluster, agentNamespace, agentName);
      const params: MessageSendParams = overrideParams ?? {
        message: {
          kind: 'message',
          messageId: uuidv4(),
          contextId: sessionId,
          role: 'user',
          parts: [
            {
              kind: 'text',
              text: messageString
            }
          ]
        }
      };
      const stream = await a2AClient.sendMessageStream(url, latestAccessToken, params);

      this.csm.transition(ChatState.STREAMING);

      // Keep track of the events so we know when to timeout.
      let lastEventTime = Date.now();
      const streamTimeout = 60000;

      // Listen as the events come in.
      for await (const event of stream) {
        lastEventTime = Date.now();

        try {
          this.onEventReceived?.(this, event);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('❌ Event that caused error:', event);
        }

        if (Date.now() - lastEventTime > streamTimeout) {
          // eslint-disable-next-line no-console
          console.warn(`⏰ Stream timeout - no events received for ${streamTimeout / 1000} seconds`);
          break;
        }
      }
    } catch (error: any) {
      this.onError?.(this, error);
    } finally {
      this.csm.transition(ChatState.IDLE);
    }
  }
}
