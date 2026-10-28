import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { getContrastRatio } from '@mui/material/styles';
import {
  DEFAULT_APPEARANCE,
  normalizeAppearance,
  readAppearance,
  APPEARANCE_KEY,
} from '@/features/preferences/appearance';
import { PreferencesProvider, usePreferences } from '@/features/preferences/PreferencesProvider';
import { createAppTheme } from '@/theme/theme';
import { prepareArticle } from '@/features/posts/ArticleReader';
import '@/i18n';
vi.mock('@/components/Notifier', () => ({ useNotify: () => vi.fn() }));
function Controls() {
  const { appearance, setAppearance, setLanguage } = usePreferences();
  return (
    <>
      <button
        onClick={() => {
          setAppearance({ background: 'grid', font_family: 'system', font_size: 20 });
          setLanguage('en');
        }}
      >
        Customize
      </button>
      <output>
        {appearance.background}/{appearance.font_size}
      </output>
    </>
  );
}
describe('reader preferences', () => {
  it('persists choices and applies language direction', () => {
    render(
      <MemoryRouter>
        <PreferencesProvider>
          <Controls />
        </PreferencesProvider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('Customize'));
    expect(screen.getByText('grid/20')).toBeInTheDocument();
    expect(readAppearance().font_family).toBe('system');
    expect(document.documentElement.dir).toBe('ltr');
  });
  it('rejects arbitrary styles, font URLs and invalid persisted values', () => {
    expect(
      normalizeAppearance({
        accent_color: 'url(https://evil.invalid)',
        font_family: 'external',
        font_size: 999,
        background: 'image',
      }),
    ).toEqual(DEFAULT_APPEARANCE);
    localStorage.setItem(APPEARANCE_KEY, '{broken');
    expect(readAppearance()).toEqual(DEFAULT_APPEARANCE);
  });
  it.each(['#FFFFFF', '#000000', '#808080', '#D0152B', '#00FF00', '#FFFF00'])(
    'keeps readable labels for %s',
    (color) => {
      const theme = createAppTheme('rtl', { ...DEFAULT_APPEARANCE, accent_color: color });
      for (const scheme of ['light', 'dark'] as const) {
        const palette = theme.colorSchemes[scheme]!.palette;
        expect(getContrastRatio(palette.primary.main, palette.primary.contrastText)).toBeGreaterThanOrEqual(4.5);
        expect(getContrastRatio(palette.accent.text, palette.background.paper)).toBeGreaterThanOrEqual(4.5);
      }
    },
  );
});
describe('article reading', () => {
  it('builds safe stable anchors and copyable highlighted code', () => {
    const source =
      '<h2>مرحبا</h2><h3>Example</h3><pre><code class="language-js">const answer = 42;</code></pre><script>alert(1)</script><img src="x" onerror="alert(2)">';
    const article = prepareArticle(source, 'Copy');
    expect(article.headings.map((h) => h.id)).toEqual(['article-section-1', 'article-section-2']);
    expect(article.codes).toEqual(['const answer = 42;']);
    expect(article.html).toContain('data-copy-code="0"');
    expect(article.html).toContain('hljs-');
    expect(article.html).not.toMatch(/<script|onerror=/);
  });
});
