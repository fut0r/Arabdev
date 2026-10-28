/** Validated, portable preferences. No CSS, URLs or remote fonts are accepted. */
export interface AppearancePreferences {
  accent_color: string;
  font_family: 'tajawal' | 'alexandria' | 'system';
  font_size: 14 | 16 | 18 | 20;
  background: 'plain' | 'dots' | 'grid' | 'gradient';
  density: 'comfortable' | 'compact';
  reading_width: 'standard' | 'wide';
}

export const DEFAULT_APPEARANCE: AppearancePreferences = {
  accent_color: '#D0152B',
  font_family: 'tajawal',
  font_size: 16,
  background: 'plain',
  density: 'comfortable',
  reading_width: 'standard',
};
export const APPEARANCE_KEY = 'arabdev.appearance.v1';
export const ACCENT_PRESETS = ['#D0152B', '#7C3AED', '#2563EB', '#0F766E', '#15803D', '#B45309', '#BE185D', '#475569'];
export const FONT_STACKS = {
  tajawal: '"Tajawal", system-ui, sans-serif',
  alexandria: '"Alexandria", "Tajawal", system-ui, sans-serif',
  system: 'system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif',
};

export function normalizeAppearance(value: unknown): AppearancePreferences {
  const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    accent_color:
      typeof input.accent_color === 'string' && /^#[0-9a-f]{6}$/i.test(input.accent_color)
        ? input.accent_color.toUpperCase()
        : DEFAULT_APPEARANCE.accent_color,
    font_family: ['tajawal', 'alexandria', 'system'].includes(String(input.font_family))
      ? (input.font_family as AppearancePreferences['font_family'])
      : DEFAULT_APPEARANCE.font_family,
    font_size: [14, 16, 18, 20].includes(Number(input.font_size))
      ? (Number(input.font_size) as AppearancePreferences['font_size'])
      : 16,
    background: ['plain', 'dots', 'grid', 'gradient'].includes(String(input.background))
      ? (input.background as AppearancePreferences['background'])
      : 'plain',
    density: input.density === 'compact' ? 'compact' : 'comfortable',
    reading_width: input.reading_width === 'wide' ? 'wide' : 'standard',
  };
}

export function readAppearance(): AppearancePreferences {
  try {
    return normalizeAppearance(JSON.parse(localStorage.getItem(APPEARANCE_KEY) ?? '{}'));
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}
