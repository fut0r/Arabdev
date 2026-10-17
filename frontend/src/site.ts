/**
 * Public addresses of ArabDev. The app lives at arabdev.site (its main page is /dashboard);
 * the wiki, privacy policy and patch notes are separate sites on their own subdomains.
 */

/** Where signed-in people land: the home feed. */
export const HOME_PATH = '/dashboard';

export const SITE_URL = 'https://arabdev.site';

/**
 * Where the API lives. Defaults to the same origin (the dev proxy, or nginx in Docker). When the app
 * is hosted on Cloudflare Pages and the API elsewhere, set VITE_API_ORIGIN at build time, for
 * example https://api.arabdev.site.
 */
export const API_ORIGIN = ((import.meta.env.VITE_API_ORIGIN as string | undefined) ?? '').replace(/\/$/, '');

/** Account help, bugs and anything technical. */
export const SUPPORT_EMAIL = 'support@arabdev.site';
/** Sponsorship, contributions, partnerships and general questions. */
export const HELLO_EMAIL = 'hi@arabdev.site';

const env = import.meta.env;

/**
 * Google AdSense. The publisher id and the ad unit ids are public: they appear in every page
 * that shows an ad, and the publisher id is also in /ads.txt. Where each unit is used is
 * decided in src/features/ads/placements.tsx.
 */
export const ADSENSE = {
  client: 'ca-pub-9780622975838808',
  units: {
    /** "Advertisement": responsive display ad. */
    display: { slot: '7751924472', format: 'auto', minHeight: 250 },
    /** "Advertisement 2": a fixed 728×90 banner, only where the page is wide enough. */
    banner: { slot: '4443234858', width: 728, height: 90 },
    /** "Advertisement feed 1" and "Advertisement feed 2": in-feed ads shaped like the list. */
    feed: { slot: '8744160685', format: 'fluid', layoutKey: '-6t+ed+2i-1n-4w', minHeight: 140 },
    feedAlt: { slot: '3571725055', format: 'fluid', layoutKey: '-fb+5w+4e-db+86', minHeight: 140 },
  },
} as const;

export type AdUnitName = keyof typeof ADSENSE.units;

/**
 * During development the Vite server serves the documentation sites at /wiki/, /privacy/ and
 * /patch-notes/ (see vite.config.ts), so links stay local. Each can be overridden with an env var.
 */
export const DOC_SITES = {
  wiki: (env.VITE_WIKI_URL as string | undefined) ?? (env.DEV ? '/wiki/' : 'https://wiki.arabdev.site/'),
  privacy: (env.VITE_PRIVACY_URL as string | undefined) ?? (env.DEV ? '/privacy/' : 'https://privacy.arabdev.site/'),
  patchNotes:
    (env.VITE_PATCH_NOTES_URL as string | undefined) ?? (env.DEV ? '/patch-notes/' : 'https://patch.arabdev.site/'),
};

/** For copyright lines. */
export const CURRENT_YEAR = new Date().getFullYear();

/** Where the source code lives. */
export const SOURCE_URL = 'https://github.com/fut0r/Arabdev';
