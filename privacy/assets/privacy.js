/* ArabDev Privacy Policy: marks the section being read, adds section links, and prints.
   The policy is complete without JavaScript. */
(function () {
  'use strict';

  var root = document.documentElement;

  var printButton = document.querySelector('[data-print]');
  if (printButton) printButton.addEventListener('click', function () { window.print(); });

  /* A "#" link beside each section heading, for sharing a section. */
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

  /* The navigation column follows the reader. */
  var links = {};
  document.querySelectorAll('.nav a[href^="#"]').forEach(function (link) {
    links[link.getAttribute('href').slice(1)] = link;
  });
  var nav = document.querySelector('.nav');
  var langSwitch = document.querySelector('[data-lang-switch]');
  var current = null;

  function setCurrent(id) {
    if (id === current) return;
    if (current && links[current]) links[current].classList.remove('active');
    current = id;
    var link = id && links[id];
    if (link) {
      link.classList.add('active');
      // Keep the highlighted entry in view when the list is taller than the window. The nav is
      // sticky (or fixed on phones), so it is the link's offset parent.
      var top = link.offsetTop;
      if (top < nav.scrollTop || top > nav.scrollTop + nav.clientHeight - 48) nav.scrollTop = top - nav.clientHeight / 3;
    }
    if (langSwitch) langSwitch.hash = id ? '#' + id : '';
  }

  var ticking = false;
  function update() {
    ticking = false;
    var line = window.innerHeight * 0.3;
    var active = null;
    for (var i = 0; i < sections.length; i += 1) {
      if (sections[i].getBoundingClientRect().top - line <= 0) active = sections[i].id;
      else break;
    }
    var bottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    if (bottom && sections.length) active = sections[sections.length - 1].id;
    setCurrent(active);
  }
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(update);
  }, { passive: true });
  window.addEventListener('resize', update);
  update();
})();
