document.addEventListener('DOMContentLoaded', () => {
  // 1. Penanganan klik season untuk menampilkan daftar episode
  document.querySelectorAll('.season-item').forEach(item => {
    const head = item.querySelector('.season-head');
    if (!head) return;

    head.addEventListener('click', async () => {
      const tvId = item.getAttribute('data-tv');
      const seasonNum = item.getAttribute('data-season');
      const panel = item.querySelector('.episode-panel');

      if (!panel) return;

      // Toggle buka/tutup
      item.classList.toggle('active');
      if (!item.classList.contains('active')) return;

      // Jika sudah pernah di-load, jangan load ulang
      if (panel.innerHTML.trim() !== '') return;

      panel.innerHTML = '<div class="loading-ep" style="padding: 10px; color: #aaa;">Зареждане на епизоди...</div>';

      try {
        const res = await fetch(`/api/season/${tvId}/${seasonNum}`);
        const data = await res.json();

        if (data.error || !data.episodes || data.episodes.length === 0) {
          panel.innerHTML = '<div class="empty-ep" style="padding: 10px; color: #aaa;">Няма налични епизоди за този сезон.</div>';
          return;
        }

        panel.innerHTML = data.episodes.map(ep => `
          <a href="${ep.url}" class="episode-card" style="display: flex; gap: 10px; padding: 10px; text-decoration: none; color: inherit; border-bottom: 1px solid #222;">
            <div class="ep-thumb" style="flex-shrink: 0;"><img src="${ep.still || '/img/no-thumb.jpg'}" alt="${escapeHtml(ep.name)}" style="width: 100px; border-radius: 4px; object-fit: cover;"></div>
            <div class="ep-info">
              <div class="ep-title" style="font-weight: bold; color: #fff; font-size: 0.95rem;">Епизод ${ep.number}: ${escapeHtml(ep.name)}</div>
              <div class="ep-date" style="font-size: 0.8rem; color: #888; margin-top: 4px;">${ep.airDate || ''}</div>
            </div>
          </a>
        `).join('');
      } catch (err) {
        panel.innerHTML = '<div class="empty-ep" style="padding: 10px; color: #e50914;">Грешка при зареждането</div>';
      }
    });
  });

  // 2. Search Functionality (Pencarian)
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');

  if (searchInput) {
    searchInput.addEventListener('input', async (e) => {
      const query = e.target.value;
      if (query.length < 2) {
        searchResults.style.display = 'none';
        return;
      }
      
      try {
        const res = styleFetchSearch(query); // Menggunakan query ter-encode aman
        const data = await res;
        
        if (data.results && data.results.length > 0) {
          searchResults.style.display = 'block';
          searchResults.innerHTML = data.results.slice(0, 5).map(item => `
            <a href="/${item.media_type || 'movie'}/${item.id}/${encodeURIComponent(item.title || item.name)}" style="display:block; padding:8px; color:#fff; text-decoration:none;">
              ${escapeHtml(item.title || item.name)}
            </a>
          `).join('');
        } else {
          searchResults.style.display = 'block';
          searchResults.innerHTML = '<div style="padding:8px; color:#888;">Няма намерени резултати</div>';
        }
      } catch (err) {
        console.error('Search error:', err);
      }
    });
  }

  // Klik di luar search untuk menutup hasil
  document.addEventListener('click', (e) => {
    if (searchResults && !searchResults.contains(e.target) && e.target !== searchInput) {
      searchResults.style.display = 'none';
    }
  });
});

async function styleFetchSearch(query) {
  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
  return await res.json();
}

// Helper escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
