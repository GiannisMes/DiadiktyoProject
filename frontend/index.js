const API_BASE = 'http://localhost:3000/movielens/api';

const sessionRatings = {};
let sortState = { column: null, direction: 'asc' };
let currentMovies = [];


// ── Utility functions ──────────────────────────────────────

function setFeedback(elementId, message, isSuccess) {
    const el = document.getElementById(elementId);
    el.textContent = message;
    el.className = 'feedback ' + (isSuccess ? 'success' : 'error');
}

function showTable(tableId) {
    document.getElementById(tableId).classList.remove('hidden');
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
    // Counter animation
    el.classList.remove('bump');
    void el.offsetWidth; // force reflow
    el.classList.add('bump');
    setTimeout(() => el.classList.remove('bump'), 200);
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
    const colSpan = tbodyId === 'search-results-body' ? 6 : 4;
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

    renderSearchResults(currentMovies);
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

document.getElementById('btn-search').addEventListener('click', async () => {
    const keyword = document.getElementById('search-input').value.trim();

    if (!keyword) {
        setFeedback('search-feedback', 'Please enter a keyword.', false);
        return;
    }

    setLoading('btn-search', true, 'Search');
    try {
        const response = await fetch(`${API_BASE}/movies?search=${encodeURIComponent(keyword)}`);
        const data = await response.json();

        showTable('search-results');

        if (data.movies.length === 0) {
            setFeedback('search-feedback', 'No movies found.', false);
            showEmptyState('search-results-body', 'No movies found for your search.', '🎬');
            return;
        }

        setFeedback('search-feedback', `Found ${data.movies.length} movies.`, true);
        await renderSearchResults(data.movies);

    } catch (error) {
        setFeedback('search-feedback', 'Could not connect to server.', false);
    } finally {
        setLoading('btn-search', false, 'Search');
    }
});

async function renderSearchResults(movies) {
    const tbody = document.getElementById('search-results-body');
    tbody.innerHTML = '';

    // Αν είναι νέα αναζήτηση υπολόγισε τα avgRatings
    if (movies !== currentMovies) {
        currentMovies = [];
        for (const movie of movies) {
            let avgRating = 'N/A';
            try {
                const res = await fetch(`${API_BASE}/ratings/${movie.movieId}`);
                const data = await res.json();
                if (data.ratings.length > 0) {
                    const sum = data.ratings.reduce((acc, r) => acc + r.rating, 0);
                    avgRating = (sum / data.ratings.length).toFixed(2);
                }
            } catch (e) {
                avgRating = 'N/A';
            }
            currentMovies.push({ ...movie, avgRating });
        }
    }

    // Render
    for (const movie of currentMovies) {
        const starsHtml = movie.avgRating !== 'N/A'
            ? ratingToStars(parseFloat(movie.avgRating))
            : '';

        const avgBadge = movie.avgRating !== 'N/A'
            ? `<span class="avg-rating">${movie.avgRating}</span> ${starsHtml}`
            : '<span style="color:#444">N/A</span>';

        const currentRating = sessionRatings[movie.movieId] || '';

        const genreTags = movie.genres
            .split('|')
            .map(g => `<span class="genre-tag">${g}</span>`)
            .join('');

        const row = document.createElement('tr');
        row.innerHTML = `
            <td style="color:#555">#${movie.movieId}</td>
            <td style="color:white;font-weight:500">${movie.title}</td>
            <td>${genreTags}</td>
            <td>${avgBadge}</td>
            <td>
                <select id="rating-${movie.movieId}">
                    <option value="">--</option>
                    <option value="0.5"  ${currentRating == 0.5  ? 'selected' : ''}>0.5</option>
                    <option value="1.0"  ${currentRating == 1.0  ? 'selected' : ''}>1.0</option>
                    <option value="1.5"  ${currentRating == 1.5  ? 'selected' : ''}>1.5</option>
                    <option value="2.0"  ${currentRating == 2.0  ? 'selected' : ''}>2.0</option>
                    <option value="2.5"  ${currentRating == 2.5  ? 'selected' : ''}>2.5</option>
                    <option value="3.0"  ${currentRating == 3.0  ? 'selected' : ''}>3.0</option>
                    <option value="3.5"  ${currentRating == 3.5  ? 'selected' : ''}>3.5</option>
                    <option value="4.0"  ${currentRating == 4.0  ? 'selected' : ''}>4.0</option>
                    <option value="4.5"  ${currentRating == 4.5  ? 'selected' : ''}>4.5</option>
                    <option value="5.0"  ${currentRating == 5.0  ? 'selected' : ''}>5.0</option>
                </select>
            </td>
            <td>
                <button class="btn-small" onclick="rateMovie(${movie.movieId}, '${movie.title}')">Rate</button>
            </td>
        `;
        tbody.appendChild(row);
    }
}

function rateMovie(movieId, title) {
    const select = document.getElementById(`rating-${movieId}`);
    const rating = select.value;

    if (!rating) {
        setFeedback('search-feedback', `Please select a rating for "${title}".`, false);
        return;
    }

    sessionRatings[movieId] = parseFloat(rating);
    updateRatedCount();
    setFeedback('search-feedback', `Rated "${title}" with ${rating} stars.`, true);
}

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
            showEmptyState('recommendations-body', 'No recommendations found. Try rating more movies!', '🎯');
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
            <td style="color:#555">#${movie.movieId}</td>
            <td style="color:white;font-weight:500">${movie.title}</td>
            <td>${genreTags}</td>
            <td>
                <span class="predicted-rating">${movie.predictedRating}</span>
                <span class="stars" style="margin-left:6px">${ratingToStars(movie.predictedRating)}</span>
            </td>
        `;
        tbody.appendChild(row);
    });
}