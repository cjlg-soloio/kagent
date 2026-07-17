import styled from '@emotion/styled';
import { spacingPx } from '@solo-io/ui-components-enterprise/styles';
import { colors } from 'Styles';

export const TaskContainer = styled.div`
  width: 100%;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  gap: 29px;
  position: relative;
`;

export const TaskStatusContainer = styled.div`
  margin-bottom: ${spacingPx.md};
`;

export const TaskArtifactsContainer = styled.div`
  margin-top: ${spacingPx.md};
  display: flex;
  flex-direction: column;
  gap: ${spacingPx.md};
`;

export const PulsingDot = styled.div`
  width: 8px;
  height: 8px;
  background: ${colors.brand400};
  border-radius: 50%;
  animation: pulse 1.5s ease-in-out infinite;

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.5;
      transform: scale(1.2);
    }
  }
`;
