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
 * Google AdSense. The publisher id is public (it also appears in /ads.txt); each ad unit
 * created in the AdSense account gets its slot id set here through a build-time variable,
 * and a placement with no slot simply shows nothing.
 */
export const ADSENSE = {
  client: 'ca-pub-9780622975838808',
  slots: {
    feed: (env.VITE_ADSENSE_FEED_SLOT as string | undefined) ?? '',
    sidebar: (env.VITE_ADSENSE_SIDEBAR_SLOT as string | undefined) ?? '',
    article: (env.VITE_ADSENSE_ARTICLE_SLOT as string | undefined) ?? '',
  },
} as const;

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
