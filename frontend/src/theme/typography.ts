import type { TypographyVariantsOptions } from '@mui/material/styles';

/** Body, navigation, buttons and forms. */
export const bodyFont = 'var(--ad-font-body, "Tajawal"), system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
/** Main, hero and section headings. */
export const headingFont = 'var(--ad-font-heading, "Alexandria"), "Tajawal", system-ui, sans-serif';
/** The logo, large numbers and a few strong accents. */
export const displayFont = '"Anton", Impact, "Arial Narrow", sans-serif';
export const monoFont = '"JetBrains Mono", "Cascadia Code", Consolas, "SFMono-Regular", monospace';

export const typography: TypographyVariantsOptions = {
  fontFamily: bodyFont,
  fontSize: 15,
  htmlFontSize: 16,
  fontWeightLight: 300,
  fontWeightRegular: 400,
  fontWeightMedium: 500,
  fontWeightBold: 700,
  h1: { fontFamily: headingFont, fontWeight: 700, fontSize: '2.25rem', lineHeight: 1.3, letterSpacing: 0 },
  h2: { fontFamily: headingFont, fontWeight: 700, fontSize: '1.75rem', lineHeight: 1.35, letterSpacing: 0 },
  h3: { fontFamily: headingFont, fontWeight: 600, fontSize: '1.375rem', lineHeight: 1.4, letterSpacing: 0 },
  h4: { fontFamily: headingFont, fontWeight: 600, fontSize: '1.1875rem', lineHeight: 1.45, letterSpacing: 0 },
  h5: { fontFamily: headingFont, fontWeight: 600, fontSize: '1.0625rem', lineHeight: 1.5, letterSpacing: 0 },
  h6: { fontFamily: headingFont, fontWeight: 600, fontSize: '0.9375rem', lineHeight: 1.5, letterSpacing: 0 },
  subtitle1: { fontWeight: 700, fontSize: '1rem', lineHeight: 1.5 },
  subtitle2: { fontWeight: 700, fontSize: '0.875rem', lineHeight: 1.5 },
  body1: { fontSize: '1rem', lineHeight: 1.75 },
  body2: { fontSize: '0.9375rem', lineHeight: 1.65 },
  caption: { fontSize: '0.8125rem', lineHeight: 1.5 },
  overline: { fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.06em', lineHeight: 1.6 },
  button: { fontWeight: 700, fontSize: '0.9375rem', textTransform: 'none', letterSpacing: 0 },
};
