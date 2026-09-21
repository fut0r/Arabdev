import { alpha, createTheme, type Theme } from '@mui/material/styles';

import { brand, neutralDark, neutralLight, postTextColors } from './colors';
import { displayFont, headingFont, monoFont, typography } from './typography';
import { layout, radii, shadowScale } from './tokens';

declare module '@mui/material/styles' {
  interface Palette {
    accent: { text: string; subtle: string; hover: string };
    surface: { sunken: string; borderStrong: string };
  }
  interface PaletteOptions {
    accent?: { text: string; subtle: string; hover: string };
    surface?: { sunken: string; borderStrong: string };
  }
}

export const COLOR_MODE_STORAGE_KEY = 'arabdev.mode';

function buildShadows(): Theme['shadows'] {
  const shadows = Array<string>(25).fill(shadowScale.lg);
  shadows[0] = shadowScale.none;
  shadows[1] = shadowScale.sm;
  shadows[2] = shadowScale.sm;
  shadows[3] = shadowScale.md;
  shadows[4] = shadowScale.md;
  return shadows as Theme['shadows'];
}

export function createAppTheme(direction: 'rtl' | 'ltr'): Theme {
  return createTheme({
    direction,
    cssVariables: { colorSchemeSelector: 'data-mui-color-scheme', cssVarPrefix: 'ad' },
    colorSchemes: {
      light: {
        palette: {
          primary: { main: brand.red, dark: brand.redDark, light: '#E8475A', contrastText: '#FFFFFF' },
          secondary: { main: '#1D1D1F', contrastText: '#FFFFFF' },
          error: { main: '#B42318' },
          success: { main: '#1E7B4A' },
          warning: { main: '#9A6700' },
          info: { main: '#2C5282' },
          background: { default: neutralLight.background, paper: neutralLight.paper },
          text: {
            primary: neutralLight.textPrimary,
            secondary: neutralLight.textSecondary,
            disabled: '#A3A19D',
          },
          divider: neutralLight.border,
          accent: { text: '#C8102E', subtle: alpha(brand.red, 0.07), hover: alpha(brand.red, 0.12) },
          surface: { sunken: neutralLight.sunken, borderStrong: neutralLight.borderStrong },
        },
      },
      dark: {
        palette: {
          primary: {
            main: brand.redDarkScheme,
            dark: '#B81C2C',
            light: brand.redTextDarkScheme,
            contrastText: '#FFFFFF',
          },
          secondary: { main: '#F2F2F0', contrastText: '#141414' },
          error: { main: '#FF6B6B' },
          success: { main: '#4CC38A' },
          warning: { main: '#F2C94C' },
          info: { main: '#7FB3F5' },
          background: { default: neutralDark.background, paper: neutralDark.paper },
          text: {
            primary: neutralDark.textPrimary,
            secondary: neutralDark.textSecondary,
            disabled: '#6B6B67',
          },
          divider: neutralDark.border,
          accent: {
            text: brand.redTextDarkScheme,
            subtle: alpha(brand.redTextDarkScheme, 0.1),
            hover: alpha(brand.redTextDarkScheme, 0.16),
          },
          surface: { sunken: neutralDark.sunken, borderStrong: neutralDark.borderStrong },
        },
      },
    },
    typography,
    shape: { borderRadius: radii.md },
    shadows: buildShadows(),
    components: {
      MuiCssBaseline: {
        styleOverrides: (theme) => ({
          ':root': {
            '--ad-text-red': postTextColors.light.red,
            '--ad-text-crimson': postTextColors.light.crimson,
            '--ad-text-ink': postTextColors.light.ink,
            '--ad-text-graphite': postTextColors.light.graphite,
            '--ad-text-muted': postTextColors.light.muted,
            '--ad-font-display': displayFont,
            '--ad-font-heading': headingFont,
            '--ad-font-mono': monoFont,
          },
          '[data-mui-color-scheme="dark"]': {
            '--ad-text-red': postTextColors.dark.red,
            '--ad-text-crimson': postTextColors.dark.crimson,
            '--ad-text-ink': postTextColors.dark.ink,
            '--ad-text-graphite': postTextColors.dark.graphite,
            '--ad-text-muted': postTextColors.dark.muted,
          },
          html: { scrollPaddingTop: layout.appBarHeight + 16 },
          body: {
            backgroundColor: theme.vars.palette.background.default,
            WebkitFontSmoothing: 'antialiased',
            MozOsxFontSmoothing: 'grayscale',
            textRendering: 'optimizeLegibility',
          },
          '::selection': { backgroundColor: theme.vars.palette.accent.hover },
          ':focus-visible': {
            outline: `2px solid ${theme.vars.palette.primary.main}`,
            outlineOffset: 2,
          },
          'code, pre, kbd': { fontFamily: monoFont },
          a: { color: 'inherit', textDecoration: 'none' },
          '@media (prefers-reduced-motion: reduce)': {
            '*, *::before, *::after': {
              transitionDuration: '0.01ms !important',
              animationDuration: '0.01ms !important',
            },
          },
          // The same, for people who asked for it under Settings rather than in the OS.
          '[data-reduce-motion="true"] *, [data-reduce-motion="true"] *::before, [data-reduce-motion="true"] *::after':
            {
              transitionDuration: '0.01ms !important',
              animationDuration: '0.01ms !important',
              scrollBehavior: 'auto !important',
            },
        }),
      },
      MuiButtonBase: { defaultProps: { disableRipple: false } },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: radii.md, paddingInline: 16, minHeight: 38 },
          sizeSmall: { minHeight: 32, paddingInline: 12, fontSize: '0.875rem' },
          sizeLarge: { minHeight: 46, fontSize: '1rem' },
          outlined: ({ theme }) => ({ borderColor: theme.vars.palette.surface.borderStrong }),
          text: { paddingInline: 10 },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: ({ theme }) => ({
            '&:focus-visible': { outline: `2px solid ${theme.vars.palette.primary.main}`, outlineOffset: 1 },
          }),
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: { backgroundImage: 'none' },
          outlined: ({ theme }) => ({ borderColor: theme.vars.palette.divider }),
        },
      },
      MuiCard: {
        defaultProps: { variant: 'outlined' },
        styleOverrides: { root: { borderRadius: radii.lg } },
      },
      MuiAppBar: {
        defaultProps: { elevation: 0, color: 'inherit' },
        styleOverrides: {
          root: ({ theme }) => ({
            backgroundColor: theme.vars.palette.background.paper,
            borderBottom: `1px solid ${theme.vars.palette.divider}`,
          }),
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: radii.md,
            backgroundColor: theme.vars.palette.background.paper,
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: theme.vars.palette.text.secondary },
          }),
          notchedOutline: ({ theme }) => ({ borderColor: theme.vars.palette.surface.borderStrong }),
        },
      },
      MuiInputLabel: { styleOverrides: { root: { fontWeight: 500 } } },
      MuiFormHelperText: { styleOverrides: { root: { marginInline: 2, fontSize: '0.8125rem' } } },
      MuiTabs: {
        styleOverrides: {
          root: { minHeight: 48 },
          indicator: { height: 3, borderRadius: 3 },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: ({ theme }) => ({
            minHeight: 48,
            fontWeight: 700,
            fontSize: '0.9375rem',
            color: theme.vars.palette.text.secondary,
            '&.Mui-selected': { color: theme.vars.palette.text.primary },
          }),
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: radii.sm, fontWeight: 500 },
          sizeSmall: { height: 26 },
        },
      },
      MuiTooltip: {
        defaultProps: { arrow: true, enterDelay: 400 },
        styleOverrides: { tooltip: { fontSize: '0.8125rem', fontWeight: 500 } },
      },
      MuiDialog: {
        styleOverrides: { paper: { borderRadius: radii.lg } },
      },
      MuiMenu: {
        styleOverrides: {
          paper: ({ theme }) => ({
            border: `1px solid ${theme.vars.palette.divider}`,
            boxShadow: shadowScale.md,
            minWidth: 200,
          }),
        },
      },
      MuiPopover: {
        styleOverrides: {
          paper: ({ theme }) => ({ border: `1px solid ${theme.vars.palette.divider}`, boxShadow: shadowScale.md }),
        },
      },
      MuiListItemButton: {
        styleOverrides: { root: { borderRadius: radii.md } },
      },
      MuiLink: {
        defaultProps: { underline: 'hover' },
        styleOverrides: { root: ({ theme }) => ({ color: theme.vars.palette.accent.text, fontWeight: 500 }) },
      },
      MuiSkeleton: { defaultProps: { animation: 'wave' } },
      MuiAvatar: {
        styleOverrides: {
          root: ({ theme }) => ({
            fontFamily: headingFont,
            fontWeight: 600,
            backgroundColor: theme.vars.palette.accent.subtle,
            color: theme.vars.palette.accent.text,
          }),
        },
      },
      MuiPaginationItem: {
        styleOverrides: {
          root: { fontWeight: 700, borderRadius: radii.md },
        },
      },
      MuiSnackbarContent: { styleOverrides: { root: { borderRadius: radii.md, fontWeight: 500 } } },
      MuiAlert: { styleOverrides: { root: { borderRadius: radii.md } } },
      MuiSwitch: {
        styleOverrides: {
          switchBase: ({ theme }) => ({
            '&.Mui-focusVisible + .MuiSwitch-track': { outline: `2px solid ${theme.vars.palette.primary.main}` },
          }),
        },
      },
    },
  });
}
