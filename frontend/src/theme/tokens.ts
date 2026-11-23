/** Design tokens shared by the theme and layout components. */

export const radii = {
  sm: 6,
  md: 8,
  lg: 12,
  pill: 999,
} as const;

export const layout = {
  appBarHeight: 60,
  navWidth: 244,
  navRailWidth: 76,
  sidebarWidth: 320,
  feedMaxWidth: 'var(--ad-feed-width)',
  contentMaxWidth: 'var(--ad-site-width)',
  mobileNavHeight: 60,
} as const;

export const borders = {
  hairline: 1,
  focus: 2,
} as const;

/** A restrained elevation scale: surfaces rely on borders, only floating UI casts shadows. */
export const shadowScale = {
  none: 'none',
  sm: '0 1px 2px rgba(20, 20, 20, 0.06)',
  md: '0 4px 12px rgba(20, 20, 20, 0.08), 0 1px 3px rgba(20, 20, 20, 0.06)',
  lg: '0 12px 32px rgba(20, 20, 20, 0.12), 0 2px 6px rgba(20, 20, 20, 0.06)',
} as const;

export const motion = {
  fast: 120,
  base: 180,
} as const;
