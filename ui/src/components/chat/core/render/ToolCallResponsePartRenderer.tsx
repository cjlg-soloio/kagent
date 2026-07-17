import { css } from '@emotion/react';
import {
  CodeSyntaxHighlighter,
  FlexLayout,
  MarkdownRenderer,
  Spacer,
  Svg,
  Text,
  Tooltip
} from '@solo-io/ui-components-enterprise';
import { fontSizePx, radiusPx, spacingPx } from '@solo-io/ui-components-enterprise/styles';
import { Asset } from 'assets';
import { useMemo } from 'react';
import { colors } from 'Styles';
import { convertToUserFriendlyName } from 'Components/Chat/core/render/helpers/messageHelpers';
import { ToolCallChainedResponseType, ToolCallResponseType } from 'Components/Chat/core/render/DataPartRenderer';

/**
 * Attempts to coerce the response into a chained response object type.
 * (if there were subsequent tool calls, this would be the final response).
 */
const useGetChainedResponse = (response: ToolCallResponseType | undefined) => {
  return useMemo<ToolCallChainedResponseType | undefined>(() => {
    if (!response?.result || typeof response.result !== 'string') {
      return undefined;
    }
    try {
      const jsonResponse = JSON.parse(response.result);
      if ('id' in jsonResponse && 'name' in jsonResponse && 'response' in jsonResponse) {
        return jsonResponse;
      }
    } catch {}
    return undefined;
  }, [response]);
};

//
// region Component
//

const ToolCallResponsePartRenderer = ({
  response,
  includeResultsLabel = true
}: {
  response: ToolCallResponseType | undefined;
  includeResultsLabel?: boolean;
}) => {
  const responseAsChainedResponse = useGetChainedResponse(response);
  const isResponseChained = !!responseAsChainedResponse;

  //
  // region Render
  //
  if (!response) {
    return null;
  }
  if (isResponseChained) {
    return (
      <>
        <FlexLayout flexDirection='column' gap={spacingPx.sm} mt={spacingPx.lg}>
          <Tooltip title={`The '${convertToUserFriendlyName(responseAsChainedResponse.name)}' tool was called here.`}>
            <FlexLayout wrap width='100%' pt={spacingPx.xl3} pb={spacingPx.xl5}>
              <FlexLayout
                wrap
                width='100%'
                justifyContent='center'
                stylingOverrides={css`
                  position: relative;
                  border-bottom: 2px solid ${colors.zinc700};
                `}>
                <Svg
                  styleOverrides={css`
                    position: absolute;
                    top: -15px;
                    left: 50%;
                    border: 2px solid ${colors.zinc700};
                    border-radius: 50%;
                    background-color: ${colors.NEW_background};
                  `}
                  asset={Asset.ArrowUp}
                  color={colors.zinc500}
                  size={30}
                  rotate='180deg'
                />
              </FlexLayout>
            </FlexLayout>
          </Tooltip>

          <FlexLayout wrap justifyContent='space-between' alignItems='center'>
            <FlexLayout wrap gap={spacingPx.sm} alignItems='center'>
              <Text color={colors.zinc500} size={fontSizePx.md}>
                Tool:
              </Text>
              <Text color={colors.NEW_fontWhite} size={fontSizePx.md}>
                {convertToUserFriendlyName(responseAsChainedResponse.name)}
              </Text>
            </FlexLayout>
            <Text size={fontSizePx.sm} color={colors.zinc500}>
              {responseAsChainedResponse.id}
            </Text>
          </FlexLayout>
        </FlexLayout>

        <ToolCallResponsePartRenderer response={responseAsChainedResponse.response} />
      </>
    );
  }
  return (
    <>
      {includeResultsLabel && (
        <Text mt={spacingPx.lg} color={colors.zinc500} size={fontSizePx.sm} weight='bold'>
          Results
        </Text>
      )}
      {!response.result ? (
        <Spacer mt={spacingPx.lg}>
          <CodeSyntaxHighlighter maxHeight={500} contentString={'No Results'} type={'plain'} />
        </Spacer>
      ) : typeof response.result === 'string' ? (
        <Spacer mt={spacingPx.lg}>
          <Spacer
            padding={spacingPx.xl}
            stylingOverrides={css`
              border: 1px solid ${colors.zinc800};
              border-radius: ${radiusPx.md};
            `}>
            <MarkdownRenderer text={response.result} />
          </Spacer>
        </Spacer>
      ) : typeof response.result === 'number' || typeof response.result === 'boolean' ? (
        <Spacer mt={spacingPx.lg}>
          <CodeSyntaxHighlighter maxHeight={500} contentString={String(response.result)} type={'plain'} />
        </Spacer>
      ) : response.result?.content?.length ? (
        response.result.content.map((c: any) => (
          <Spacer mt={spacingPx.lg} key={c.text}>
            <CodeSyntaxHighlighter maxHeight={500} contentString={c.text} type={'plain'} />
          </Spacer>
        ))
      ) : (
        <Spacer mt={spacingPx.lg}>
          <CodeSyntaxHighlighter
            maxHeight={500}
            contentString={JSON.stringify(response.result, null, 2)}
            type={'json'}
          />
        </Spacer>
      )}
    </>
  );
};

export default ToolCallResponsePartRenderer;
