import Box from '@mui/material/Box';
import type { Theme } from '@mui/material/styles';
import type { SystemStyleObject } from '@mui/system';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';

import { headingFont, monoFont } from '@/theme/typography';
import { sanitizePostHtml } from '@/utils/html';

/**
 * Typography for rendered posts; shared by the feed, the post page and the editor.
 * Indents and borders use logical properties so they follow each block's own direction
 * (an English quote inside the Arabic UI keeps its bar on the left).
 */
export const postContentStyles: SystemStyleObject<Theme> = {
  fontSize: '1rem',
  lineHeight: 1.8,
  color: 'text.primary',
  overflowWrap: 'anywhere',
  // :not(* + *) is the first element child (avoids Emotion's :first-child SSR warning).
  '& > :not(* + *)': { mt: 0 },
  '& > :last-child': { mb: 0 },
  '& p': { my: 1 },
  '& h2': { fontFamily: headingFont, fontWeight: 700, fontSize: '1.3125rem', lineHeight: 1.45, mt: 2.5, mb: 1 },
  '& h3': { fontFamily: headingFont, fontWeight: 600, fontSize: '1.125rem', lineHeight: 1.5, mt: 2, mb: 0.75 },
  '& h4': { fontFamily: headingFont, fontWeight: 600, fontSize: '1rem', mt: 1.5, mb: 0.5 },
  '& ul, & ol': { paddingInlineStart: '24px', my: 1 },
  '& li': { my: 0.25 },
  '& li > p': { my: 0 },
  '& blockquote': {
    mx: 0,
    my: 1.5,
    paddingInlineStart: '16px',
    py: 0.25,
    borderInlineStart: (theme: Theme) => `3px solid ${(theme.vars ?? theme).palette.primary.main}`,
    color: 'text.secondary',
  },
  '& a': { color: 'accent.text', textDecoration: 'underline', textUnderlineOffset: '3px' },
  '& code': {
    fontFamily: monoFont,
    fontSize: '0.875em',
    px: 0.5,
    py: 0.125,
    borderRadius: 0.75,
    bgcolor: 'surface.sunken',
    border: 1,
    borderColor: 'divider',
  },
  '& pre': {
    my: 1.5,
    p: 2,
    borderRadius: 2,
    overflowX: 'auto',
    bgcolor: '#111113',
    color: '#EDEDEA',
    fontSize: '0.875rem',
    lineHeight: 1.65,
    border: 1,
    borderColor: 'surface.borderStrong',
    '& code': { p: 0, border: 0, bgcolor: 'transparent', color: 'inherit', fontSize: 'inherit' },
  },
  '& table': {
    display: 'block',
    overflowX: 'auto',
    borderCollapse: 'collapse',
    my: 1.5,
    maxWidth: '100%',
  },
  '& th, & td': {
    border: 1,
    borderColor: 'divider',
    px: 1.25,
    py: 0.75,
    verticalAlign: 'top',
    textAlign: 'start',
    minWidth: 80,
    '& p': { m: 0 },
  },
  '& th': { bgcolor: 'surface.sunken', fontWeight: 700 },
  '& hr': { border: 0, borderTop: 1, borderColor: 'divider', my: 2 },
};

interface PostContentProps {
  html: string;
  /** Limit the height (feed cards); reports whether content was cut. */
  clampHeight?: number;
  onOverflowChange?: (overflowing: boolean) => void;
}

export function PostContent({ html, clampHeight, onOverflowChange }: PostContentProps) {
  const ref = useRef<HTMLDivElement>(null);
  const safeHtml = useMemo(() => sanitizePostHtml(html), [html]);
  const [overflowing, setOverflowing] = useState(false);

  useLayoutEffect(() => {
    if (!clampHeight || !ref.current) return;
    const next = ref.current.scrollHeight > clampHeight + 8;
    setOverflowing(next);
    onOverflowChange?.(next);
  }, [safeHtml, clampHeight, onOverflowChange]);

  return (
    <Box sx={{ position: 'relative' }}>
      <Box
        ref={ref}
        dir="auto"
        sx={[postContentStyles, clampHeight ? { maxHeight: clampHeight, overflow: 'hidden' } : {}]}
        // The HTML was cleaned on the server and again by sanitizePostHtml above.
        // oxlint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />
      {clampHeight && overflowing && (
        <Box
          aria-hidden
          sx={(theme) => ({
            position: 'absolute',
            insetInline: 0,
            bottom: 0,
            height: 64,
            pointerEvents: 'none',
            background: `linear-gradient(to bottom, transparent, ${(theme.vars ?? theme).palette.background.paper})`,
          })}
        />
      )}
    </Box>
  );
}
