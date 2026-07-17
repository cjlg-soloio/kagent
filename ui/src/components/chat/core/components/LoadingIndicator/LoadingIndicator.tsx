/**
 * @file components/LoadingIndicator/LoadingIndicator.tsx
 * @description Minimal animated loading indicator for chat messages.
 *
 * Displays a sleek spinner with animated ellipses to indicate
 * that the agent is actively thinking and processing.
 *
 */

import styled from '@emotion/styled';
import { FlexLayout, Spacer, Text } from '@solo-io/ui-components-enterprise';
import { fontSizePx, spacingPx } from '@solo-io/ui-components-enterprise/styles';
import { useEffect, useRef, useState } from 'react';
import { colors } from 'Styles';

// ----------------------------------------------------------------------------
// region Styled Components
// ----------------------------------------------------------------------------

/**
 * Spinning loader animation.
 */
const Spinner = styled.div`
  position: absolute;
  width: 10px;
  height: 10px;
  margin-top: 1px;
  border: 1px solid transparent;
  border-top-color: ${colors.NEW_fontLightGray};
  border-radius: 50%;
  animation: spin 1s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

const Spinner2 = styled(Spinner)`
  animation-delay: 0.2s;
`;

// If we wanted an inner circle:
// const Spinner3 = styled(Spinner)`
//   position: absolute;
//   margin: 4px;
//   width: 8px;
//   height: 8px;
//   opacity: 0.6;
//   animation-duration: 2s;
//   border-right-color: ${colors.NEW_fontLightGray};
// `;

/**
 * Container for the loading indicator.
 */
const LoadingContainer = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacingPx.md};
  padding-bottom: ${spacingPx.md};
`;

/**
 * Animated thinking text with diagonal gradient shimmer.
 */
const ThinkingText = styled(Text)`
  background: linear-gradient(
    135deg,
    ${colors.NEW_fontMidGray} 40%,
    ${colors.NEW_fontLightGray} 50%,
    ${colors.NEW_fontMidGray} 70%
  );
  background-size: 200% 100%;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: shimmer 6s linear infinite;

  @keyframes shimmer {
    0% {
      background-position: 200% 0%;
    }
    100% {
      background-position: -200% 0%;
    }
  }
`;

// ----------------------------------------------------------------------------
// region Types
// ----------------------------------------------------------------------------

/**
 * Props for the LoadingIndicator component.
 */
export interface LoadingIndicatorProps {
  /** Base text to display (ellipses will be added) */
  baseText?: string;

  /**
   * Whether to show the spinner animation.
   * @default true
   */
  showSpinner?: boolean;

  /**
   * Custom render function for the indicator.
   * If provided, overrides default rendering.
   */
  renderCustom?: () => React.ReactNode;
}

// ----------------------------------------------------------------------------
// region Component
// ----------------------------------------------------------------------------

/**
 * Minimal animated loading indicator component.
 */
export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  baseText = 'Thinking',
  showSpinner = true,
  renderCustom
}) => {
  const ellipsesCountRef = useRef(0);
  const [displayText, setDisplayText] = useState(baseText);

  useEffect(() => {
    const ellipsesAnimMS = 400;
    const interval = setInterval(() => {
      ellipsesCountRef.current = (ellipsesCountRef.current + 1) % 4;
      const ellipses = '.'.repeat(ellipsesCountRef.current);
      setDisplayText(`${baseText}${ellipses}`);
    }, ellipsesAnimMS);

    return () => clearInterval(interval);
  }, [baseText]);

  if (renderCustom) {
    return <>{renderCustom()}</>;
  }

  return (
    <FlexLayout wrap justifyContent='flex-start'>
      <LoadingContainer>
        {showSpinner && (
          <Spacer width='12px' height='12px' position='relative'>
            <Spinner />
            <Spinner2 />
            {/* <Spinner3 /> */}
          </Spacer>
        )}
        <ThinkingText size={fontSizePx.sm} weight='normal'>
          {displayText}
        </ThinkingText>
      </LoadingContainer>
    </FlexLayout>
  );
};
