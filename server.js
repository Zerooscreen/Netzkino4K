const express = require('express');
const { tmdb, img, slugify } = require('./lib/tmdb');
const { 
  head, layout, posterCard, genreRow, trailerBlock, castGrid, 
  escapeHtml, movieJsonLd, tvJsonLd, sideBannerAd, nativeBannerAd, 
  DEFAULT_TITLE, DEFAULT_DESC, SITE_NAME 
} = require('./lib/render');

const app = express();
const PORT = process.env.PORT || 3000;
const SITE_URL = process.env.SITE_URL || 'https://netzkino4k.up.railway.app';

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// ---------- PROTEKSI BOT SEDERHANA ----------
app.use((req, res, next) => {
  const ua = (req.get('user-agent') || '').toLowerCase();
  const maliciousBots = ['python-requests', 'curl', 'wget', 'scrapy', 'libwww-perl'];
  
  if (maliciousBots.some(bot => ua.includes(bot))) {
    return res.status(403).send('Access Denied');
  }
  next();
});

// ---------- SITEMAP & ROBOTS.TXT ----------
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send(`User-agent: *\nDisallow: /watch/\nDisallow: /api/\nSitemap: ${SITE_URL}/sitemap.xml`);
});

app.get('/sitemap.xml', async (req, res) => {
  try {
    const [trendingMovies, trendingTv] = await Promise.all([
      tmdb('/trending/movie/day').catch(() => ({ results: [] })),
      tmdb('/trending/tv/day').catch(() => ({ results: [] }))
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const urls = [
      { loc: `${SITE_URL}/`, priority: '1.0', changefreq: 'daily' },
      { loc: `${SITE_URL}/movie`, priority: '0.9', changefreq: 'daily' },
      { loc: `${SITE_URL}/tv`, priority: '0.9', changefreq: 'daily' },
      ...[...(trendingMovies.results || [])].map(m => ({ 
        loc: `${SITE_URL}/movie/${m.id}/${encodeURIComponent(slugify(m.title) || 'movie')}`, 
        priority: '0.8', 
        changefreq: 'weekly' 
      })),
      ...[...(trendingTv.results || [])].map(t => ({ 
        loc: `${SITE_URL}/tv/${t.id}/${encodeURIComponent(slugify(t.name) || 'tv')}`, 
        priority: '0.8', 
        changefreq: 'weekly' 
      })),
    ];

    const uniq = [...new Map(urls.map(u => [u.loc, u])).values()];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${uniq.map(u => `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`).join('\n')}
</urlset>`;

    res.type('application/xml').send(xml);
  } catch (e) {
    res.status(500).send('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
  }
});

// ---------- HOME: / ----------
app.get('/', async (req, res) => {
  try {
    const [trending, movies, tv] = await Promise.all([
      tmdb('/trending/all/day'),
      tmdb('/movie/popular'),
      tmdb('/tv/popular'),
    ]);

    const heroItem = (trending.results || [])[0] || {};
    const heroSlug = slugify(heroItem.title || heroItem.name);

    const bodyHtml = `
      <div id="hero" style="background-image:url('${img(heroItem.backdrop_path, 'original')}')">
        <div class="hero-fade"></div>
        <div class="hero-content">
          <div class="hero-eyebrow">HEUTE BELIEBT</div>
          <h1 class="hero-title">${escapeHtml(heroItem.title || heroItem.name)}</h1>
          <p class="hero-overview">${escapeHtml(heroItem.overview || '').slice(0, 160)}...</p>
          <a class="hero-btn" href="/${heroItem.media_type === 'tv' ? 'tv' : 'movie'}/${heroItem.id}/${encodeURIComponent(heroSlug)}">Details ansehen ▸</a>
        </div>
      </div>
      <section class="row">
        <div class="row-head"><h2>Beliebte Filme</h2></div>
        <div class="grid">
          ${(movies.results || []).slice(0, 12).map(item => posterCard(item, 'movie')).join('')}
        </div>
      </section>
      <section class="row">
        <div class="row-head"><h2>Beliebte Serien</h2></div>
        <div class="grid">
          ${(tv.results || []).slice(0, 12).map(item => posterCard(item, 'tv')).join('')}
        </div>
      </section>
    `;

    const headHtml = head({
      title: DEFAULT_TITLE,
      description: DEFAULT_DESC,
      url: SITE_URL,
      image: img(heroItem.backdrop_path, 'w780'),
    });

    res.send(layout({ headHtml, bodyHtml, activeTab: 'movie' }));
  } catch (e) {
    res.status(500).send('Serverfehler');
  }
});

// ---------- DETAIL FILM: /movie/:id/:slug? ----------
app.get('/movie/:id/:slug?', async (req, res) => {
  const { id } = req.params;
  try {
    const [data, credits, videos, similarData] = await Promise.all([
      tmdb(`/movie/${id}`),
      tmdb(`/movie/${id}/credits`),
      tmdb(`/movie/${id}/videos`),
      tmdb(`/movie/${id}/similar`),
    ]);
    const correctSlug = slugify(data.title);
    if (req.params.slug !== correctSlug) {
      return res.redirect(301, `/movie/${id}/${encodeURIComponent(correctSlug)}`);
    }

    const watchUrl = `/watch/movie/${id}`;

    const bodyHtml = `
      <a class="back-btn" href="/movie">← Zurück</a>
      <div class="detail-hero">
        <div class="hero-bg" style="background-image:url('${img(data.backdrop_path, 'original')}')"></div>
        <div class="hero-fade"></div>
        <div class="detail-poster"><img src="${img(data.poster_path, 'w500')}" alt="Poster"></div>
        <div class="detail-info">
          <div class="detail-eyebrow">Film</div>
          <h1 class="detail-title">${escapeHtml(data.title)}</h1>
          <div class="detail-orig">${escapeHtml(data.original_title)} · ${(data.release_date || '').slice(0, 4)}</div>
          ${data.tagline ? `<div class="tagline">"${escapeHtml(data.tagline)}"</div>` : ''}
          <div class="detail-meta">
            <span class="m-item star">★ ${data.vote_average ? data.vote_average.toFixed(1) : '-'} / 10</span>
            <span class="m-item">${data.runtime ? data.runtime + ' Min.' : ''}</span>
            <span class="m-item">${(data.release_date || '').slice(0, 4)}</span>
          </div>
          ${genreRow(data.genres)}
          <div class="action-buttons" style="margin-top: 20px;">
            <a href="${watchUrl}" class="btn-watch" style="padding: 14px 32px; font-size: 18px; font-weight: bold; background: #e50914; color: #fff; border-radius: 8px; text-decoration: none; display: inline-block; box-shadow: 0 4px 12px rgba(229, 9, 20, 0.4);" target="_blank" rel="nofollow">▶ Jetzt streamen</a>
          </div>
        </div>
      </div>
      <div class="section-block"><h3>Handlung</h3><div class="bio-text">${escapeHtml(data.overview) || 'Keine Handlung verfügbar.'}</div></div>
      <div class="section-block"><h3>Trailer</h3>${trailerBlock(videos)}</div>
      <div class="section-block"><h3>Besetzung</h3>${castGrid(credits)}</div>
      <div class="section-block">
        <h3>Ähnliche Filme</h3>
        <div class="similar-grid">
          ${(similarData.results || []).slice(0, 6).map(item => posterCard(item, 'movie')).join('')}
        </div>
      </div>
    `;

    const headHtml = head({
      title: `${data.title} · Online Film streamen`,
      description: data.overview || DEFAULT_DESC,
      url: `${SITE_URL}/movie/${id}/${encodeURIComponent(correctSlug)}`,
      image: img(data.backdrop_path, 'w780'),
      type: 'video.movie',
    });

    res.send(layout({ headHtml, bodyHtml, activeTab: 'movie' }));
  } catch (e) {
    res.status(404).send('Film nicht gefunden');
  }
});

// ---------- DETAIL SERIE: /tv/:id/:slug? ----------
app.get('/tv/:id/:slug?', async (req, res) => {
  const { id } = req.params;
  try {
    const [data, credits, videos, similarData] = await Promise.all([
      tmdb(`/tv/${id}`),
      tmdb(`/tv/${id}/credits`),
      tmdb(`/tv/${id}/videos`),
      tmdb(`/tv/${id}/similar`),
    ]);
    const correctSlug = slugify(data.name);
    if (req.params.slug !== correctSlug) {
      return res.redirect(301, `/tv/${id}/${encodeURIComponent(correctSlug)}`);
    }

    const watchUrl = `/watch/tv/${id}`;

    const seasons = (data.seasons || []).filter(s => s.season_number >= 0);
    const seasonsHtml = seasons.map(s => `
      <div class="season-item" data-season="${s.season_number}" data-tv="${id}">
        <div class="season-head">
          <img src="${img(s.poster_path, 'w92')}" alt="">
          <div>
            <div class="s-title">${escapeHtml(s.name)}</div>
            <div class="s-meta">${s.episode_count} Episoden · ${(s.air_date || '').slice(0, 4)}</div>
          </div>
          <div class="chev">▶</div>
        </div>
        <div class="episode-panel"></div>
      </div>
    `).join('');

    const bodyHtml = `
      <a class="back-btn" href="/tv">← Zurück</a>
      <div class="detail-hero">
        <div class="hero-bg" style="background-image:url('${img(data.backdrop_path, 'original')}')"></div>
        <div class="hero-fade"></div>
        <div class="detail-poster"><img src="${img(data.poster_path, 'w500')}" alt=""></div>
        <div class="detail-info">
          <div class="detail-eyebrow">Serie</div>
          <h1 class="detail-title">${escapeHtml(data.name)}</h1>
          <div class="detail-orig">${escapeHtml(data.original_name)} · ${(data.first_air_date || '').slice(0, 4)}</div>
          <div class="detail-meta">
            <span class="m-item star">★ ${data.vote_average ? data.vote_average.toFixed(1) : '-'} / 10</span>
            <span class="m-item">${data.number_of_seasons || '-'} Staffeln</span>
          </div>
          ${genreRow(data.genres)}
          <div class="action-buttons" style="margin-top: 20px;">
            <a href="${watchUrl}" class="btn-watch" style="padding: 14px 32px; font-size: 18px; font-weight: bold; background: #e50914; color: #fff; border-radius: 8px; text-decoration: none; display: inline-block; box-shadow: 0 4px 12px rgba(229, 9, 20, 0.4);" target="_blank" rel="nofollow">▶ Jetzt streamen</a>
          </div>
        </div>
      </div>
      <div class="section-block"><h3>Handlung</h3><div class="bio-text">${escapeHtml(data.overview) || 'Keine Handlung verfügbar.'}</div></div>
      <div class="section-block"><h3>Trailer</h3>${trailerBlock(videos)}</div>
      <div class="section-block"><h3>Besetzung</h3>${castGrid(credits)}</div>
      <div class="section-block">
        <h3>Staffeln und Episoden</h3>
        <div class="season-list" id="season-list">${seasonsHtml}</div>
      </div>
      <div class="section-block">
        <h3>Ähnliche Serien</h3>
        <div class="similar-grid">
          ${(similarData.results || []).slice(0, 6).map(item => posterCard(item, 'tv')).join('')}
        </div>
      </div>
    `;

    const headHtml = head({
      title: `${data.name} · Serie online ansehen`,
      description: data.overview || DEFAULT_DESC,
      url: `${SITE_URL}/tv/${id}/${encodeURIComponent(correctSlug)}`,
      image: img(data.backdrop_path, 'w780'),
      type: 'video.tv_show',
    });

    res.send(layout({ headHtml, bodyHtml, activeTab: 'tv' }));
  } catch (e) {
    res.status(404).send('Serie nicht gefunden');
  }
});

// ---------- COUNTDOWN / WATCH REDIRECT ----------
app.get('/watch/:type/:id', async (req, res) => {
  const { type, id } = req.params;
  
  try {
    const endpoint = type === 'tv' ? `/tv/${id}` : `/movie/${id}`;
    const data = await tmdb(endpoint);
    const title = data.title || data.name || 'video';
    const itemSlug = slugify(title);

    const targetUrl = `https://moviegate.bolt.host/de/${type}/${id}/${itemSlug}`;

    const bodyHtml = `
      <div style="max-width: 600px; margin: 80px auto; text-align: center; padding: 40px; background: var(--card); border: 1px solid var(--line); border-radius: 12px;">
        <h1 style="font-size: 28px; margin-bottom: 16px;">Dein Stream wird vorbereitet...</h1>
        <p style="color: var(--muted); margin-bottom: 24px;">Du wirst in <span id="countdown" style="color: var(--red); font-weight: bold; font-size: 20px;">5</span> Sekunden zum Player weitergeleitet.</p>
        <div style="margin-bottom: 30px;">
          <div style="width: 50px; height: 50px; border: 4px solid var(--line); border-top-color: var(--red); border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto;"></div>
        </div>
        <a href="${targetUrl}" class="btn-watch" style="display: inline-block; padding: 12px 24px; background: #e50914; color: #fff; border-radius: 6px; text-decoration: none;">Jetzt manuell fortfahren ▸</a>
      </div>
      <style>
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      </style>
      <script>
        let seconds = 5;
        const countEl = document.getElementById('countdown');
        const timer = setInterval(() => {
          seconds--;
          countEl.textContent = seconds;
          if (seconds <= 0) {
            clearInterval(timer);
            window.location.href = "${targetUrl}";
          }
        }, 1000);
      </script>
    `;

    const headHtml = head({
      title: 'Weiterleitung zum Stream · FlixKinoHD',
      description: DEFAULT_DESC,
      url: `${SITE_URL}/watch/${type}/${id}`,
      robots: 'noindex, nofollow',
    });

    res.send(layout({ headHtml, bodyHtml, activeTab: '' }));
  } catch (e) {
    const targetUrl = `https://moviegate.bolt.host/de/${type}/${id}`;
    res.redirect(targetUrl);
  }
});

// ---------- AKTOR / PERSON DETAIL (TMDB DATABASE) ----------
app.get('/person/:id/:slug?', async (req, res) => {
  const { id } = req.params;
  try {
    const [person, combinedCredits] = await Promise.all([
      tmdb(`/person/${id}`),
      tmdb(`/person/${id}/combined_credits`),
    ]);

    const correctSlug = slugify(person.name);
    if (req.params.slug !== correctSlug) {
      return res.redirect(301, `/person/${id}/${encodeURIComponent(correctSlug)}`);
    }

    const castMovies = (combinedCredits.cast || []).sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0));

    const bodyHtml = `
      <a class="back-btn" href="javascript:history.back()">← Zurück</a>
      <div class="detail-hero" style="align-items: flex-start;">
        <div class="detail-poster"><img src="${img(person.profile_path, 'h632')}" alt=""></div>
        <div class="detail-info">
          <div class="detail-eyebrow">Biografie</div>
          <h1 class="detail-title">${escapeHtml(person.name)}</h1>
          <div class="detail-meta">
            ${person.birthday ? `<span class="m-item">Geburtstag: ${person.birthday}</span>` : ''}
            ${person.place_of_birth ? `<span class="m-item">Geburtsort: ${escapeHtml(person.place_of_birth)}</span>` : ''}
          </div>
          <div class="bio-text" style="margin-top: 15px;">${escapeHtml(person.biography) || 'Keine Biografie verfügbar.'}</div>
        </div>
      </div>
      <div class="section-block" style="margin-top: 40px;">
        <h3>Filme und Serien mit ${escapeHtml(person.name)}</h3>
        <div class="grid">
          ${castMovies.map(item => posterCard(item, item.media_type === 'tv' ? 'tv' : 'movie')).join('')}
        </div>
      </div>
    `;

    const headHtml = head({
      title: `${person.name} · Filme, Serien & Biografie`,
      description: person.biography ? person.biography.slice(0, 150) + '...' : DEFAULT_DESC,
      url: `${SITE_URL}/person/${id}/${encodeURIComponent(correctSlug)}`,
      image: img(person.profile_path, 'w780'),
    });

    res.send(layout({ headHtml, bodyHtml, activeTab: '' }));
  } catch (e) {
    res.status(404).send('Person nicht gefunden');
  }
});

// ---------- KATALOG HALAMAN UTAMA ----------
app.get('/movie', async (req, res) => {
  const data = await tmdb('/movie/popular');
  const bodyHtml = `
    <h1 style="font-size:28px; margin:24px 0;">Beliebte Filme</h1>
    <div class="grid">${(data.results || []).map(item => posterCard(item, 'movie')).join('')}</div>
  `;
  res.send(layout({ headHtml: head({ title: 'Filme · Netzkino4K', description: DEFAULT_DESC, url: `${SITE_URL}/movie` }), bodyHtml, activeTab: 'movie' }));
});

app.get('/tv', async (req, res) => {
  const data = await tmdb('/tv/popular');
  const bodyHtml = `
    <h1 style="font-size:28px; margin:24px 0;">Beliebte Serien</h1>
    <div class="grid">${(data.results || []).map(item => posterCard(item, 'tv')).join('')}</div>
  `;
  res.send(layout({ headHtml: head({ title: 'Serien · Netzkino4K', description: DEFAULT_DESC, url: `${SITE_URL}/tv` }), bodyHtml, activeTab: 'tv' }));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
