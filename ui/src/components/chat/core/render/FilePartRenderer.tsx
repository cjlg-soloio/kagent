import { FilePart, Message, Task } from '@a2a-js/sdk';

interface FilePartRendererProps {
  task: Task;
  message: Message;
  part: FilePart;
}

const FilePartRenderer = ({ part }: FilePartRendererProps) => {
  return <div>A file was returned: {JSON.stringify(part)}</div>;
};

export default FilePartRenderer;
