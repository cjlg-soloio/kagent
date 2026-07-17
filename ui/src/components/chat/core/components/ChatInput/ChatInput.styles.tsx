/**
 * @file ChatInput.styles.tsx
 * @description Styled components for the ChatInput component.
 *
 * Extracted and consolidated from ChatPromptBox.tsx and SharedChatInput.tsx.
 */

import { css } from '@emotion/react';
import styled from '@emotion/styled';

import { Card } from '@solo-io/ui-components-enterprise';
import { dontForwardProps, fontSizePxValue, radiusPx, spacingPx } from '@solo-io/ui-components-enterprise/styles';
import { colors } from 'Styles';

// ----------------------------------------------------------------------------
// region Constants
// ----------------------------------------------------------------------------

/** Maximum visible rows in the textarea */
export const MAX_ROWS = 10;

/** Height of each row in pixels */
export const ROW_HEIGHT_PX = 25.15;

/** Font size for the prompt box */
export const PROMPT_BOX_FONT_SIZE = fontSizePxValue.md;

// ----------------------------------------------------------------------------
// region Container Styles
// ----------------------------------------------------------------------------

/**
 * Main container card with rainbow border option.
 */
export const ChatInputCard = styled(
  Card,
  dontForwardProps('hasMultipleRows', 'showRainbowBorder')
)<{
  hasMultipleRows: boolean;
  showRainbowBorder: boolean;
}>(
  ({ hasMultipleRows, showRainbowBorder }) => css`
    padding: 0px;
    width: 100%;
    height: min-content;
    padding: 8px 12px;
    display: flex;
    align-items: center;
    transition: 1ms height;

    ${hasMultipleRows
      ? css`
          flex-wrap: wrap !important;
        `
      : ''}

    &,
    &:after {
      border-radius: ${radiusPx.xl4};
    }

    ${showRainbowBorder
      ? css`
          /* Rainbow border effect handled by boxShadowType='rainbow' on Card */
        `
      : ''}
  `
);

/**
 * Simple container variant (no rainbow border).
 */
export const SimpleInputContainer = styled.div`
  display: flex;
  align-items: flex-end;
  gap: ${spacingPx.sm};
  width: 100%;
`;

// ----------------------------------------------------------------------------
// region Textarea Styles
// ----------------------------------------------------------------------------

/**
 * Container for the textarea with overflow handling.
 */
export const TextAreaContainer = styled.div`
  overflow: auto;
  width: 100%;
  flex-basis: 100%;
  flex-grow: 1;
  max-height: ${MAX_ROWS * ROW_HEIGHT_PX}px;
  display: flex;
  align-items: center;
`;

/**
 * The main textarea element.
 */
export const StyledTextArea = styled.textarea<{ variant?: 'rainbow' | 'simple' }>(
  ({ variant = 'rainbow' }) => css`
    width: 100%;
    border-width: 0px;
    background-color: transparent;
    resize: none;
    color: ${colors.zinc400};
    font-size: ${PROMPT_BOX_FONT_SIZE}px;
    overflow: hidden;
    flex-grow: 1;
    border-radius: ${radiusPx.md};
    // padding: 0px;
    padding: ${radiusPx.xs};

    :focus:not(.focus-visible) {
      outline: none;
    }

    :focus-visible {
      outline-offset: 2px;
      outline: 2px solid ${colors.grayLight300};
    }

    ${variant === 'simple'
      ? css`
          min-height: 60px;
          padding: ${spacingPx.sm};
          border: 1px solid ${colors.grayLight300};
          background-color: ${colors.slate800};
          color: ${colors.white};
          resize: vertical;
        `
      : ''}
  `
);

/**
 * Hidden textarea for measuring text rows.
 */
export const MeasurementTextArea = styled(StyledTextArea)<{ widthPx: number }>(
  ({ widthPx }) => css`
    width: ${widthPx}px;
    max-height: 0px;
    overflow: hidden;
    border: none;
    margin: 0px;
    padding: 0px;
    position: absolute;
    visibility: hidden;
  `
);

// ----------------------------------------------------------------------------
// region Button Styles
// ----------------------------------------------------------------------------

/**
 * Container for action buttons.
 */
export const ButtonContainer = styled.div`
  display: flex;
  flex-grow: 1;
  justify-content: flex-end;
  gap: ${spacingPx.sm};
`;
