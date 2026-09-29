/* ArabDev Wiki: article routing, generated contents, search, theme and mobile navigation.
   Without JavaScript every article is still readable on one long page. */
(function () {
  'use strict';

  var root = document.documentElement;

  /* ---------- links between the ArabDev sites ----------
     In production each site has its own address: arabdev.site, wiki.arabdev.site,
     privacy.arabdev.site and patch.arabdev.site. On a development machine the Vite server serves
     them all from one origin (/wiki/, /privacy/, /patch-notes/), so links are kept local there. */
  var isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if (isLocal) {
    var localPaths = [
      ['https://wiki.arabdev.site/', '/wiki/'],
      ['https://privacy.arabdev.site/', '/privacy/'],
      ['https://patch.arabdev.site/', '/patch-notes/'],
      ['https://arabdev.site/', '/'],
    ];
    document.querySelectorAll('a[href^="https://"]').forEach(function (link) {
      var href = link.getAttribute('href');
      localPaths.forEach(function (pair) {
        if (href.indexOf(pair[0]) === 0) link.setAttribute('href', pair[1] + href.slice(pair[0].length));
      });
    });
  } else {
    // Remember the reader's language, so this site's front page opens in it next time.
    try { localStorage.setItem('arabdev.lang', root.lang === 'ar' ? 'ar' : 'en'); } catch (e) { /* storage unavailable */ }
  }
  var lang = root.lang || 'en';
  var text = {
    en: { contents: 'Contents', hide: 'hide', show: 'show', noResults: 'No articles match', previous: 'Previous', next: 'Next' },
    ar: { contents: 'المحتويات', hide: 'إخفاء', show: 'إظهار', noResults: 'لا توجد مقالات مطابقة لـ', previous: 'السابق', next: 'التالي' },
  }[lang === 'ar' ? 'ar' : 'en'];

  root.classList.add('js');

  /* ---------- theme (remembered in this site's browser storage) ---------- */
  var themeButton = document.querySelector('[data-theme-toggle]');
  function currentTheme() {
    return root.getAttribute('data-theme') || 'light';
  }
  if (themeButton) {
    themeButton.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('arabdev.mode', next); } catch (e) { /* storage unavailable */ }
    });
  }

  /* ---------- articles ---------- */
  var articles = Array.prototype.slice.call(document.querySelectorAll('.wiki-article'));
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.sidebar a[href^="#"]'));
  var siteName = document.body.getAttribute('data-site-name') || 'ArabDev Wiki';
  var langSwitch = document.querySelector('[data-lang-switch]');
  var byId = {};
  articles.forEach(function (article) { byId[article.id] = article; });

  function articleFor(id) {
    if (byId[id]) return byId[id];
    var el = id ? document.getElementById(id) : null;
    return el ? el.closest('.wiki-article') : null;
  }

  function buildToc(article) {
    var existing = article.querySelector('.toc');
    if (existing) existing.remove();
    var headings = article.querySelectorAll('h2[id], h3[id]');
    if (headings.length < 3) return;
    var box = document.createElement('nav');
    box.className = 'toc';
    box.setAttribute('aria-label', text.contents);
    var title = document.createElement('div');
    title.className = 'toc-title';
    title.innerHTML = '<span>' + text.contents + '</span>';
    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'toc-toggle';
    toggle.textContent = '[' + text.hide + ']';
    toggle.addEventListener('click', function () {
      var collapsed = box.classList.toggle('collapsed');
      toggle.textContent = '[' + (collapsed ? text.show : text.hide) + ']';
    });
    title.appendChild(toggle);
    box.appendChild(title);
    var list = document.createElement('ol');
    var currentSub = null;
    var h2Index = 0;
    var h3Index = 0;
    headings.forEach(function (heading) {
      var item = document.createElement('li');
      var link = document.createElement('a');
      link.href = '#' + heading.id;
      var label = heading.firstChild ? heading.firstChild.textContent.trim() : heading.textContent.trim();
      if (heading.tagName === 'H2') {
        h2Index += 1;
        h3Index = 0;
        link.textContent = h2Index + ' ' + label;
        item.appendChild(link);
        list.appendChild(item);
        currentSub = document.createElement('ol');
        item.appendChild(currentSub);
      } else if (currentSub) {
        h3Index += 1;
        link.textContent = h2Index + '.' + h3Index + ' ' + label;
        item.appendChild(link);
        currentSub.appendChild(item);
      }
    });
    list.querySelectorAll('ol').forEach(function (ol) { if (!ol.children.length) ol.remove(); });
    box.appendChild(list);
    // Wiki convention: the contents box sits between the lead section and the first heading.
    var firstSection = article.querySelector('h2[id]');
    if (firstSection) firstSection.before(box);
  }

  function addHeadingAnchors() {
    document.querySelectorAll('.wiki-article h2[id], .wiki-article h3[id]').forEach(function (heading) {
      var link = document.createElement('a');
      link.className = 'heading-anchor';
      link.href = '#' + heading.id;
      link.setAttribute('aria-hidden', 'true');
      link.tabIndex = -1;
      link.textContent = '#';
      heading.appendChild(link);
    });
  }

  function updatePrevNext(article) {
    var index = articles.indexOf(article);
    var box = document.querySelector('[data-prev-next]');
    if (!box) return;
    var prev = articles[index - 1];
    var next = articles[index + 1];
    var prevLink = box.querySelector('.prev');
    var nextLink = box.querySelector('.next');
    prevLink.hidden = !prev;
    nextLink.hidden = !next;
    if (prev) {
      prevLink.href = '#' + prev.id;
      prevLink.innerHTML = '<small>' + text.previous + '</small>' + prev.getAttribute('data-title');
    }
    if (next) {
      nextLink.href = '#' + next.id;
      nextLink.innerHTML = '<small>' + text.next + '</small>' + next.getAttribute('data-title');
    }
  }

  function show(hash) {
    var id = decodeURIComponent((hash || '').replace(/^#/, ''));
    var article = articleFor(id) || articles[0];
    articles.forEach(function (a) { a.hidden = a !== article; });
    navLinks.forEach(function (link) {
      if (link.getAttribute('href') === '#' + article.id) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    if (!article.querySelector('.toc')) buildToc(article);
    updatePrevNext(article);
    document.title = article.getAttribute('data-title') + ' — ' + siteName;
    if (langSwitch) langSwitch.hash = id ? '#' + id : '';
    document.body.classList.remove('nav-open');
    var target = id && id !== article.id ? document.getElementById(id) : null;
    if (target) target.scrollIntoView();
    else window.scrollTo(0, 0);
  }

  addHeadingAnchors();
  window.addEventListener('hashchange', function () { show(location.hash); });
  show(location.hash);

  /* ---------- search ---------- */
  var input = document.querySelector('[data-search]');
  var results = document.querySelector('[data-search-results]');
  var index = articles.map(function (article) {
    var sections = Array.prototype.slice.call(article.querySelectorAll('h2[id], h3[id]')).map(function (h) {
      return { id: h.id, title: h.firstChild ? h.firstChild.textContent.trim() : h.textContent.trim() };
    });
    return {
      id: article.id,
      title: article.getAttribute('data-title'),
      body: article.textContent.replace(/\s+/g, ' '),
      sections: sections,
    };
  });
  var active = -1;

  function normalize(value) {
    return value.toLowerCase().replace(/[ً-ْ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
  }

  function snippet(body, term) {
    var position = normalize(body).indexOf(term);
    if (position < 0) return body.slice(0, 110) + '…';
    var start = Math.max(0, position - 50);
    return (start > 0 ? '…' : '') + body.slice(start, position + 80).trim() + '…';
  }

  function search(query) {
    var term = normalize(query.trim());
    if (!term) {
      results.hidden = true;
      return;
    }
    var found = [];
    index.forEach(function (entry) {
      var titleHit = normalize(entry.title).indexOf(term) >= 0;
      var section = entry.sections.filter(function (s) { return normalize(s.title).indexOf(term) >= 0; })[0];
      var bodyHit = normalize(entry.body).indexOf(term) >= 0;
      if (titleHit) found.push({ score: 3, href: '#' + entry.id, title: entry.title, text: snippet(entry.body, term) });
      else if (section) found.push({ score: 2, href: '#' + section.id, title: entry.title + ' › ' + section.title, text: snippet(entry.body, term) });
      else if (bodyHit) found.push({ score: 1, href: '#' + entry.id, title: entry.title, text: snippet(entry.body, term) });
    });
    found.sort(function (a, b) { return b.score - a.score; });
    results.innerHTML = '';
    active = -1;
    if (!found.length) {
      var empty = document.createElement('div');
      empty.className = 'search-empty';
      empty.textContent = text.noResults + ' “' + query.trim() + '”';
      results.appendChild(empty);
    }
    found.slice(0, 12).forEach(function (item, i) {
      var link = document.createElement('a');
      link.className = 'search-result';
      link.href = item.href;
      link.id = 'search-result-' + i;
      link.setAttribute('role', 'option');
      var strong = document.createElement('strong');
      strong.textContent = item.title;
      var span = document.createElement('span');
      span.textContent = item.text;
      link.appendChild(strong);
      link.appendChild(span);
      link.addEventListener('click', function () { results.hidden = true; input.value = ''; });
      results.appendChild(link);
    });
    results.hidden = false;
  }

  if (input && results) {
    input.addEventListener('input', function () { search(input.value); });
    input.addEventListener('keydown', function (event) {
      var items = results.querySelectorAll('.search-result');
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (!items.length) return;
        event.preventDefault();
        active = event.key === 'ArrowDown' ? (active + 1) % items.length : (active <= 0 ? items.length - 1 : active - 1);
        items.forEach(function (item, i) { item.setAttribute('aria-selected', String(i === active)); });
        input.setAttribute('aria-activedescendant', items[active].id);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        var chosen = items[active >= 0 ? active : 0];
        if (chosen) {
          location.hash = chosen.getAttribute('href');
          results.hidden = true;
          input.value = '';
          input.blur();
        }
      } else if (event.key === 'Escape') {
        results.hidden = true;
        input.blur();
      }
    });
    document.addEventListener('click', function (event) {
      if (!event.target.closest('.search')) results.hidden = true;
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === '/' && document.activeElement === document.body) {
        event.preventDefault();
        input.focus();
      }
    });
  }

  /* ---------- mobile navigation ---------- */
  var menuButton = document.querySelector('[data-menu]');
  if (menuButton) {
    menuButton.addEventListener('click', function () {
      var open = document.body.classList.toggle('nav-open');
      menuButton.setAttribute('aria-expanded', String(open));
    });
  }
})();
