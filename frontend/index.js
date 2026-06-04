// το base url του backend - αν αλλαξει το url αλλαζουμε μονο εδω
const API_BASE = 'http://localhost:3000/movielens/api';

// αποθηκευει προσωρινα τις βαθμολογιες της session { movieId: rating }
const sessionRatings = {};
// κρατα τον τιτλο για καθε ταινια που βαθμολογηθηκε, για να τον εμφανιζουμε στο panel
const sessionRatingTitles = {};
// θυμαται ποια στηλη ειναι ταξινομημενη και αν ειναι ascending η descending
let sortState = { column: null, direction: 'asc' };
// κρατα παντα την τελευταια λιστα ταινιων που εφερε το search, την χρειαζομαστε για sorting και filtering
let currentMovies = [];
// ποιο genre chip ειναι επιλεγμενο αυτη τη στιγμη, null σημαινει "All"
let activeGenreFilter = null;


// ── Toast notifications ────────────────────────────────────

// δημιουργει δυναμικα ενα toast notification στο κατω-δεξια της οθονης
function showToast(message, isSuccess) {
    const container = document.getElementById('toast-container');
    // φτιαχνουμε το div του toast
    const toast = document.createElement('div');
    // βαζουμε class success η error, το css χειριζεται τα χρωματα
    toast.className = 'toast ' + (isSuccess ? 'success' : 'error');
    toast.textContent = message;
    container.appendChild(toast);
    // μετα απο 3 δευτ (επιτυχια) η 4.5 (σφαλμα) ξεκιναμε το fade out
    setTimeout(() => {
        toast.classList.add('toast-out');
        // περιμενουμε αλλα 300ms (οσο κραταει το animation) και μετα αφαιρουμε το element εντελως
        setTimeout(() => toast.remove(), 300);
    }, isSuccess ? 3000 : 4500);
}

// ── Utility functions ──────────────────────────────────────

// wrapper που καλει το showToast - το _elementId δεν χρησιμοποιειται πλεον, γι αυτο εχει _
function setFeedback(_elementId, message, isSuccess) {
    showToast(message, isSuccess);
}

// αφαιρει το class hidden απο εναν πινακα για να τον κανει ορατο
function showTable(tableId) {
    document.getElementById(tableId + '-wrap').classList.remove('hidden');
}

// οταν γινεται api call: κανει disable το κουμπι και γραφει Loading, οταν τελειωσει επαναφερει τα παντα
function setLoading(buttonId, isLoading, originalText) {
    const btn = document.getElementById(buttonId);
    btn.disabled = isLoading;
    btn.textContent = isLoading ? 'Loading...' : originalText;
    btn.style.opacity = isLoading ? '0.6' : '1';
}

// ενημερωνει τον counter "Movies rated: X" και κανει ενα μικρο animation για να τραβηξει την προσοχη
function updateRatedCount() {
    const el = document.getElementById('rated-count');
    // μετραει ποσα keys εχει το sessionRatings object (= ποσες ταινιες βαθμολογηθηκαν)
    el.textContent = Object.keys(sessionRatings).length;
    // αφαιρουμε το class και μετα το ξαναβαζουμε - χρειαζεται το void offsetWidth για να κανει
    // ο browser reflow αλλιως δεν "βλεπει" τη διαφορα και δεν παιζει το animation ξανα
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
    setTimeout(() => el.classList.remove('bump'), 200);
    // ενημερωνουμε και το panel κατω-αριστερα
    updateRatedPanel();
}

// μετατρεπει εναν αριθμο (π.χ. 3.5) σε html με αστερια - γεματα, μισα και αδεια
function ratingToStars(rating) {
    const normalized = rating / 5 * 5;
    // ποσα γεματα αστερια
    const full = Math.floor(normalized);
    // υπαρχει μισο αστερι? (αν το υπολοιπο ειναι >= 0.5)
    const half = (normalized - full) >= 0.5 ? 1 : 0;
    // αδεια αστερια για να συμπληρωσουμε τα 5
    const empty = 5 - full - half;

    let html = '';
    for (let i = 0; i < full; i++)  html += '<span class="star full">★</span>';
    if (half)                        html += '<span class="star half">★</span>';
    for (let i = 0; i < empty; i++) html += '<span class="star">★</span>';

    return `<span class="stars">${html}</span>`;
}

// εμφανιζει ενα φιλικο μηνυμα μεσα στον πινακα οταν δεν υπαρχουν αποτελεσματα
function showEmptyState(tbodyId, message, icon) {
    const tbody = document.getElementById(tbodyId);
    // το search εχει 5 στηλες, το recommendations 4 - το colspan πρεπει να καλυπτει ολο το πλατος
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

// ταξινομει τον πινακα οταν ο χρηστης πατησει καποιο header
function sortTable(column) {
    // αν πατησα την ιδια στηλη ξανα, αντιστρεφω asc/desc, αλλιως ξεκιναω με asc
    if (sortState.column === column) {
        sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
        sortState.column = column;
        sortState.direction = 'asc';
    }

    // η .sort() παιρνει compare function: επιστρεφει αρνητικο αν a πριν το b, θετικο αν μετα, 0 αν ισα
    currentMovies.sort((a, b) => {
        let valA = a[column];
        let valB = b[column];

        // ειδικη περιπτωση: το avgRating μπορει να ειναι 'N/A', τις βαζουμε στο τελος με -1
        if (column === 'avgRating') {
            valA = valA === 'N/A' ? -1 : parseFloat(valA);
            valB = valB === 'N/A' ? -1 : parseFloat(valB);
        }

        // κανουμε lowercase τα strings για να μην επηρεαζει η κεφαλαια (π.χ. "Action" vs "action")
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return sortState.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortState.direction === 'asc' ? 1 : -1;
        return 0;
    });

    // αν υπαρχει ενεργο genre filter, το εφαρμοζουμε και αυτο πριν κανουμε render
    const toRender = activeGenreFilter
        ? currentMovies.filter(m => m.genres.split('|').map(g => g.trim()).includes(activeGenreFilter))
        : currentMovies;
    renderTableRows(toRender);
}

// ── Section 1: Add Movie ───────────────────────────────────

document.getElementById('btn-add-movie').addEventListener('click', async () => {
    // διαβαζουμε τις τιμες απο τα inputs, το trim() αφαιρει κενα απο αρχη/τελος
    const title = document.getElementById('new-title').value.trim();
    const genres = document.getElementById('new-genres').value.trim();

    // validation πριν στειλουμε οτιδηποτε στον server
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
        // POST request με τα δεδομενα σε JSON format
        // το await σταματα μονο αυτη τη συναρτηση (οχι ολη τη σελιδα) μεχρι να ερθει η απαντηση
        const response = await fetch(`${API_BASE}/movies`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, genres })
        });
        const data = await response.json();

        if (data.status === 'success') {
            setFeedback('add-movie-feedback', `Movie added successfully! ID: ${data.movieId}`, true);
            // καθαριζουμε τα πεδια μετα την επιτυχια
            document.getElementById('new-title').value = '';
            document.getElementById('new-genres').value = '';
        } else {
            setFeedback('add-movie-feedback', 'Failed to add movie.', false);
        }
    } catch (error) {
        // μπαινουμε εδω αν το fetch αποτυχει εντελως (π.χ. ο server ειναι κλειστος)
        setFeedback('add-movie-feedback', 'Could not connect to server.', false);
    } finally {
        // το finally εκτελειται παντα (επιτυχια η αποτυχια) - ξανα-ενεργοποιουμε το κουμπι
        setLoading('btn-add-movie', false, 'Add Movie');
    }
});

// ── Section 2: Search Movies ───────────────────────────────

// stopPropagation: σταματα το event να "ανεβει" στα parent elements
// χρειαζεται γιατι υπαρχει document click listener παρακατω που κρυβει τα αποτελεσματα
document.getElementById('btn-search').addEventListener('click', (e) => {
    e.stopPropagation();
    performSearch();
});

// αν πατησει Enter μεσα στο input, εκτελει αμεσως το search
document.getElementById('search-input').addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') performSearch();
});

// debounce: καθε keystroke καθαριζει το timer και βαζει νεο 400ms
// αν σταματησεις να γραφεις για 400ms εκτελειται το search - αποτρεπει δεκαδες requests για καθε γραμμα
let searchDebounceTimer = null;
document.getElementById('search-input').addEventListener('input', (e) => {
    e.stopPropagation();
    clearTimeout(searchDebounceTimer);
    const val = e.target.value.trim();
    // αν σβηστηκε το κειμενο δεν κανουμε search
    if (!val) return;
    searchDebounceTimer = setTimeout(() => performSearch(), 400);
});

// κεντρικη συναρτηση αναζητησης - καλειται απο button, Enter, και live search
async function performSearch() {
    const keyword = document.getElementById('search-input').value.trim();

    if (!keyword) {
        setFeedback('search-feedback', 'Please enter a keyword.', false);
        return;
    }

    setLoading('btn-search', true, 'Search');
    try {
        // encodeURIComponent μετατρεπει ειδικους χαρακτηρες σε url-safe format
        // π.χ. "Star Wars" -> "Star%20Wars", χωρις αυτο το url θα ηταν ακυρο
        const response = await fetch(`${API_BASE}/movies?search=${encodeURIComponent(keyword)}`);
        const data = await response.json();

        // ελεγχος αν ο server απαντησε με success (server-side error)
        if (data.status !== 'success' || !data.movies) {
            setFeedback('search-feedback', 'Server error: ' + (data.detail || 'Invalid response'), false);
            return;
        }

        showTable('search-results');

        // επιτυχης αναζητηση αλλα μηδεν αποτελεσματα
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

// καλειται οταν ερθουν νεα αποτελεσματα - μηδενιζει το filter και κανει render
function renderSearchResults(movies) {
    activeGenreFilter = null;
    currentMovies = movies;
    renderGenreFilters();
    renderTableRows(currentMovies);
}

// δημιουργει δυναμικα τις γραμμες του πινακα αποτελεσματων
function renderTableRows(movies) {
    const tbody = document.getElementById('search-results-body');
    tbody.innerHTML = ''; // καθαριζουμε τον πινακα πριν βαλουμε νεα δεδομενα

    for (const movie of movies) {
        // αν δεν υπαρχει avgRating αφηνουμε κενο για τα αστερια
        const starsHtml = movie.avgRating !== 'N/A'
            ? ratingToStars(parseFloat(movie.avgRating))
            : '';
        // το badge εμφανιζει αριθμο + αστερια, η N/A αν δεν υπαρχουν ratings
        const avgBadge = movie.avgRating !== 'N/A'
            ? `<span class="avg-rating">${movie.avgRating}</span>${starsHtml}`
            : '<span style="color:#555;font-size:12px">N/A</span>';
        // τα genres αποθηκευονται ως "Action|Drama|Sci-Fi" - τα σπαμε με split και φτιαχνουμε spans
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

    // αρχικοποιει τα events στα αστερια αξιολογησης για καθε γραμμη
    initRatingWidgets();
}

// ── Genre filter chips ─────────────────────────────────────

// φτιαχνει τα κουμπακια genre filter πανω απο τον πινακα αποτελεσματων
function renderGenreFilters() {
    const bar = document.getElementById('genre-filters');
    // Set: αυτοματα αφαιρει διπλοτυπα - μαζευουμε ολα τα μοναδικα genres απο τα αποτελεσματα
    const genres = new Set();
    currentMovies.forEach(m => (m.genres || '').split('|').forEach(g => genres.add(g.trim())));

    bar.innerHTML = '';
    bar.classList.remove('hidden');

    // πρωτο chip: "All" - μηδενιζει το filter και εμφανιζει ολες τις ταινιες
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

    // ενα chip για καθε μοναδικο genre, αλφαβητικα ταξινομημενα
    [...genres].sort().forEach(genre => {
        const chip = document.createElement('button');
        chip.className = 'genre-chip' + (activeGenreFilter === genre ? ' active' : '');
        chip.textContent = genre;
        chip.addEventListener('click', (e) => {
            e.stopPropagation();
            activeGenreFilter = genre;
            // φιλτραρουμε τοπικα (χωρις νεο request) απο την currentMovies
            const filtered = currentMovies.filter(m =>
                (m.genres || '').split('|').map(g => g.trim()).includes(genre)
            );
            renderGenreFilters();
            renderTableRows(filtered);
        });
        bar.appendChild(chip);
    });
}

// χτιζει το HTML για το widget αξιολογησης (τα 5 αστερια) για μια ταινια
function buildRatingWidget(movieId, title) {
    // data-mid και data-title αποθηκευονται στο DOM για να τα διαβαζουμε αργοτερα στα events
    let html = `<div class="rating-widget" data-mid="${movieId}" data-title="${(title || '').replace(/"/g, '&quot;')}">`;
    for (let i = 1; i <= 5; i++) {
        // καθε αστερι χωριζεται σε δυο ζωνες: αριστερα (μισο αστερι) και δεξια (ολοκληρο)
        html += `<span class="rw-star" data-full="${i}" data-half="${i - 0.5}">` +
                `<span class="rw-l" data-val="${i - 0.5}"></span>` +
                `<span class="rw-r" data-val="${i}"></span>` +
                `★</span>`;
    }
    html += `</div>`;
    return html;
}

// χρωματιζει τα αστερια ενος widget αναλογα με την τιμη val
function highlightWidget(movieId, val) {
    const widget = document.querySelector(`.rating-widget[data-mid="${movieId}"]`);
    if (!widget) return;
    widget.querySelectorAll('.rw-star').forEach(star => {
        const full = parseFloat(star.dataset.full);
        const half = parseFloat(star.dataset.half);
        // καθαριζουμε πρωτα ολα τα classes και μετα βαζουμε το σωστο
        star.classList.remove('rw-full', 'rw-half');
        if (val >= full)      star.classList.add('rw-full');
        else if (val >= half) star.classList.add('rw-half');
    });
}

// αρχικοποιει τα mouse events για ολα τα rating widgets στη σελιδα
function initRatingWidgets() {
    document.querySelectorAll('.rating-widget').forEach(widget => {
        const movieId = parseInt(widget.dataset.mid);
        const title   = widget.dataset.title;

        // αν εχει ηδη βαθμολογηθει αυτη η ταινια, εμφανιζουμε την αποθηκευμενη βαθμολογια
        highlightWidget(movieId, sessionRatings[movieId] || 0);

        widget.querySelectorAll('.rw-l, .rw-r').forEach(zone => {
            // hover: εμφανιζει preview της βαθμολογιας
            zone.addEventListener('mouseenter', (e) => {
                e.stopPropagation();
                highlightWidget(movieId, parseFloat(zone.dataset.val));
            });

            // click: αποθηκευει οριστικα τη βαθμολογια στο sessionRatings
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

        // οταν φευγει το mouse, επαναφερει την αποθηκευμενη βαθμολογια (η 0 αν δεν εχει βαθμολογηθει)
        widget.addEventListener('mouseleave', (e) => {
            e.stopPropagation();
            highlightWidget(movieId, sessionRatings[movieId] || 0);
        });
    });
}


// ── Rated this session panel ───────────────────────────────

// ενημερωνει το panel κατω-αριστερα με τη λιστα ταινιων που εχουν βαθμολογηθει
function updateRatedPanel() {
    const body  = document.getElementById('rated-panel-body');
    const badge = document.getElementById('rated-panel-badge');
    // Object.entries μετατρεπει το object σε array [ [id, rating], ... ]
    const entries = Object.entries(sessionRatings);

    badge.textContent = entries.length;

    if (entries.length === 0) {
        body.innerHTML = '<p class="rated-panel-empty">No ratings yet.</p>';
        return;
    }

    // φτιαχνουμε html για καθε βαθμολογημενη ταινια και τα ενωνουμε με join
    body.innerHTML = entries.map(([id, rating]) => {
        const t = sessionRatingTitles[id] || `Movie #${id}`;
        return `<div class="rated-panel-item">
            <span class="rated-panel-title" title="${t}">${t}</span>
            <span class="rated-panel-score">${rating} ★</span>
        </div>`;
    }).join('');
}

// toggle: ανοιγει/κλεινει το panel με τις βαθμολογιες
document.getElementById('rated-panel-toggle').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('rated-panel-body').classList.toggle('hidden');
});

// global click listener: κλεινει panels/αποτελεσματα οταν ο χρηστης κανει κλικ εξω τους
document.addEventListener('click', (e) => {
    // κλεισιμο rated panel
    const panel = document.getElementById('rated-panel');
    if (!panel.contains(e.target)) {
        document.getElementById('rated-panel-body').classList.add('hidden');
    }

    // κρυβει τα search αποτελεσματα αν κανεις κλικ εξω απο το search section
    const searchSection = document.getElementById('section-search');
    if (!searchSection.contains(e.target)) {
        document.getElementById('search-results-wrap').classList.add('hidden');
        document.getElementById('genre-filters').classList.add('hidden');
    }

    // κρυβει τα recommendations αν κανεις κλικ εξω απο το section
    const recoSection = document.getElementById('section-recommendations');
    if (!recoSection.contains(e.target)) {
        document.getElementById('recommendations-results-wrap').classList.add('hidden');
    }
});

// ── Section 3: Recommendations ─────────────────────────────

document.getElementById('btn-recommendations').addEventListener('click', async () => {
    // δεν μπορουμε να παρουμε recommendations αν δεν εχουμε βαθμολογησει καμια ταινια
    if (Object.keys(sessionRatings).length === 0) {
        setFeedback('recommendations-feedback', 'Please rate at least one movie first.', false);
        return;
    }

    // μετατρεπουμε το sessionRatings object σε array αντικειμενων για να το στειλουμε στον server
    const ratings = Object.entries(sessionRatings).map(([movieId, rating]) => ({
        movieId: parseInt(movieId),
        rating: rating
    }));

    setLoading('btn-recommendations', true, 'Get Recommendations');
    try {
        // POST request με τις βαθμολογιες - ο server υπολογιζει τις προβλεψεις
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

// δημιουργει τις γραμμες του πινακα recommendations
function renderRecommendations(recommendations) {
    const tbody = document.getElementById('recommendations-body');
    tbody.innerHTML = '';

    recommendations.forEach(movie => {
        // ιδιο με τον search πινακα - σπαμε τα genres με | και φτιαχνουμε spans
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
