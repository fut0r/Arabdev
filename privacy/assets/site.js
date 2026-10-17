/* ArabDev documentation sites: what all three share. The same file is in wiki/assets,
   privacy/assets and patch-notes/assets; change one, copy it to the other two.
   Every page is complete without JavaScript. This adds the theme switch, the phone menu,
   and keeps links on one machine while developing. */
(function () {
  'use strict';

  var root = document.documentElement;
  root.classList.add('js');

  /* In production each site has its own address (arabdev.site, wiki., privacy. and patch.).
     The Vite dev server serves them all from one origin, so links stay local there. */
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
    // The site's front page (/) opens in the language read last.
    try { localStorage.setItem('arabdev.lang', root.lang === 'ar' ? 'ar' : 'en'); } catch (e) { /* storage blocked */ }
  }

  /* Light and dark. The choice is shared with the app when both run on one origin. */
  document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
    button.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('arabdev.mode', next); } catch (e) { /* storage blocked */ }
    });
  });

  /* The navigation column becomes a drawer on phones. */
  var menuButton = document.querySelector('[data-menu]');
  var nav = document.querySelector('.nav');
  function setMenu(open) {
    document.body.classList.toggle('nav-open', open);
    if (menuButton) menuButton.setAttribute('aria-expanded', String(open));
  }
  if (menuButton && nav) {
    menuButton.addEventListener('click', function () {
      setMenu(!document.body.classList.contains('nav-open'));
    });
    nav.addEventListener('click', function (event) {
      if (event.target.closest('a')) setMenu(false);
    });
    document.addEventListener('click', function (event) {
      if (document.body.classList.contains('nav-open') && !event.target.closest('.nav, [data-menu]')) setMenu(false);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') setMenu(false);
    });
  }

  /* "/" jumps to the search box, as in the app. */
  var search = document.querySelector('[data-search]');
  if (search) {
    document.addEventListener('keydown', function (event) {
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if (event.key === '/' && !typing) {
        event.preventDefault();
        search.focus();
      }
    });
  }
})();
