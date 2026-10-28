import { Box, Button, Link, Stack, Typography } from '@mui/material';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import hljs from 'highlight.js/lib/common';
import 'highlight.js/styles/github-dark.css';
import { sanitizePostHtml } from '@/utils/html';
import { postContentStyles } from './PostContent';
import { useNotify } from '@/components/Notifier';
export function prepareArticle(html: string, copyLabel: string) {
  const doc = new DOMParser().parseFromString(sanitizePostHtml(html), 'text/html');
  const headings = Array.from(doc.querySelectorAll('h2, h3')).map((heading, index) => {
    heading.id = `article-section-${index + 1}`;
    return { id: heading.id, title: heading.textContent ?? '', nested: heading.tagName === 'H3' };
  });
  const codes: string[] = [];
  doc.querySelectorAll('pre').forEach((pre) => {
    const code = pre.querySelector('code');
    if (!code) return;
    const value = code.textContent ?? '';
    codes.push(value);
    const language = Array.from(code.classList)
      .find((c) => c.startsWith('language-'))
      ?.slice(9);
    // Bound highlighting work for large code blocks. highlight.js escapes source text.
    if (value.length <= 20000)
      code.innerHTML =
        language && hljs.getLanguage(language)
          ? hljs.highlight(value, { language }).value
          : hljs.highlightAuto(value, ['javascript', 'typescript', 'python', 'css', 'xml', 'json', 'bash', 'sql'])
              .value;
    pre.dir = 'ltr';
    pre.tabIndex = 0;
    const button = doc.createElement('button');
    button.type = 'button';
    button.dataset.copyCode = String(codes.length - 1);
    button.textContent = copyLabel;
    pre.before(button);
  });
  return { html: doc.body.innerHTML, headings, codes };
}
export function ArticleReader({ html }: { html: string }) {
  const { t } = useTranslation();
  const notify = useNotify();
  const article = useMemo(() => prepareArticle(html, t('community.copyCode')), [html, t]);
  return (
    <>
      {article.headings.length > 1 && (
        <Box
          component="nav"
          aria-label={t('community.toc')}
          sx={{ bgcolor: 'surface.sunken', borderRadius: 2, p: 2, mb: 3 }}
        >
          <Typography sx={{ fontWeight: 700 }} gutterBottom>
            {t('community.toc')}
          </Typography>
          <Stack component="ol" sx={{ m: 0, paddingInlineStart: 3 }}>
            {article.headings.map((h) => (
              <Box component="li" key={h.id} sx={{ marginInlineStart: h.nested ? 2 : 0 }}>
                <Link href={`#${h.id}`} sx={{ display: 'inline-block', py: 0.5 }}>
                  {h.title}
                </Link>
              </Box>
            ))}
          </Stack>
        </Box>
      )}
      <Box
        dir="auto"
        onClick={(e) => {
          const target = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-copy-code]');
          if (!target) return;
          const code = article.codes[Number(target.dataset.copyCode)];
          if (code !== undefined)
            void navigator.clipboard
              .writeText(code)
              .then(() => notify(t('community.copied')))
              .catch(() => notify(t('community.copyFailed'), 'error'));
        }}
        sx={[
          postContentStyles,
          {
            '& h2, & h3': { scrollMarginTop: 90 },
            '& button[data-copy-code]': {
              font: 'inherit',
              color: 'inherit',
              bgcolor: 'surface.sunken',
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
              minHeight: 44,
              px: 2,
              cursor: 'pointer',
              mt: 2,
            },
            '& pre': { mt: 0.5 },
          },
        ]}
        // oxlint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: article.html }}
      />
      <Button href="#post-title" sx={{ mt: 2 }}>
        {t('community.backToTop')}
      </Button>
    </>
  );
}
