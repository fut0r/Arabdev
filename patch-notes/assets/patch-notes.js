/* ArabDev Patch notes: change counts, the type tabs, the filter box, and the side column that
   follows the release being read. Every change is in the HTML, so the notes are complete
   without JavaScript. */
(function () {
  'use strict';

  var root = document.documentElement;
  var lang = root.lang === 'ar' ? 'ar' : 'en';
  var plural = window.Intl && Intl.PluralRules ? new Intl.PluralRules(lang) : { select: function (n) { return n === 1 ? 'one' : 'other'; } };
  // Arabic counted nouns change with the number: تغيير واحد، تغييران، 3 تغييرات، 11 تغييرًا، 100 تغيير.
  var changesWord = {
    en: { one: '1 change', other: '# changes' },
    ar: { zero: 'لا تغييرات', one: 'تغيير واحد', two: 'تغييران', few: '# تغييرات', many: '# تغييرًا', other: '# تغيير' },
  }[lang];
  function countChanges(n) {
    return (changesWord[plural.select(n)] || changesWord.other).replace('#', String(n));
  }
  var text = {
    en: {
      showing: function (shown, total) { return 'Showing ' + shown + ' of ' + countChanges(total); },
      clear: 'Show everything',
      areaCount: function (shown, total) { return shown === total ? countChanges(total) : shown + ' of ' + total; },
      inRelease: function (version) { return 'In ' + version; },
    },
    ar: {
      showing: function (shown, total) { return 'عرض ' + shown + ' من أصل ' + countChanges(total); },
      clear: 'اعرض الكل',
      areaCount: function (shown, total) { return shown === total ? countChanges(total) : shown + ' من ' + total; },
      inRelease: function (version) { return 'في ' + version; },
    },
  }[lang];

  var changes = Array.prototype.slice.call(document.querySelectorAll('.changes li[data-type]'));
  var areas = Array.prototype.slice.call(document.querySelectorAll('.area'));
  var releases = Array.prototype.slice.call(document.querySelectorAll('.release[id]'));
  var filterButtons = Array.prototype.slice.call(document.querySelectorAll('[data-filter]'));
  var input = document.querySelector('[data-search]');
  var status = document.querySelector('[data-filter-status]');
  var empty = document.querySelector('[data-no-results]');
  var extras = Array.prototype.slice.call(document.querySelectorAll('[data-hide-when-filtered]'));
  var langSwitch = document.querySelector('[data-lang-switch]');

  /* Counts come from the list itself, so they can't drift from it. */
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
    releases.forEach(function (release) {
      var any = release.querySelectorAll('.changes li[data-type]:not([hidden])').length > 0;
      release.hidden = !any && (activeType !== 'all' || Boolean(term));
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
    spy();
  }

  /* ---------- the release being read ---------- */
  var navLinks = {};
  document.querySelectorAll('.nav a[href^="#"]').forEach(function (link) {
    navLinks[link.getAttribute('href').slice(1)] = link;
  });
  var areasCard = document.querySelector('[data-areas-card]');
  var areasTitle = document.querySelector('[data-areas-title]');
  var areasList = document.querySelector('[data-areas]');
  var currentRelease = null;
  var currentArea = null;

  function fillAreas(release) {
    if (!areasCard) return;
    areasList.innerHTML = '';
    var sections = release.querySelectorAll('.area[id], .info-block[id]');
    sections.forEach(function (section) {
      if (section.hidden) return;
      var heading = section.querySelector('h3');
      var item = document.createElement('li');
      var link = document.createElement('a');
      link.href = '#' + section.id;
      link.textContent = heading ? heading.firstChild.textContent.trim() : section.id;
      item.appendChild(link);
      areasList.appendChild(item);
    });
    var version = release.querySelector('h2');
    areasTitle.textContent = text.inRelease(version ? version.textContent.trim() : '');
    areasCard.hidden = !areasList.children.length;
  }

  function spy() {
    var line = window.innerHeight * 0.25;
    var release = null;
    releases.forEach(function (el) {
      if (!el.hidden && el.getBoundingClientRect().top - line <= 0) release = el;
    });
    release = release || releases.filter(function (el) { return !el.hidden; })[0] || null;
    if (release !== currentRelease) {
      if (currentRelease && navLinks[currentRelease.id]) navLinks[currentRelease.id].classList.remove('active');
      currentRelease = release;
      if (release) {
        if (navLinks[release.id]) navLinks[release.id].classList.add('active');
        fillAreas(release);
      }
    }
    var area = null;
    if (release) {
      release.querySelectorAll('.area[id], .info-block[id]').forEach(function (el) {
        if (!el.hidden && el.getBoundingClientRect().top - line <= 0) area = el.id;
      });
    }
    if (area !== currentArea) {
      currentArea = area;
      if (areasList) {
        areasList.querySelectorAll('a').forEach(function (link) {
          link.classList.toggle('active', link.getAttribute('href') === '#' + area);
        });
      }
      if (langSwitch) {
        var base = langSwitch.getAttribute('href').split('#')[0];
        langSwitch.setAttribute('href', base + (area ? '#' + area : release ? '#' + release.id : ''));
      }
    }
  }

  filterButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      var type = button.getAttribute('data-filter');
      activeType = activeType === type && type !== 'all' ? 'all' : type;
      currentRelease = null;
      apply();
    });
  });
  if (input) {
    var timer = null;
    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { currentRelease = null; apply(); }, 150);
    });
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        input.value = '';
        currentRelease = null;
        apply();
      }
    });
  }

  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () { ticking = false; spy(); });
  }, { passive: true });
  apply();
})();
