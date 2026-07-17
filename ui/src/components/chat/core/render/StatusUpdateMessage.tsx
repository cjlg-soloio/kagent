import { Task, TaskStatusUpdateEvent } from '@a2a-js/sdk';
import MessageDisplay from 'Components/Chat/core/render/MessageDisplay';

interface StatusUpdateMessageProps {
  task: Task;
  statusUpdate: TaskStatusUpdateEvent;
}

const StatusUpdateMessage = ({ task, statusUpdate }: StatusUpdateMessageProps) => {
  // If the status update doesn't contain a message, don't render anything
  if (!statusUpdate.status.message) {
    return null;
  }

  // Render the contained message
  return <MessageDisplay task={task} message={statusUpdate.status.message} />;
};

export default StatusUpdateMessage;
