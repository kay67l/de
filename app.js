  // Hero title word animation
  const titleWords = "Ashanti Regional Students' Representative Council".split(" ");
  const heroTitle = document.getElementById('heroTitle');
  heroTitle.innerHTML = titleWords.map((w,i) => `<span class="word" style="animation-delay:${0.15*i}s">${w}&nbsp;</span>`).join('');

  // Nav scroll state
  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 30);
    document.getElementById('toTop').classList.toggle('show', window.scrollY > 500);
  });

  // Mobile menu
  const burger = document.getElementById('burger');
  const mobileMenu = document.getElementById('mobileMenu');
  burger.addEventListener('click', () => {
    burger.classList.toggle('open');
    mobileMenu.classList.toggle('open');
  });
  mobileMenu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    burger.classList.remove('open');
    mobileMenu.classList.remove('open');
  }));

  // Scroll reveal
  const revealEls = document.querySelectorAll('.reveal');
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) entry.target.classList.add('visible');
    });
  }, { threshold: 0.15 });
  revealEls.forEach(el => revealObserver.observe(el));

  // Counter animation
  const counters = document.querySelectorAll('.stat-num');
  let countersStarted = false;
  const statsObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !countersStarted) {
        countersStarted = true;
        counters.forEach(counter => {
          const target = parseInt(counter.dataset.count, 10);
          const duration = 1400;
          const startTime = performance.now();
          function update(now) {
            const progress = Math.min((now - startTime) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            counter.textContent = Math.floor(eased * target).toLocaleString();
            if (progress < 1) requestAnimationFrame(update);
            else counter.textContent = target.toLocaleString() + ((counter === counters[0] || counter === counters[3]) ? "+" : "");
          }
          requestAnimationFrame(update);
        });
      }
    });
  }, { threshold: 0.4 });
  if (counters.length) statsObserver.observe(counters[0].closest('.stats'));

  // Accordion
  document.querySelectorAll('.accordion-item').forEach(item => {
    const head = item.querySelector('.accordion-head');
    const body = item.querySelector('.accordion-body');
    if (item.classList.contains('open')) body.style.maxHeight = body.scrollHeight + 'px';
    head.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.accordion-item').forEach(i => {
        i.classList.remove('open');
        i.querySelector('.accordion-body').style.maxHeight = null;
      });
      if (!isOpen) {
        item.classList.add('open');
        body.style.maxHeight = body.scrollHeight + 'px';
      }
    });
  });

  // Executive tabs
  document.querySelectorAll('.exec-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.exec-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.exec-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });

  // Ticker duplicate for seamless loop
  const ticker = document.getElementById('ticker');
  ticker.innerHTML += ticker.innerHTML;

  // Contact form is handled by contact-api.js

  // Back to top
  document.getElementById('toTop').addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });


function downloadFile(fileName) {
    const link = document.createElement("a");
    link.href = fileName;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);}


// ─── Dynamic executives section ──────────────────────────────────────────────
// Fetches from /api/executives and renders every tab (REC, Secretariat, and
// the grouped ZEC/Literary/WDS/ADHOC sub-committees) with the same .exec-card
// style, so all executive cards look identical regardless of category. Falls
// back to an empty-state message per tab if no executives have been added yet.
(function () {
  const recGrid = document.getElementById('execGrid-rec');
  const secGrid = document.getElementById('execGrid-sec');
  if (!recGrid) return; // not on a page with the executives section

  const GROUPED_CATEGORIES = ['zec', 'lit', 'wds', 'adhoc'];

  function escExec(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function execCardHTML(ex) {
    const photo = ex.photo_url
      ? `<img class="exec-cover-photo" src="${escExec(ex.photo_url)}" alt="">`
      : '';
    return `
      <div class="exec-card reveal">
        <div class="exec-photo">${photo}<div class="exec-avatar">${escExec(ex.initials || '')}</div></div>
        <h4>${escExec(ex.name)}</h4>
        <div class="exec-role">${escExec(ex.role)}</div>
        ${ex.school ? `<div class="exec-school">${escExec(ex.school)}</div>` : ''}
      </div>`;
  }

  fetch('/api/executives')
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(({ executives }) => {
      const list = executives || [];

      // REC: flat grid, no sub-group headings
      const recItems = list.filter(e => e.category === 'rec');
      recGrid.innerHTML = recItems.length
        ? recItems.map(execCardHTML).join('')
        : '<div class="news-empty">No REC members added yet.</div>';

      // Secretariat: also a flat grid, no sub-group headings
      if (secGrid) {
        const secItems = list.filter(e => e.category === 'sec');
        secGrid.innerHTML = secItems.length
          ? secItems.map(execCardHTML).join('')
          : '<div class="news-empty">No Secretariat members added yet.</div>';
      }

      // Every other tab: grouped into named sub-committees, same big card style as REC
      GROUPED_CATEGORIES.forEach(cat => {
        const container = document.getElementById(`execGroups-${cat}`);
        if (!container) return;

        const items = list.filter(e => e.category === cat);
        if (!items.length) {
          container.innerHTML = '<div class="news-empty">No members added yet for this section.</div>';
          return;
        }

        // Preserve first-appearance order of each sub-group
        const subgroups = [...new Set(items.map(e => e.subgroup || 'General'))];
        container.innerHTML = subgroups.map(sg => `
          <div class="exec-zone-group">
            <h4>${escExec(sg)}</h4>
            <div class="exec-grid">
              ${items.filter(e => (e.subgroup || 'General') === sg).map(execCardHTML).join('')}
            </div>
          </div>
        `).join('');
      });

      // Newly-injected .reveal cards start visible immediately (they were
      // added after the IntersectionObserver already ran its initial pass)
      document.querySelectorAll('#executives .reveal').forEach(el => el.classList.add('visible'));
    })
    .catch(() => {
      recGrid.innerHTML = '<div class="news-empty">Could not load executives.</div>';
    });
})();

// ─── Phase 3: Dynamic news section ───────────────────────────────────────────
// Fetches published posts from /api/posts and renders them in #newsContainer.
// Falls back to an empty state if no posts exist yet.
(function () {
  const container = document.getElementById('newsContainer');
  if (!container) return; // not on the news page

  // Show loading skeletons while fetching
  container.innerHTML = [1,2,3].map(() => `
    <div class="news-card skeleton-card" aria-hidden="true">
      <div class="news-top" style="background:rgba(255,255,255,0.04);"></div>
      <div class="news-body">
        <div class="skel skel-title"></div>
        <div class="skel skel-line"></div>
        <div class="skel skel-line short"></div>
      </div>
    </div>
  `).join('');

  fetch('/api/posts?category=news')
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(({ posts }) => {
      const newsPosts = (posts || []).filter(post => post.category !== 'Magazine' && post.category !== 'Story');
      if (newsPosts.length === 0) {
        container.innerHTML = `
          <div class="news-empty">
            <p>No posts yet. Check back soon for council updates.</p>
          </div>
        `;
        return;
      }

      const categoryGradients = {
        'News':         'linear-gradient(135deg, #3b82f6, #1d4ed8)',
        'Announcement': 'linear-gradient(135deg, #ef4444, #9f1414)',
        'Achievement':  'linear-gradient(135deg, #10b981, #047857)',
        'Event':        'linear-gradient(135deg, #8b5cf6, #6d28d9)',
        'Press Release':'linear-gradient(135deg, #f59e0b, #b45309)',
      };

      container.innerHTML = newsPosts.map(post => {
        const gradient = categoryGradients[post.category] || categoryGradients['News'];
        const date = new Date(post.created_at).toLocaleDateString('en-GB', {
          day: 'numeric', month: 'short', year: 'numeric'
        });

        const heroStyle = post.image_url
          ? `background:linear-gradient(rgba(6,12,31,0.35),rgba(6,12,31,0.7)),url(${post.image_url}) center/cover no-repeat;`
          : `background:${gradient};`;

        return `
          <a class="news-card reveal" href="/post.html?slug=${encodeURIComponent(post.slug)}"
             style="display:block; text-decoration:none; color:inherit;">
            <div class="news-top" style="${heroStyle}">
              <span class="news-date">${date}</span>
            </div>
            <div class="news-body">
              <span style="font-size:11px;font-weight:700;color:var(--blue-light);
                text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:6px;">
                ${esc(post.category)}
              </span>
              <h4>${esc(post.title)}</h4>
              <p>${esc(post.excerpt)}</p>
              <span class="news-link">Read more &rarr;</span>
            </div>
          </a>
        `;
      }).join('');

      // Re-run scroll reveal on newly added cards
      container.querySelectorAll('.reveal').forEach(el => {
        revealObserver.observe(el);
      });

    })
    .catch(err => {
      console.warn('[ARSRC] News section failed to load:', err);
      container.innerHTML = `
        <div class="news-empty">
          <p>Could not load posts right now. Please try again later.</p>
        </div>
      `;
    });

  function esc(str) {
    return String(str || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
})();


// ─── Dynamic magazines and stories ───────────────────────────────────────────
// Reuses the existing published-post API. Posts selected as Magazine or Story
// appear in the editorial shelf and link to the shared article page by slug.
(function () {
  const rail = document.getElementById('magazineRail');
  if (!rail) return;

  const editorialTypes = new Set(['Magazine', 'Story']);
  const escEditorial = (str) => String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  function editorialCard(post) {
    const category = editorialTypes.has(post.category) ? post.category : 'Story';
    const label = category === 'Magazine' ? 'Magazine' : 'Story';
    const image = post.image_url
      ? `background-image:linear-gradient(135deg,rgba(16,42,107,.18),rgba(220,38,38,.18)),url("${escEditorial(post.image_url)}");`
      : '';
    const date = post.created_at ? new Date(post.created_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : 'New';
    const slug = post.slug ? encodeURIComponent(post.slug) : '';
    return `
      <a class="editorial-card" href="post.html?slug=${slug}">
        <div class="editorial-thumb" style="${image}"><span class="editorial-thumb-label">${label}</span></div>
        <div class="editorial-card-body">
          <div class="eyebrow-row"><span class="eb">${escEditorial(category)}</span><span class="eb-bar"></span><span class="eb muted">Student desk</span></div>
          <h4>${escEditorial(post.title)}</h4>
          <p>${escEditorial(post.excerpt)}</p>
          <div class="editorial-card-meta"><span>${escEditorial(post.author || 'ARSRC Council')}</span><span>${escEditorial(date)}</span></div>
        </div>
      </a>`;
  }

  fetch('/api/posts?category=editorial&_=editorial', { credentials: 'same-origin' })
    .then(res => res.ok ? res.json() : Promise.reject(res.status))
    .then(({ posts }) => {
      const editorialPosts = (posts || []).filter(post => editorialTypes.has(post.category));
      if (!editorialPosts.length) return;
      rail.innerHTML = editorialPosts.map(editorialCard).join('');
      rail.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
      if (typeof revealObserver !== 'undefined') {
        rail.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));
      }
      rail.dispatchEvent(new Event('scroll'));
    })
    .catch(() => {
      // The built-in editorial examples remain visible if the endpoint is unavailable.
    });
})();


// ─── Dynamic resources ────────────────────────────────────────────────────────
(function () {
  const grid = document.getElementById('resourceGrid');
  if (!grid) return;

  const escResource = value => String(value || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  fetch('/api/resources?_=' + Date.now(), { credentials: 'same-origin' })
    .then(res => res.ok ? res.json() : Promise.reject(res.status))
    .then(({ resources }) => {
      if (!resources || !resources.length) return;
      grid.innerHTML = resources.map((resource, index) => {
        const type = resource.file_type ? resource.file_type.split('/').pop().toUpperCase() : 'FILE';
        const size = resource.file_size ? `${Math.max(1, Math.round(resource.file_size / 1024))} KB` : 'Download';
        return `
          <a class="resource-card reveal" href="${escResource(resource.file_url)}" target="_blank" rel="noopener" download>
            <div class="resource-icon" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg></div>
            <div><h5>${escResource(resource.title)}</h5><span>${escResource(resource.category || type)} · ${escResource(size)}</span>${resource.description ? `<p class="resource-description">${escResource(resource.description)}</p>` : ''}</div>
          </a>`;
      }).join('');
      grid.querySelectorAll('.reveal').forEach(el => {
        el.classList.add('visible');
        if (typeof revealObserver !== 'undefined') revealObserver.observe(el);
      });
    })
    .catch(() => {
      // Keep the built-in fallback resources visible if the endpoint is unavailable.
    });
})();
