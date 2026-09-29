/* ArabDev Patch notes: live change counts, type filters, search, and section highlighting.
   Every change is listed in the HTML, so the notes are complete without JavaScript. */
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
  var lang = root.lang === 'ar' ? 'ar' : 'en';
  var plural = window.Intl && Intl.PluralRules ? new Intl.PluralRules(lang) : { select: function (n) { return n === 1 ? 'one' : 'other'; } };
  // Arabic counted nouns change with the number: تغيير واحد، تغييران، 3 تغييرات، 11 تغييرًا، 100 تغيير.
  var changesWord = {
    en: { one: '1 change', other: '# changes' },
    ar: { zero: 'لا تغييرات', one: 'تغيير واحد', two: 'تغييران', few: '# تغييرات', many: '# تغييرًا', other: '# تغيير' },
  }[lang];
  function countChanges(n) {
    var form = changesWord[plural.select(n)] || changesWord.other;
    return form.replace('#', String(n));
  }
  var text = {
    en: {
      showing: function (shown, total) { return 'Showing ' + shown + ' of ' + countChanges(total); },
      clear: 'Clear filters',
      areaCount: function (shown, total) { return shown === total ? countChanges(total) : shown + ' of ' + total; },
    },
    ar: {
      showing: function (shown, total) { return 'عرض ' + shown + ' من أصل ' + countChanges(total); },
      clear: 'مسح عوامل التصفية',
      areaCount: function (shown, total) { return shown === total ? countChanges(total) : shown + ' من ' + total; },
    },
  }[lang];

  /* ---------- theme (remembered in this site's browser storage) ---------- */
  var themeButton = document.querySelector('[data-theme-toggle]');
  if (themeButton) {
    themeButton.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('arabdev.mode', next); } catch (e) { /* storage unavailable */ }
    });
  }

  var changes = Array.prototype.slice.call(document.querySelectorAll('.changes li[data-type]'));
  var areas = Array.prototype.slice.call(document.querySelectorAll('.area'));
  var filterButtons = Array.prototype.slice.call(document.querySelectorAll('[data-filter]'));
  var input = document.querySelector('[data-search]');
  var status = document.querySelector('[data-filter-status]');
  var empty = document.querySelector('[data-no-results]');
  var extras = Array.prototype.slice.call(document.querySelectorAll('[data-hide-when-filtered]'));
  var langSwitch = document.querySelector('[data-lang-switch]');

  /* ---------- counts: always computed from the list itself, so they can never drift ---------- */
  var totals = { all: changes.length };
  var originals = new WeakMap();
  changes.forEach(function (item) {
    var type = item.getAttribute('data-type');
    totals[type] = (totals[type] || 0) + 1;
    var body = item.querySelector('.text');
    if (body) originals.set(body, body.cloneNode(true));
  });
  document.querySelectorAll('[data-count]').forEach(function (el) {
    el.textContent = String(totals[el.getAttribute('data-count')] || 0);
  });

  /* ---------- filtering ---------- */
  var params = new URLSearchParams(location.search);
  var activeType = totals[params.get('type')] ? params.get('type') : 'all';
  if (input && params.get('q')) input.value = params.get('q');

  function normalize(value) {
    return value.toLowerCase().replace(/[ً-ْ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
  }

  function highlight(body, term) {
    var fresh = originals.get(body).cloneNode(true);
    body.replaceChildren.apply(body, Array.prototype.slice.call(fresh.childNodes));
    if (!term) return;
    var walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      var index = node.nodeValue.toLowerCase().indexOf(term);
      if (index < 0) return;
      var match = node.splitText(index);
      match.splitText(term.length);
      var mark = document.createElement('mark');
      mark.textContent = match.nodeValue;
      match.parentNode.replaceChild(mark, match);
    });
  }

  function syncUrl(query) {
    var next = new URLSearchParams();
    if (activeType !== 'all') next.set('type', activeType);
    if (query) next.set('q', query);
    var search = next.toString();
    history.replaceState(null, '', location.pathname + (search ? '?' + search : '') + location.hash);
    if (langSwitch) {
      langSwitch.search = search ? '?' + search : '';
      langSwitch.hash = location.hash;
    }
  }

  function apply() {
    var raw = input ? input.value.trim() : '';
    var term = normalize(raw);
    var plain = raw.toLowerCase();
    var shown = 0;
    changes.forEach(function (item) {
      var typeOk = activeType === 'all' || item.getAttribute('data-type') === activeType;
      var textOk = !term || normalize(item.textContent).indexOf(term) >= 0;
      item.hidden = !(typeOk && textOk);
      if (!item.hidden) shown += 1;
      var body = item.querySelector('.text');
      if (body) highlight(body, !item.hidden && plain ? plain : '');
    });
    areas.forEach(function (area) {
      var items = area.querySelectorAll('.changes li[data-type]');
      var visible = area.querySelectorAll('.changes li[data-type]:not([hidden])').length;
      area.hidden = items.length > 0 && visible === 0;
      var counter = area.querySelector('.area-count');
      if (counter) counter.textContent = text.areaCount(visible, items.length);
    });
    var filtering = activeType !== 'all' || Boolean(term);
    extras.forEach(function (el) { el.hidden = filtering; });
    if (status) {
      status.hidden = !filtering;
      status.innerHTML = '';
      if (filtering) {
        status.appendChild(document.createTextNode(text.showing(shown, changes.length) + ' · '));
        var clear = document.createElement('button');
        clear.type = 'button';
        clear.textContent = text.clear;
        clear.addEventListener('click', function () {
          activeType = 'all';
          if (input) input.value = '';
          apply();
        });
        status.appendChild(clear);
      }
    }
    if (empty) empty.hidden = shown > 0;
    filterButtons.forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.getAttribute('data-filter') === activeType));
    });
    syncUrl(raw);
  }

  filterButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      var type = button.getAttribute('data-filter');
      activeType = activeType === type && type !== 'all' ? 'all' : type;
      apply();
    });
  });
  if (input) {
    var timer = null;
    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(apply, 150);
    });
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        input.value = '';
        apply();
      }
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === '/' && document.activeElement === document.body) {
        event.preventDefault();
        input.focus();
      }
    });
  }
  apply();

  /* ---------- highlight the section being read in the sidebar ---------- */
  var sideLinks = {};
  document.querySelectorAll('.side-nav a[href^="#"]').forEach(function (link) {
    sideLinks[link.getAttribute('href').slice(1)] = link;
  });
  var tracked = Array.prototype.slice.call(document.querySelectorAll('.area[id], .info-block[id]'));
  var current = null;
  var ticking = false;
  function spy() {
    ticking = false;
    var line = window.innerHeight * 0.25;
    var active = null;
    tracked.forEach(function (el) {
      if (!el.hidden && el.getBoundingClientRect().top - line <= 0) active = el.id;
    });
    if (active === current) return;
    if (current && sideLinks[current]) sideLinks[current].classList.remove('active');
    current = active;
    if (current && sideLinks[current]) sideLinks[current].classList.add('active');
    if (langSwitch) {
      var base = langSwitch.getAttribute('href').split('#')[0];
      langSwitch.setAttribute('href', base + (current ? '#' + current : ''));
    }
  }
  window.addEventListener('scroll', function () {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(spy);
    }
  }, { passive: true });
  spy();
})();
