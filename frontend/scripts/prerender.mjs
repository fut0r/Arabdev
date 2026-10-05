/**
 * Runs after `vite build`. Writes text into the built pages so they can be read before (or
 * without) JavaScript:
 *
 *   dist/index.html          the homepage's text
 *   dist/about/index.html    the About page, with its own title and description
 *   dist/contact/index.html  the Contact page, likewise
 *   dist/app.html            the untouched shell, served for every other address
 *
 * The words come from the same translation files the app uses (src/i18n), in Arabic then English,
 * so there is one copy of every sentence. The app replaces the text as soon as it starts.
 *
 * Posts, profiles and tags change all the time, so the API writes those into the same shell on
 * request (backend/app/services/page_service.py). On Vercel only backend/ ships with the API, so
 * the untouched shell is copied there for it to use.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const SITE_URL = 'https://arabdev.site';
const SITE_NAME = 'ArabDev';
const SUPPORT_EMAIL = 'support@arabdev.site';
const HELLO_EMAIL = 'hi@arabdev.site';
const OPEN = '<!--prerender-->';
const CLOSE = '<!--/prerender-->';

const read = (file) => JSON.parse(readFileSync(resolve(root, 'src/i18n', file), 'utf8'));
const languages = [
  { code: 'ar', dir: 'rtl', t: read('ar.json') },
  { code: 'en', dir: 'ltr', t: read('en.json') },
];

const esc = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const p = (text) => `<p>${esc(text)}</p>`;
const h2 = (text) => `<h2>${esc(text)}</h2>`;
const list = (items) => `<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
const pair = (title, body) => `<strong>${esc(title)}</strong>: ${esc(body)}`;
const link = (href, label) => `<a href="${esc(href)}">${esc(label)}</a>`;
const mail = (address) => `<a href="mailto:${address}" dir="ltr">${address}</a>`;
const sections = (items) => items.map((s) => `<section>${h2(s.title)}${s.body.map(p).join('')}</section>`).join('');

/** Wraps one language's text so readers and crawlers know which language and direction it is. */
const inLanguage = (language, html) => `<div lang="${language.code}" dir="${language.dir}">${html}</div>`;
const everyLanguage = (build) => languages.map((language) => inLanguage(language, build(language.t))).join('<hr />');

function home(t) {
  const h = t.home;
  return [
    `<h1>${esc(h.heroLine1)} ${esc(h.heroHighlight)}</h1>`,
    p(h.heroLead),
    `<p>${[
      link('/explore', h.browse),
      link('/register', t.common.signUp),
      link('/about', t.nav.about),
      link('/contact', t.nav.contact),
    ].join(' · ')}</p>`,
    h2(h.featuresTitle),
    p(h.featuresSub),
    list([1, 2, 3, 4, 5, 6].map((n) => pair(h[`f${n}Title`], h[`f${n}Body`]))),
    h2(h.aboutTitle),
    p(h.aboutBody1),
    p(h.aboutBody2),
    list([1, 2, 3, 4].map((n) => pair(h[`about${n}Title`], h[`about${n}Body`]))),
    h2(h.stepsTitle),
    list([1, 2, 3].map((n) => pair(h[`step${n}Title`], h[`step${n}Body`]))),
    h2(h.privacyTitle),
    p(h.privacyBody),
    list([1, 2, 3, 4].map((n) => pair(h[`p${n}Title`], h[`p${n}Body`]))),
    h2(h.contactTitle),
    p(h.contactSub),
    list([
      `${pair(h.contactSupportTitle, h.contactSupportBody)} ${mail(SUPPORT_EMAIL)}`,
      `${pair(h.contactHelloTitle, h.contactHelloBody)} ${mail(HELLO_EMAIL)}`,
    ]),
  ].join('');
}

function about(t) {
  const a = t.about;
  return [
    `<h1>${esc(a.title)}</h1>`,
    p(a.lead),
    sections(a.sections),
    `<p>${[link('/explore', a.browse), link('/contact', a.linkContact), link('/', SITE_NAME)].join(' · ')}</p>`,
  ].join('');
}

function contact(t) {
  const c = t.contact;
  return [
    `<h1>${esc(c.title)}</h1>`,
    p(c.lead),
    list([
      `${pair(c.supportTitle, c.supportBody)} ${mail(SUPPORT_EMAIL)}`,
      `${pair(c.helloTitle, c.helloBody)} ${mail(HELLO_EMAIL)}`,
    ]),
    h2(c.tipsTitle),
    list(c.tips.map(esc)),
    sections(c.sections),
    `<p>${[link('/about', t.nav.about), link('/explore', t.nav.explore), link('/', SITE_NAME)].join(' · ')}</p>`,
  ].join('');
}

function withBody(shell, body) {
  const start = shell.indexOf(OPEN);
  const end = shell.indexOf(CLOSE);
  if (start === -1 || end < start) throw new Error('index.html has lost its <!--prerender--> markers');
  return shell.slice(0, start + OPEN.length) + body + shell.slice(end);
}

function setMeta(html, attribute, key, content) {
  const pattern = new RegExp(`(<meta\\s+${attribute}="${key}"\\s+content=")[^"]*(")`);
  if (!pattern.test(html)) throw new Error(`index.html has no ${attribute}="${key}" meta tag`);
  return html.replace(pattern, (_, before, after) => before + esc(content) + after);
}

/** A page of its own: the shell with this page's title, description, address and text. */
function page(shell, path, title, description, body) {
  const fullTitle = `${title} · ${SITE_NAME}`;
  const url = SITE_URL + path;
  let html = shell.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${esc(fullTitle)}</title>`);
  html = setMeta(html, 'name', 'description', description);
  html = setMeta(html, 'property', 'og:title', fullTitle);
  html = setMeta(html, 'property', 'og:description', description);
  html = setMeta(html, 'name', 'twitter:title', fullTitle);
  html = setMeta(html, 'name', 'twitter:description', description);
  return withBody(withAddress(html, url), body);
}

/** Names the page's own address, which the shared shell deliberately leaves out. */
function withAddress(html, url) {
  return html.replace(
    '</head>',
    () => `  <link rel="canonical" href="${url}" />\n    <meta property="og:url" content="${url}" />\n  </head>`,
  );
}

const shell = readFileSync(resolve(dist, 'index.html'), 'utf8');
const [arabic] = languages;

// Every address without a page of its own gets this untouched shell (see vercel.json and
// nginx.conf), so only the homepage carries the homepage's text.
writeFileSync(resolve(dist, 'app.html'), shell);
writeFileSync(resolve(dist, 'index.html'), withBody(withAddress(shell, `${SITE_URL}/`), everyLanguage(home)));

for (const [name, build] of [
  ['about', about],
  ['contact', contact],
]) {
  const text = arabic.t[name];
  mkdirSync(resolve(dist, name), { recursive: true });
  writeFileSync(
    resolve(dist, name, 'index.html'),
    page(shell, `/${name}`, text.metaTitle, text.metaDescription, everyLanguage(build)),
  );
}

// The same untouched shell, for the API to write posts, profiles and tags into.
if (process.env.VERCEL) writeFileSync(resolve(root, '..', 'backend', 'spa_shell.html'), shell);

console.log('prerender: wrote the homepage, /about, /contact and the app shell');
