/* ArabDev Privacy Policy: contents highlighting, reading progress, theme, language switch.
   The policy is complete and readable without JavaScript; this only adds conveniences. */
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
  var narrow = window.matchMedia('(max-width: 980px)');

  /* ---------- theme (remembered in this site's browser storage) ---------- */
  var themeButton = document.querySelector('[data-theme-toggle]');
  if (themeButton) {
    themeButton.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('arabdev.mode', next); } catch (e) { /* storage unavailable */ }
    });
  }

  /* ---------- print ---------- */
  var printButton = document.querySelector('[data-print]');
  if (printButton) printButton.addEventListener('click', function () { window.print(); });

  /* ---------- contents: collapsed on small screens, always open on large ones ---------- */
  var details = document.querySelector('.toc details');
  function syncDetails() {
    if (details) details.open = !narrow.matches;
  }
  syncDetails();
  if (narrow.addEventListener) narrow.addEventListener('change', syncDetails);
  if (details) {
    details.querySelector('summary').addEventListener('click', function (event) {
      if (!narrow.matches) event.preventDefault();
    });
  }

  /* ---------- section anchors ---------- */
  var sections = Array.prototype.slice.call(document.querySelectorAll('.policy-section[id]'));
  sections.forEach(function (section) {
    var heading = section.querySelector('h2');
    if (!heading) return;
    var link = document.createElement('a');
    link.className = 'anchor';
    link.href = '#' + section.id;
    link.textContent = '#';
    link.setAttribute('aria-label', (root.lang === 'ar' ? 'رابط إلى: ' : 'Link to: ') + heading.textContent.trim());
    heading.appendChild(link);
  });

  /* ---------- scrollspy, progress bar, back-to-top, language switch ---------- */
  var tocLinks = {};
  document.querySelectorAll('.toc a[href^="#"]').forEach(function (link) {
    tocLinks[link.getAttribute('href').slice(1)] = link;
    link.addEventListener('click', function () {
      if (narrow.matches && details) details.open = false;
    });
  });
  var progress = document.querySelector('.progress span');
  var toTop = document.querySelector('[data-to-top]');
  var langSwitch = document.querySelector('[data-lang-switch]');
  var current = null;

  function setCurrent(id) {
    if (id === current) return;
    if (current && tocLinks[current]) tocLinks[current].classList.remove('active');
    current = id;
    var link = id && tocLinks[id];
    if (link) {
      link.classList.add('active');
      if (!narrow.matches) {
        var toc = link.closest('.toc');
        var top = link.offsetTop - toc.clientHeight / 2;
        if (link.offsetTop < toc.scrollTop || link.offsetTop > toc.scrollTop + toc.clientHeight - 40) toc.scrollTop = top;
      }
    }
    if (langSwitch) langSwitch.hash = id ? '#' + id : '';
  }

  var ticking = false;
  function update() {
    ticking = false;
    var doc = document.documentElement;
    var max = doc.scrollHeight - window.innerHeight;
    var ratio = max > 0 ? Math.min(1, window.scrollY / max) : 0;
    if (progress) progress.style.width = (ratio * 100).toFixed(2) + '%';
    if (toTop) toTop.classList.toggle('visible', window.scrollY > 900);

    var line = window.innerHeight * 0.3;
    var active = null;
    for (var i = 0; i < sections.length; i += 1) {
      if (sections[i].getBoundingClientRect().top - line <= 0) active = sections[i].id;
      else break;
    }
    if (ratio > 0.995 && sections.length) active = sections[sections.length - 1].id;
    setCurrent(active);
  }
  window.addEventListener('scroll', function () {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(update);
    }
  }, { passive: true });
  window.addEventListener('resize', update);
  update();

  if (toTop) {
    toTop.addEventListener('click', function () {
      window.scrollTo(0, 0);
      history.replaceState(null, '', location.pathname);
      var skip = document.getElementById('top');
      if (skip) skip.focus({ preventScroll: true });
    });
  }
})();
