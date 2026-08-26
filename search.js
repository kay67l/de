/* ARSRC shared site search
 * Searches the current page's meaningful headings and content sections.
 * The same file is loaded by index.html and student-engagement.html.
 */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    const button = document.getElementById('siteSearchButton');
    const dialog = document.getElementById('siteSearchDialog');
    const input = document.getElementById('siteSearchInput');
    const results = document.getElementById('siteSearchResults');
    const closeButton = document.getElementById('siteSearchClose');
    if (!button || !dialog || !input || !results) return;

    let lastFocused = null;
    let searchIndex = [];
    let rebuildTimer;

    const excluded = new Set([
      'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'INPUT', 'TEXTAREA', 'BUTTON', 'SVG'
    ]);

    function cleanText(value) {
      return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function buildIndex() {
      const candidates = Array.from(document.querySelectorAll('main section, section, article, header.hero, footer'));
      const seen = new Set();
      searchIndex = candidates
        .filter((section) => {
          if (!section.id || seen.has(section.id)) return false;
          seen.add(section.id);
          return true;
        })
        .map((section) => {
          const clone = section.cloneNode(true);
          clone.querySelectorAll(Array.from(excluded).join(',')).forEach((el) => el.remove());
          const heading = section.querySelector('h1, h2, h3, h4, [role="heading"]');
          const title = cleanText(heading ? heading.textContent : section.id.replace(/[-_]/g, ' '));
          const text = cleanText(clone.textContent);
          return {
            id: section.id,
            title: title || section.id,
            text,
            page: document.title
          };
        })
        .filter((item) => item.text.length > 0);
    }

    function highlight(value, query) {
      const escaped = value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
      if (!query) return escaped;
      const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return escaped.replace(new RegExp('(' + safeQuery + ')', 'ig'), '<mark>$1</mark>');
    }

    function render(query) {
      const normalized = cleanText(query).toLowerCase();
      if (!normalized) {
        results.innerHTML = '<p class="site-search-hint">Type a word or phrase to search this page.</p>';
        return;
      }

      const terms = normalized.split(/\s+/).filter(Boolean);
      const matches = searchIndex
        .map((item) => {
          const haystack = (item.title + ' ' + item.text).toLowerCase();
          const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
          return { item, score };
        })
        .filter((entry) => entry.score === terms.length)
        .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
        .slice(0, 12);

      if (!matches.length) {
        results.innerHTML = '<p class="site-search-empty">No matching sections found. Try a different word.</p>';
        return;
      }

      results.innerHTML = matches.map(({ item }) => {
        const position = item.text.toLowerCase().indexOf(terms[0]);
        const start = Math.max(0, position - 55);
        const snippet = item.text.slice(start, start + 170);
        return `<a class="site-search-result" href="#${encodeURIComponent(item.id)}"><strong>${highlight(item.title, query)}</strong><span>${highlight(snippet, query)}${snippet.length === 170 ? '…' : ''}</span></a>`;
      }).join('');

      results.querySelectorAll('.site-search-result').forEach((link) => {
        link.addEventListener('click', () => close());
      });
    }

    function open() {
      buildIndex();
      lastFocused = document.activeElement;
      dialog.hidden = false;
      document.body.classList.add('site-search-open');
      button.setAttribute('aria-expanded', 'true');
      input.value = '';
      render('');
      window.setTimeout(() => input.focus(), 0);
    }

    function close() {
      dialog.hidden = true;
      document.body.classList.remove('site-search-open');
      button.setAttribute('aria-expanded', 'false');
      if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
    }

    button.addEventListener('click', open);
    closeButton && closeButton.addEventListener('click', close);
    input.addEventListener('input', () => render(input.value));
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) close();
    });
    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        dialog.hidden ? open() : close();
      } else if (event.key === 'Escape' && !dialog.hidden) {
        close();
      }
    });

    // Dynamic executives, news, galleries, and events are added after page load.
    // Rebuild the index lazily when the DOM changes, without excessive work.
    const observer = new MutationObserver(() => {
      window.clearTimeout(rebuildTimer);
      rebuildTimer = window.setTimeout(buildIndex, 150);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();

//# sourceURL=arsrc-search.js

/* Expose a tiny smoke-test hook for local validation without affecting the UI. */
if (typeof window !== 'undefined') window.ARSRCSearchLoaded = true;
