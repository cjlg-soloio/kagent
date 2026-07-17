/**
 * @file ExampleMessageCards.tsx
 * @description Example message cards component for ChatInput.
 */

import { css } from '@emotion/react';
import styled from '@emotion/styled';
import { Card, FlexLayout, Text, UnstyledButton } from '@solo-io/ui-components-enterprise';
import { CardStyles, fontSizePx, spacingPx } from '@solo-io/ui-components-enterprise/styles';
import { colors } from 'Styles';

const ExampleMessageButton = styled(UnstyledButton)(() => {
  return css`
    display: contents;
    ${CardStyles.Card} {
      position: relative;
    }
    &:hover {
      ${CardStyles.Card} {
        background: #37373d;
      }
      &:active {
        ${CardStyles.Card} {
          background: #3f3f48ff;
        }
      }
    }
  `;
});

export interface ExampleMessageCardsProps {
  /** Example messages to display */
  messages: string[];
  /** Callback when a message is clicked */
  onMessageClick: (message: string) => void;
}

/**
 * Example message cards component.
 */
export const ExampleMessageCards: React.FC<ExampleMessageCardsProps> = ({ messages, onMessageClick }) => {
  if (messages.length === 0) return null;

  return (
    <FlexLayout mt='29px' flexWrap='nowrap' gap={spacingPx.xl}>
      {messages.map(msg => (
        <ExampleMessageButton key={msg} onClick={() => onMessageClick(msg)}>
          <Card height='unset'>
            <Text color={colors.NEW_fontWhite} size={fontSizePx.xs} weight='normal' lineHeight='20px'>
              {msg}
            </Text>
          </Card>
        </ExampleMessageButton>
      ))}
    </FlexLayout>
  );
};
