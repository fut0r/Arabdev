import DOMPurify from 'dompurify';

/**
 * Post HTML is sanitized by the server. This second pass in the browser is defense in
 * depth: it mirrors the server's allow-list, so nothing unexpected can render even if a
 * response were tampered with.
 */
const ALLOWED_TAGS = [
  'p',
  'br',
  'hr',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'code',
  'pre',
  'blockquote',
  'h2',
  'h3',
  'h4',
  'ul',
  'ol',
  'li',
  'a',
  'span',
  'table',
  'colgroup',
  'col',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
];
const ALLOWED_ATTR = ['href', 'title', 'target', 'rel', 'style', 'class', 'colspan', 'rowspan', 'start', 'dir'];

const purifier = DOMPurify();
purifier.addHook('afterSanitizeAttributes', (node) => {
  // Code is always written left-to-right, even inside an Arabic post.
  if (node.nodeName === 'PRE') node.setAttribute('dir', 'ltr');
  if (node.nodeName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer nofollow ugc');
  }
});

export function sanitizePostHtml(html: string): string {
  return purifier.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR, ALLOW_DATA_ATTR: false });
}

export function sanitizePreparedArticleHtml(html: string): string {
  const clean = purifier.sanitize(html, {
    ALLOWED_TAGS: [...ALLOWED_TAGS, 'button'],
    ALLOWED_ATTR: [...ALLOWED_ATTR, 'id', 'tabindex', 'data-copy-code'],
    ALLOW_DATA_ATTR: false,
  });
  const doc = new DOMParser().parseFromString(clean, 'text/html');
  doc.body.querySelectorAll('*').forEach((el) => {
    const id = el.getAttribute('id');
    if (id !== null && !/^article-section-\d+$/.test(id)) el.removeAttribute('id');
    const copy = el.getAttribute('data-copy-code');
    if (copy !== null && !/^\d+$/.test(copy)) el.removeAttribute('data-copy-code');
    if (el.nodeName === 'PRE') {
      if (el.getAttribute('tabindex') !== '0') el.removeAttribute('tabindex');
    } else if (el.hasAttribute('tabindex')) {
      el.removeAttribute('tabindex');
    }
    if (el.nodeName === 'BUTTON') el.setAttribute('type', 'button');
  });
  return doc.body.innerHTML;
}

export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export function isEditorEmpty(html: string): boolean {
  return htmlToText(html).length === 0;
}
