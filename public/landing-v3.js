(function () {
  'use strict';

  document.documentElement.classList.add('js');

  const menuButton = document.getElementById('menu-toggle');
  const navigation = document.getElementById('site-nav');

  function setMenu(open) {
    if (!menuButton || !navigation) return;
    menuButton.setAttribute('aria-expanded', String(open));
    navigation.dataset.open = String(open);
    const label = menuButton.querySelector('.sr-only');
    if (label) label.textContent = open ? 'Close navigation' : 'Open navigation';
  }

  if (menuButton && navigation) {
    menuButton.addEventListener('click', function () {
      setMenu(menuButton.getAttribute('aria-expanded') !== 'true');
    });

    navigation.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        setMenu(false);
      });
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
        setMenu(false);
        menuButton.focus();
      }
    });
  }

  const form = document.getElementById('automation-form');
  const status = document.getElementById('form-status');

  if (form && status && typeof window.fetch === 'function') {
    form.addEventListener('submit', async function (event) {
      event.preventDefault();

      if (!form.reportValidity()) return;

      const submitButton = form.querySelector('button[type="submit"]');
      const originalLabel = submitButton ? submitButton.textContent : '';

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Sending your idea…';
      }

      status.dataset.state = 'pending';
      status.textContent = 'Securely sending your automation idea.';

      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timeout = controller ? window.setTimeout(function () { controller.abort(); }, 15000) : null;

      try {
        const response = await window.fetch(form.action, {
          method: 'POST',
          body: new FormData(form),
          headers: { Accept: 'application/json' },
          signal: controller ? controller.signal : undefined,
        });

        if (!response.ok) throw new Error('Form service rejected the request');

        form.reset();
        status.dataset.state = 'success';
        status.textContent = 'Received. We’ll review your workflow and contact you directly.';
      } catch (error) {
        status.dataset.state = 'error';
        status.textContent = 'Your idea wasn’t sent. Try again, or email alienation2innovation@gmail.com.';
      } finally {
        if (timeout) window.clearTimeout(timeout);
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = originalLabel;
        }
      }
    });
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const revealTargets = Array.from(document.querySelectorAll('[data-reveal]'));

  if (!reduceMotion && revealTargets.length > 0 && 'IntersectionObserver' in window) {
    document.documentElement.classList.add('reveal-ready');

    const revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      });
    }, {
      rootMargin: '0px 0px -8% 0px',
      threshold: 0.08,
    });

    revealTargets.forEach(function (target) {
      revealObserver.observe(target);
    });
  }
})();
