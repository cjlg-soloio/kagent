import { Task, TaskArtifactUpdateEvent } from '@a2a-js/sdk';
import { Card } from '@solo-io/ui-components-enterprise';
import { useParams } from 'react-router-dom';
import { createMessage, getSourceFromMetadata } from 'Components/Chat/core/render/helpers/messageHelpers';
import MessageDisplay from 'Components/Chat/core/render/MessageDisplay';

interface ArtifactUpdateMessageProps {
  task: Task;
  artifactUpdate: TaskArtifactUpdateEvent;
}

const ArtifactUpdateMessage = ({ task, artifactUpdate }: ArtifactUpdateMessageProps) => {
  const { agentName } = useParams();

  // If no artifact parts, don't render anything
  if (!artifactUpdate.artifact.parts.length) {
    return null;
  }

  const firstPart = artifactUpdate.artifact.parts[0];

  // Only handle text parts for now
  if (firstPart.kind !== 'text') {
    return <Card>Unable to display artifact type: {firstPart.kind}</Card>;
  }

  // Convert artifact to message format for consistent rendering
  const message = createMessage(
    firstPart.text,
    getSourceFromMetadata(artifactUpdate.metadata, (agentName ?? 'Agent').replace(/_/g, '-')),
    {
      taskId: artifactUpdate.taskId,
      additionalMetadata: artifactUpdate.metadata,
      contextId: artifactUpdate.contextId
    }
  );

  return <MessageDisplay task={task} message={message} />;
};

export default ArtifactUpdateMessage;
