const API_BASE = 'http://localhost:3000/movielens/api';

const sessionRatings = {};
const sessionRatingTitles = {};
let sortState = { column: null, direction: 'asc' };
let currentMovies = [];
let activeGenreFilter = null;


// ── Toast notifications ────────────────────────────────────

function showToast(message, isSuccess) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast ' + (isSuccess ? 'success' : 'error');
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 300);
    }, isSuccess ? 3000 : 4500);
}

// ── Utility functions ──────────────────────────────────────

function setFeedback(_elementId, message, isSuccess) {
    showToast(message, isSuccess);
}

function showTable(tableId) {
    document.getElementById(tableId + '-wrap').classList.remove('hidden');
}

function setLoading(buttonId, isLoading, originalText) {
    const btn = document.getElementById(buttonId);
    btn.disabled = isLoading;
    btn.textContent = isLoading ? 'Loading...' : originalText;
    btn.style.opacity = isLoading ? '0.6' : '1';
}

function updateRatedCount() {
    const el = document.getElementById('rated-count');
    el.textContent = Object.keys(sessionRatings).length;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
    setTimeout(() => el.classList.remove('bump'), 200);
    updateRatedPanel();
}

function ratingToStars(rating) {
    const normalized = rating / 5 * 5;
    const full = Math.floor(normalized);
    const half = (normalized - full) >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;

    let html = '';
    for (let i = 0; i < full; i++)  html += '<span class="star full">★</span>';
    if (half)                        html += '<span class="star half">★</span>';
    for (let i = 0; i < empty; i++) html += '<span class="star">★</span>';

    return `<span class="stars">${html}</span>`;
}

function showEmptyState(tbodyId, message, icon) {
    const tbody = document.getElementById(tbodyId);
    const colSpan = tbodyId === 'search-results-body' ? 5 : 4;
    tbody.innerHTML = `
        <tr>
            <td colspan="${colSpan}">
                <div class="empty-state">
                    <div class="empty-icon">${icon}</div>
                    <p>${message}</p>
                </div>
            </td>
        </tr>
    `;
}
function sortTable(column) {
    if (sortState.column === column) {
        sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
        sortState.column = column;
        sortState.direction = 'asc';
    }

    currentMovies.sort((a, b) => {
        let valA = a[column];
        let valB = b[column];

        // avgRating μπορεί να είναι 'N/A'
        if (column === 'avgRating') {
            valA = valA === 'N/A' ? -1 : parseFloat(valA);
            valB = valB === 'N/A' ? -1 : parseFloat(valB);
        }

        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return sortState.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortState.direction === 'asc' ? 1 : -1;
        return 0;
    });

    const toRender = activeGenreFilter
        ? currentMovies.filter(m => m.genres.split('|').map(g => g.trim()).includes(activeGenreFilter))
        : currentMovies;
    renderTableRows(toRender);
}

// ── Section 1: Add Movie ───────────────────────────────────

document.getElementById('btn-add-movie').addEventListener('click', async () => {
    const title = document.getElementById('new-title').value.trim();
    const genres = document.getElementById('new-genres').value.trim();

    if (!title) {
        setFeedback('add-movie-feedback', 'Please enter a title.', false);
        return;
    }
    if (!genres) {
        setFeedback('add-movie-feedback', 'Please enter at least one genre.', false);
        return;
    }

    setLoading('btn-add-movie', true, 'Add Movie');
    try {
        const response = await fetch(`${API_BASE}/movies`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, genres })
        });
        const data = await response.json();

        if (data.status === 'success') {
            setFeedback('add-movie-feedback', `Movie added successfully! ID: ${data.movieId}`, true);
            document.getElementById('new-title').value = '';
            document.getElementById('new-genres').value = '';
        } else {
            setFeedback('add-movie-feedback', 'Failed to add movie.', false);
        }
    } catch (error) {
        setFeedback('add-movie-feedback', 'Could not connect to server.', false);
    } finally {
        setLoading('btn-add-movie', false, 'Add Movie');
    }
});

// ── Section 2: Search Movies ───────────────────────────────

document.getElementById('btn-search').addEventListener('click', (e) => {
    e.stopPropagation();
    performSearch();
});

document.getElementById('search-input').addEventListener('keypress', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') performSearch();
});

async function performSearch() {
    const keyword = document.getElementById('search-input').value.trim();

    if (!keyword) {
        setFeedback('search-feedback', 'Please enter a keyword.', false);
        return;
    }

    setLoading('btn-search', true, 'Search');
    try {
        const response = await fetch(`${API_BASE}/movies?search=${encodeURIComponent(keyword)}`);
        const data = await response.json();

            if (data.status !== 'success' || !data.movies) {
                setFeedback('search-feedback', 'Server error: ' + (data.detail || 'Invalid response'), false);
                return;
            }

        showTable('search-results');

        if (data.movies.length === 0) {
            setFeedback('search-feedback', 'No movies found.', false);
            showEmptyState('search-results-body', 'No movies found for your search.', '🎬');
            return;
        }

        setFeedback('search-feedback', `Found ${data.movies.length} movies.`, true);
        renderSearchResults(data.movies);

    } catch (error) {
            console.error("Search error:", error);
        setFeedback('search-feedback', 'Could not connect to server.', false);
    } finally {
        setLoading('btn-search', false, 'Search');
    }
}

function renderSearchResults(movies) {
    activeGenreFilter = null;
    currentMovies = movies;
    renderGenreFilters();
    renderTableRows(currentMovies);
}

function renderTableRows(movies) {
    const tbody = document.getElementById('search-results-body');
    tbody.innerHTML = '';

    for (const movie of movies) {
        const starsHtml = movie.avgRating !== 'N/A'
            ? ratingToStars(parseFloat(movie.avgRating))
            : '';
        const avgBadge = movie.avgRating !== 'N/A'
            ? `<span class="avg-rating">${movie.avgRating}</span>${starsHtml}`
            : '<span style="color:#555;font-size:12px">N/A</span>';
        const genreTags = (movie.genres || '')
            .split('|')
            .map(g => `<span class="genre-tag">${g.trim()}</span>`)
            .join('');

        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="movie-id">#${movie.movieId}</td>
            <td class="movie-title">${movie.title}</td>
            <td>${genreTags}</td>
            <td>${avgBadge}</td>
            <td>${buildRatingWidget(movie.movieId, movie.title)}</td>
        `;
        tbody.appendChild(row);
    }

    initRatingWidgets();
}

// ── Genre filter chips ─────────────────────────────────────

function renderGenreFilters() {
    const bar = document.getElementById('genre-filters');
    const genres = new Set();
    currentMovies.forEach(m => (m.genres || '').split('|').forEach(g => genres.add(g.trim())));

    bar.innerHTML = '';
    bar.classList.remove('hidden');

    const allChip = document.createElement('button');
    allChip.className = 'genre-chip' + (activeGenreFilter === null ? ' active' : '');
    allChip.textContent = 'All';
    allChip.addEventListener('click', (e) => {
        e.stopPropagation();
        activeGenreFilter = null;
        renderGenreFilters();
        renderTableRows(currentMovies);
    });
    bar.appendChild(allChip);

    [...genres].sort().forEach(genre => {
        const chip = document.createElement('button');
        chip.className = 'genre-chip' + (activeGenreFilter === genre ? ' active' : '');
        chip.textContent = genre;
        chip.addEventListener('click', (e) => {
            e.stopPropagation();
            activeGenreFilter = genre;
            const filtered = currentMovies.filter(m =>
                (m.genres || '').split('|').map(g => g.trim()).includes(genre)
            );
            renderGenreFilters();
            renderTableRows(filtered);
        });
        bar.appendChild(chip);
    });
}

function buildRatingWidget(movieId, title) {
    let html = `<div class="rating-widget" data-mid="${movieId}" data-title="${(title || '').replace(/"/g, '&quot;')}">`;
    for (let i = 1; i <= 5; i++) {
        html += `<span class="rw-star" data-full="${i}" data-half="${i - 0.5}">` +
                `<span class="rw-l" data-val="${i - 0.5}"></span>` +
                `<span class="rw-r" data-val="${i}"></span>` +
                `★</span>`;
    }
    html += `</div>`;
    return html;
}

function highlightWidget(movieId, val) {
    const widget = document.querySelector(`.rating-widget[data-mid="${movieId}"]`);
    if (!widget) return;
    widget.querySelectorAll('.rw-star').forEach(star => {
        const full = parseFloat(star.dataset.full);
        const half = parseFloat(star.dataset.half);
        star.classList.remove('rw-full', 'rw-half');
        if (val >= full)      star.classList.add('rw-full');
        else if (val >= half) star.classList.add('rw-half');
    });
}

function initRatingWidgets() {
    document.querySelectorAll('.rating-widget').forEach(widget => {
        const movieId = parseInt(widget.dataset.mid);
        const title   = widget.dataset.title;

        // Restore saved rating on init
        highlightWidget(movieId, sessionRatings[movieId] || 0);

        widget.querySelectorAll('.rw-l, .rw-r').forEach(zone => {
            zone.addEventListener('mouseenter', (e) => {
                e.stopPropagation();
                highlightWidget(movieId, parseFloat(zone.dataset.val));
            });

            zone.addEventListener('click', (e) => {
                e.stopPropagation();
                const val = parseFloat(zone.dataset.val);
                sessionRatings[movieId] = val;
                sessionRatingTitles[movieId] = title;
                highlightWidget(movieId, val);
                updateRatedCount();
                showToast(`Rated "${title}" — ${val} stars`, true);
            });
        });

        widget.addEventListener('mouseleave', (e) => {
            e.stopPropagation();
            highlightWidget(movieId, sessionRatings[movieId] || 0);
        });
    });
}


// ── Rated this session panel ───────────────────────────────

function updateRatedPanel() {
    const body  = document.getElementById('rated-panel-body');
    const badge = document.getElementById('rated-panel-badge');
    const entries = Object.entries(sessionRatings);

    badge.textContent = entries.length;

    if (entries.length === 0) {
        body.innerHTML = '<p class="rated-panel-empty">No ratings yet.</p>';
        return;
    }

    body.innerHTML = entries.map(([id, rating]) => {
        const t = sessionRatingTitles[id] || `Movie #${id}`;
        return `<div class="rated-panel-item">
            <span class="rated-panel-title" title="${t}">${t}</span>
            <span class="rated-panel-score">${rating} ★</span>
        </div>`;
    }).join('');
}

document.getElementById('rated-panel-toggle').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('rated-panel-body').classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
    // Rated panel: close when clicking outside
    const panel = document.getElementById('rated-panel');
    if (!panel.contains(e.target)) {
        document.getElementById('rated-panel-body').classList.add('hidden');
    }

    // Search section: reset when clicking outside
    const searchSection = document.getElementById('section-search');
    if (!searchSection.contains(e.target)) {
        document.getElementById('search-results-wrap').classList.add('hidden');
        document.getElementById('genre-filters').classList.add('hidden');
    }

    // Recommendations section: reset when clicking outside
    const recoSection = document.getElementById('section-recommendations');
    if (!recoSection.contains(e.target)) {
        document.getElementById('recommendations-results-wrap').classList.add('hidden');
    }
});

// ── Section 3: Recommendations ─────────────────────────────

document.getElementById('btn-recommendations').addEventListener('click', async () => {
    if (Object.keys(sessionRatings).length === 0) {
        setFeedback('recommendations-feedback', 'Please rate at least one movie first.', false);
        return;
    }

    const ratings = Object.entries(sessionRatings).map(([movieId, rating]) => ({
        movieId: parseInt(movieId),
        rating: rating
    }));

    setLoading('btn-recommendations', true, 'Get Recommendations');
    try {
        const response = await fetch(`${API_BASE}/recommendations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ratings })
        });
        const data = await response.json();

        showTable('recommendations-results');

        if (data.recommendations.length === 0) {
            setFeedback('recommendations-feedback', 'No recommendations found. Try rating more movies.', false);
            showEmptyState('recommendations-body', 'No recommendations found. Try rating more movies!',':(');
            return;
        }

        setFeedback('recommendations-feedback', `Found ${data.recommendations.length} recommendations.`, true);
        renderRecommendations(data.recommendations);

    } catch (error) {
        setFeedback('recommendations-feedback', 'Could not connect to server.', false);
    } finally {
        setLoading('btn-recommendations', false, 'Get Recommendations');
    }
});

function renderRecommendations(recommendations) {
    const tbody = document.getElementById('recommendations-body');
    tbody.innerHTML = '';

    recommendations.forEach(movie => {
        const genreTags = movie.genres
            .split('|')
            .map(g => `<span class="genre-tag">${g}</span>`)
            .join('');

        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="movie-id">#${movie.movieId}</td>
            <td class="movie-title">${movie.title}</td>
            <td>${genreTags}</td>
            <td>
                <span class="predicted-rating">${movie.predictedRating}</span>
                <span class="stars" style="margin-left:6px">${ratingToStars(movie.predictedRating)}</span>
            </td>
        `;
        tbody.appendChild(row);
    });
}