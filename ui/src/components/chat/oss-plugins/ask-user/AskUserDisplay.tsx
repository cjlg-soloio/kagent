import styled from '@emotion/styled';
import { Button, Card, FlexLayout, Spacer, Text } from '@solo-io/ui-components-enterprise';
import { fontSizePx, spacingPx } from '@solo-io/ui-components-enterprise/styles';
import { useState } from 'react';
import { colors } from 'Styles';
import { AskUserQuestion, convertToUserFriendlyName } from 'Components/Chat/core/render/helpers/messageHelpers';

interface AskUserDisplayProps {
  questions: AskUserQuestion[];
  onSubmit: (answers: Array<{ answer: string[] }>) => void;
  isResolved?: boolean;
  resolvedAnswers?: Array<{ answer: string[] }> | null;
  subagentName?: string;
}

const ChoiceChip = styled.button<{ isSelected: boolean; isDisabled: boolean }>`
  padding: 4px 12px;
  border-radius: 16px;
  font-size: 13px;
  border: 1px solid ${({ isSelected }) => (isSelected ? colors.brand400 : colors.gray300)};
  background: ${({ isSelected }) => (isSelected ? 'rgba(99, 102, 241, 0.15)' : 'transparent')};
  color: ${({ isSelected }) => (isSelected ? colors.brand400 : colors.zinc500)};
  cursor: ${({ isDisabled }) => (isDisabled ? 'default' : 'pointer')};
  opacity: ${({ isDisabled }) => (isDisabled ? 0.8 : 1)};
  transition:
    border-color 0.15s,
    background 0.15s,
    color 0.15s;

  &:hover:not(:disabled) {
    border-color: ${colors.brand400};
    color: ${colors.brand400};
  }
`;

const FreeTextInput = styled.input`
  width: 100%;
  padding: 8px 12px;
  border-radius: 4px;
  border: 1px solid ${colors.gray300};
  background: ${colors.NEW_background};
  color: ${colors.NEW_fontWhite};
  font-size: 13px;

  &:disabled {
    opacity: 0.8;
    cursor: default;
  }
`;

const AnsweredBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #22c55e;
`;

const ReadOnlyAnswer = styled.div`
  padding: 6px 12px;
  border-radius: 4px;
  border: 1px solid ${colors.gray300};
  background: rgba(255, 255, 255, 0.05);
  color: ${colors.zinc500};
  font-size: 13px;
`;

/**
 * Renders the ask_user tool request as an interactive card.
 *
 * Pending state: shows each question with toggleable chips and a free-text
 *   input; a single Submit button at the bottom is enabled once every question
 *   has at least one answer.
 *
 * Resolved state: shows the same card but choices are non-interactive,
 *   selected answers are highlighted, and a green checkmark badge is shown.
 */
const AskUserDisplay = ({
  questions,
  onSubmit,
  isResolved = false,
  resolvedAnswers,
  subagentName
}: AskUserDisplayProps) => {
  const [selectedChoices, setSelectedChoices] = useState<string[][]>(questions.map(() => []));
  const [freeTextAnswers, setFreeTextAnswers] = useState<string[]>(questions.map(() => ''));
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleChoice = (qIdx: number, choice: string) => {
    if (isResolved || isSubmitting) return;
    setSelectedChoices(prev => {
      const next = prev.map(s => [...s]);
      const q = questions[qIdx];
      const isMultiple = q.multiple ?? false;
      if (next[qIdx].includes(choice)) {
        next[qIdx] = next[qIdx].filter(c => c !== choice);
      } else if (isMultiple) {
        next[qIdx] = [...next[qIdx], choice];
      } else {
        next[qIdx] = [choice];
      }
      return next;
    });
  };

  const setFreeText = (qIdx: number, value: string) => {
    setFreeTextAnswers(prev => {
      const next = [...prev];
      next[qIdx] = value;
      return next;
    });
  };

  const isReadyToSubmit = questions.every((_, i) => {
    return selectedChoices[i].length > 0 || freeTextAnswers[i].trim().length > 0;
  });

  const handleSubmit = () => {
    if (!isReadyToSubmit || isSubmitting) return;
    setIsSubmitting(true);
    const answers = questions.map((_, i) => {
      const chips = selectedChoices[i];
      const text = freeTextAnswers[i].trim();
      const combined = [...chips];
      if (text && !combined.includes(text)) {
        combined.push(text);
      }
      return { answer: combined.length > 0 ? combined : [text] };
    });
    onSubmit(answers);
  };

  const displayAnswers = isResolved && resolvedAnswers ? resolvedAnswers : null;

  return (
    <Card
      width={'100vw'}
      maxWidth={'100%'}
      padding={spacingPx.xl3}
      height={'fit-content'}
      style={{ borderLeft: `4px solid ${isResolved ? '#22c55e' : colors.brand400}` }}>
      {/* Header */}
      <FlexLayout wrap justifyContent='space-between' alignItems='center'>
        <FlexLayout wrap gap={spacingPx.sm} alignItems='center'>
          <Text color={colors.NEW_fontWhite} size={fontSizePx.md} weight='semibold'>
            Questions for you
          </Text>
          {subagentName && (
            <Text color={colors.zinc500} size={fontSizePx.sm}>
              via {convertToUserFriendlyName(subagentName)} subagent
            </Text>
          )}
        </FlexLayout>
        {isResolved && <AnsweredBadge>Answered</AnsweredBadge>}
      </FlexLayout>

      {/* Questions */}
      {questions.map((q, qIdx) => {
        const answered = displayAnswers?.[qIdx]?.answer ?? [];
        return (
          <Spacer key={qIdx} mt={spacingPx.lg}>
            <Text color={colors.NEW_fontWhite} size={fontSizePx.sm} weight='semibold'>
              {q.question}
            </Text>

            {/* Choice chips */}
            {q.choices && q.choices.length > 0 && (
              <Spacer mt={spacingPx.sm}>
                <FlexLayout gap={spacingPx.sm} flexWrap='wrap'>
                  {q.choices.map(choice => {
                    const isSelected = isResolved ? answered.includes(choice) : selectedChoices[qIdx].includes(choice);
                    return (
                      <ChoiceChip
                        key={choice}
                        type='button'
                        isSelected={isSelected}
                        isDisabled={isResolved || isSubmitting}
                        disabled={isResolved || isSubmitting}
                        onClick={() => toggleChoice(qIdx, choice)}>
                        {choice}
                      </ChoiceChip>
                    );
                  })}
                </FlexLayout>
              </Spacer>
            )}

            {/* Free-text input or resolved answer display */}
            <Spacer mt={spacingPx.sm}>
              {isResolved ? (
                (() => {
                  const chipAnswers = q.choices ?? [];
                  const freeAnswers = answered.filter(a => !chipAnswers.includes(a));
                  return freeAnswers.length > 0 ? <ReadOnlyAnswer>{freeAnswers.join(', ')}</ReadOnlyAnswer> : null;
                })()
              ) : (
                <FreeTextInput
                  value={freeTextAnswers[qIdx]}
                  onChange={e => setFreeText(qIdx, e.target.value)}
                  placeholder='Type your own answer'
                  disabled={isSubmitting}
                />
              )}
            </Spacer>
          </Spacer>
        );
      })}

      {/* Submit button */}
      {!isResolved && (
        <Spacer mt={spacingPx.lg}>
          <Button
            variant='solid'
            color='purple'
            size='sm'
            disabled={!isReadyToSubmit || isSubmitting}
            onClick={handleSubmit}>
            {isSubmitting ? 'Submitting...' : 'Submit'}
          </Button>
        </Spacer>
      )}
    </Card>
  );
};

export default AskUserDisplay;
