/* ArabDev Wiki: one article at a time, its contents in the side column, and search.
   Without JavaScript every article is still readable, one after another. */
(function () {
  'use strict';

  var root = document.documentElement;
  var text = {
    en: { noResults: 'No articles match', previous: 'Previous', next: 'Next', link: 'Link to this section' },
    ar: { noResults: 'لا توجد مقالات تطابق', previous: 'السابق', next: 'التالي', link: 'رابط إلى هذا القسم' },
  }[root.lang === 'ar' ? 'ar' : 'en'];

  var articles = Array.prototype.slice.call(document.querySelectorAll('.wiki-article'));
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav a[href^="#"]'));
  var siteName = document.body.getAttribute('data-site-name') || 'ArabDev Wiki';
  var langSwitch = document.querySelector('[data-lang-switch]');
  var tocCard = document.querySelector('[data-toc-card]');
  var tocList = document.querySelector('[data-toc]');
  var byId = {};
  articles.forEach(function (article) { byId[article.id] = article; });

  function articleFor(id) {
    if (byId[id]) return byId[id];
    var el = id ? document.getElementById(id) : null;
    return el ? el.closest('.wiki-article') : null;
  }

  function headingText(heading) {
    return heading.firstChild ? heading.firstChild.textContent.trim() : heading.textContent.trim();
  }

  /* Every h2 and h3 gets a "#" link, shown on hover. */
  document.querySelectorAll('.wiki-article h2[id], .wiki-article h3[id]').forEach(function (heading) {
    var link = document.createElement('a');
    link.className = 'anchor';
    link.href = '#' + heading.id;
    link.setAttribute('aria-label', text.link);
    link.textContent = '#';
    heading.appendChild(link);
  });

  /* The side column lists the open article's sections. */
  function fillToc(article) {
    if (!tocCard || !tocList) return;
    tocList.innerHTML = '';
    var headings = article.querySelectorAll('h2[id], h3[id]');
    headings.forEach(function (heading) {
      var item = document.createElement('li');
      if (heading.tagName === 'H3') item.className = 'sub';
      var link = document.createElement('a');
      link.href = '#' + heading.id;
      link.textContent = headingText(heading);
      item.appendChild(link);
      tocList.appendChild(item);
    });
    tocCard.hidden = headings.length < 2;
  }

  /* Highlights the section being read. */
  var tracked = [];
  var current = null;
  function spy() {
    var line = window.innerHeight * 0.25;
    var active = null;
    tracked.forEach(function (heading) {
      if (heading.getBoundingClientRect().top - line <= 0) active = heading.id;
    });
    if (active === current) return;
    current = active;
    if (!tocList) return;
    tocList.querySelectorAll('a').forEach(function (link) {
      link.classList.toggle('active', link.getAttribute('href') === '#' + active);
    });
  }
  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () { ticking = false; spy(); });
  }, { passive: true });

  function updatePrevNext(article) {
    var box = document.querySelector('[data-prev-next]');
    if (!box) return;
    var index = articles.indexOf(article);
    [['.prev', articles[index - 1], text.previous], ['.next', articles[index + 1], text.next]].forEach(function (entry) {
      var link = box.querySelector(entry[0]);
      var target = entry[1];
      link.hidden = !target;
      if (!target) return;
      link.href = '#' + target.id;
      link.innerHTML = '';
      var label = document.createElement('small');
      label.textContent = entry[2];
      link.appendChild(label);
      link.appendChild(document.createTextNode(target.getAttribute('data-title')));
    });
  }

  function show(hash) {
    var id = decodeURIComponent((hash || '').replace(/^#/, ''));
    var article = articleFor(id) || articles[0];
    articles.forEach(function (a) { a.hidden = a !== article; });
    navLinks.forEach(function (link) {
      if (link.getAttribute('href') === '#' + article.id) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    fillToc(article);
    tracked = Array.prototype.slice.call(article.querySelectorAll('h2[id], h3[id]'));
    current = null;
    updatePrevNext(article);
    document.title = article.getAttribute('data-title') + ' · ' + siteName;
    if (langSwitch) langSwitch.hash = id ? '#' + id : '';
    var target = id && id !== article.id ? document.getElementById(id) : null;
    if (target) target.scrollIntoView();
    else window.scrollTo(0, 0);
    spy();
  }

  window.addEventListener('hashchange', function () { show(location.hash); });
  show(location.hash);

  /* ---------- search ---------- */
  var input = document.querySelector('[data-search]');
  var results = document.querySelector('[data-search-results]');
  var index = articles.map(function (article) {
    return {
      id: article.id,
      title: article.getAttribute('data-title'),
      body: article.textContent.replace(/\s+/g, ' '),
      sections: Array.prototype.slice.call(article.querySelectorAll('h2[id], h3[id]')).map(function (h) {
        return { id: h.id, title: headingText(h) };
      }),
    };
  });
  var active = -1;

  // Arabic search ignores diacritics and the usual alef, taa marbuta and yaa variants.
  function normalize(value) {
    return value.toLowerCase().replace(/[ً-ْ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
  }

  function snippet(body, term) {
    var position = normalize(body).indexOf(term);
    if (position < 0) return body.slice(0, 110) + '…';
    var start = Math.max(0, position - 50);
    return (start > 0 ? '…' : '') + body.slice(start, position + 80).trim() + '…';
  }

  function close() {
    results.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function search(query) {
    var term = normalize(query.trim());
    if (!term) return close();
    var found = [];
    index.forEach(function (entry) {
      var section = entry.sections.filter(function (s) { return normalize(s.title).indexOf(term) >= 0; })[0];
      if (normalize(entry.title).indexOf(term) >= 0) found.push({ score: 3, href: '#' + entry.id, title: entry.title, text: snippet(entry.body, term) });
      else if (section) found.push({ score: 2, href: '#' + section.id, title: entry.title + ' › ' + section.title, text: snippet(entry.body, term) });
      else if (normalize(entry.body).indexOf(term) >= 0) found.push({ score: 1, href: '#' + entry.id, title: entry.title, text: snippet(entry.body, term) });
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
      link.addEventListener('click', function () { close(); input.value = ''; });
      results.appendChild(link);
    });
    results.hidden = false;
    input.setAttribute('aria-expanded', 'true');
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
          close();
          input.value = '';
          input.blur();
        }
      } else if (event.key === 'Escape') {
        close();
        input.blur();
      }
    });
    document.addEventListener('click', function (event) {
      if (!event.target.closest('.search')) close();
    });
  }
})();
