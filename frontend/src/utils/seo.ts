/**
 * Per-page metadata for search engines and link previews.
 *
 * A single-page app serves one HTML file, so every page has to write its own title,
 * description, canonical URL and preview card as it renders. Google runs JavaScript
 * before indexing, and everything set here is in place well before it finishes.
 */

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { SITE_URL } from '@/site';

export interface SeoInput {
  title?: string | null;
  description?: string | null;
  /** Absolute or site-relative; defaults to the current path. */
  canonical?: string | null;
  image?: string | null;
  type?: 'website' | 'article' | 'profile';
  /** Keeps a page out of search results (settings, drafts, anything private). */
  noindex?: boolean;
  /** Structured data describing this page, e.g. one post. */
  jsonLd?: object | null;
  publishedAt?: string | null;
  authorName?: string | null;
}

const JSON_LD_ID = 'page-jsonld';

function meta(selector: string, attribute: 'name' | 'property', key: string, content: string | null) {
  const head = document.head;
  let element = head.querySelector<HTMLMetaElement>(selector);
  if (content === null) {
    element?.remove();
    return;
  }
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    head.appendChild(element);
  }
  element.setAttribute('content', content);
}

function link(rel: string, href: string | null) {
  let element = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (href === null) {
    element?.remove();
    return;
  }
  if (!element) {
    element = document.createElement('link');
    element.rel = rel;
    document.head.appendChild(element);
  }
  element.href = href;
}

/** Trims text to something a search result can show without cutting mid-word. */
export function summarise(text: string, max = 155): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Sets the tab title and the page's metadata, and puts them back when the page unmounts,
 * so a stale description never survives into the next route.
 */
export function useSeo(input: SeoInput) {
  const { t, i18n } = useTranslation();
  const {
    title,
    description,
    canonical,
    image,
    type = 'website',
    noindex = false,
    jsonLd,
    publishedAt,
    authorName,
  } = input;

  useEffect(() => {
    const appName = t('common.appName');
    const fullTitle = title ? `${title} · ${appName}` : appName;
    const url = canonical
      ? canonical.startsWith('http')
        ? canonical
        : `${SITE_URL}${canonical}`
      : `${SITE_URL}${window.location.pathname}`;
    const preview = image ?? `${SITE_URL}/screenshots/dashboard.webp`;

    document.title = fullTitle;
    if (description) meta('meta[name="description"]', 'name', 'description', description);
    link('canonical', url);
    meta('meta[name="robots"]', 'name', 'robots', noindex ? 'noindex, nofollow' : null);

    meta('meta[property="og:title"]', 'property', 'og:title', fullTitle);
    if (description) meta('meta[property="og:description"]', 'property', 'og:description', description);
    meta('meta[property="og:url"]', 'property', 'og:url', url);
    meta('meta[property="og:type"]', 'property', 'og:type', type);
    meta('meta[property="og:image"]', 'property', 'og:image', preview);
    meta('meta[property="og:locale"]', 'property', 'og:locale', i18n.language === 'en' ? 'en_US' : 'ar_AR');
    meta('meta[name="twitter:title"]', 'name', 'twitter:title', fullTitle);
    if (description) meta('meta[name="twitter:description"]', 'name', 'twitter:description', description);
    meta('meta[name="twitter:image"]', 'name', 'twitter:image', preview);

    meta('meta[property="article:published_time"]', 'property', 'article:published_time', publishedAt ?? null);
    meta('meta[property="article:author"]', 'property', 'article:author', authorName ?? null);

    document.getElementById(JSON_LD_ID)?.remove();
    if (jsonLd) {
      const script = document.createElement('script');
      script.id = JSON_LD_ID;
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(script);
    }

    return () => {
      document.getElementById(JSON_LD_ID)?.remove();
      meta('meta[name="robots"]', 'name', 'robots', null);
      meta('meta[property="article:published_time"]', 'property', 'article:published_time', null);
      meta('meta[property="article:author"]', 'property', 'article:author', null);
    };
  }, [title, description, canonical, image, type, noindex, jsonLd, publishedAt, authorName, t, i18n.language]);
}
