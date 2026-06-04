import sqlite3
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List

# δημιουργουμε το FastAPI app - αυτο ειναι ο web server μας
app = FastAPI()

# CORS middleware: επιτρεπει στο frontend (αλλο origin) να επικοινωνει με τον server
# χωρις αυτο ο browser θα μπλοκαρε τα requests λογω same-origin policy
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ανοιγει συνδεση με την sqlite βαση δεδομενων και την επιστρεφει
def get_db():
    conn = sqlite3.connect("movielens.db")
    # row_factory: κανει τα αποτελεσματα να επιστρεφονται σαν dictionaries αντι για tuples
    conn.row_factory = sqlite3.Row
    return conn

# ── Endpoint 1: Search movies ──────────────────────────────

# GET /movielens/api/movies?search=... - αναζητα ταινιες βασει τιτλου
@app.get("/movielens/api/movies")
def search_movies(search: str = ""):
    try:
        conn = get_db()
        cursor = conn.cursor()
        # LEFT JOIN με ratings για να παρουμε και το μεσο ορο αξιολογησης
        # LEFT JOIN = παιρνουμε ολες τις ταινιες, ακομα και αν δεν εχουν ratings
        # LIKE με % = αναζητηση οπουδηποτε στον τιτλο (π.χ. %matrix% βρισκει "The Matrix")
        # LOWER = case-insensitive αναζητηση
        cursor.execute("""
            SELECT
                m.movieId,
                m.title,
                m.genres,
                ROUND(AVG(r.rating), 2) AS avgRating
            FROM
                movies AS m
            LEFT JOIN
                ratings AS r ON m.movieId = r.movieId
            WHERE
                LOWER(m.title) LIKE LOWER(?)
            GROUP BY
                m.movieId, m.title, m.genres
            ORDER BY
                m.movieId
            """,
            (f"%{search}%",)
        )
        movies_raw = cursor.fetchall()
        movies = []
        for row in movies_raw:
            movie_dict = dict(row)
            # ασφαλης ανακτηση avgRating - διαφορετικα sqlite drivers επιστρεφουν
            # το column name με διαφορετικη πεζοκεφαλαια
            avg = movie_dict.get('avgRating', movie_dict.get('avgrating'))
            # αν δεν υπαρχουν ratings για αυτη την ταινια το AVG επιστρεφει None -> το κανουμε 'N/A'
            movie_dict['avgRating'] = 'N/A' if avg is None else avg

            movies.append(movie_dict)
        conn.close()
        return {"status": "success", "movies": movies}
    except Exception as e:
        # HTTPException με status 500 = Internal Server Error
        raise HTTPException(status_code=500, detail=str(e))

# ── Endpoint 2: Get ratings for a movie ───────────────────

# GET /movielens/api/ratings/{movieId} - επιστρεφει ολα τα ratings μιας ταινιας
@app.get("/movielens/api/ratings/{movieId}")
def get_ratings(movieId: int):
    try:
        conn = get_db()
        cursor = conn.cursor()

        # ελεγχουμε αν η ταινια υπαρχει πριν ψαξουμε ratings
        cursor.execute("SELECT * FROM movies WHERE movieId = ?", (movieId,))
        if cursor.fetchone() is None:
            raise HTTPException(status_code=404, detail="Movie not found")

        cursor.execute("SELECT * FROM ratings WHERE movieId = ?", (movieId,))
        ratings = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return {"status": "success", "ratings": ratings}
    except HTTPException:
        # ξανα-πεταμε το HTTPException ωστε να μην το πιασει το παρακατω except
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Endpoint 3: Add a new movie ────────────────────────────

# Pydantic model: ορισμος της δομης του request body για το POST
# το FastAPI χρησιμοποιει αυτο για validation αυτοματα
class MovieRequest(BaseModel):
    title: str
    genres: str

# POST /movielens/api/movies - προσθετει νεα ταινια στη βαση
@app.post("/movielens/api/movies")
def add_movie(movie: MovieRequest):
    try:
        conn = get_db()
        cursor = conn.cursor()

        # validation: δεν επιτρεπουμε κενο τιτλο
        if not movie.title.strip():
            raise HTTPException(status_code=400, detail="Title cannot be empty")

        # βρισκουμε το μεγαλυτερο υπαρχον ID και παιρνουμε το επομενο
        cursor.execute("SELECT MAX(movieId) FROM movies")
        max_id = cursor.fetchone()[0]
        new_id = max_id + 1

        cursor.execute(
            "INSERT INTO movies VALUES (?, ?, ?)",
            (new_id, movie.title, movie.genres)
        )
        # commit: αποθηκευει οριστικα την αλλαγη στη βαση
        conn.commit()
        conn.close()
        return {"status": "success", "movieId": new_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Endpoint 4: Recommendations ────────────────────────────

# models για το recommendation request
class RatingInput(BaseModel):
    movieId: int
    rating: float

class RecommendationRequest(BaseModel):
    # λιστα απο RatingInput objects - ολες οι βαθμολογιες του χρηστη
    ratings: List[RatingInput]

# POST /movielens/api/recommendations - collaborative filtering με Pearson similarity
@app.post("/movielens/api/recommendations")
def get_recommendations(request: RecommendationRequest):
    try:
        K = 10  # παιρνουμε τους K πιο παρομοιους χρηστες
        N = 10  # επιστρεφουμε τις N καλυτερες προτασεις

        conn = get_db()
        cursor = conn.cursor()

        # μετατρεπουμε τη λιστα σε dictionary { movieId: rating } για ευκολη αναζητηση
        user_ratings = {r.movieId: r.rating for r in request.ratings}
        # μεσος ορος βαθμολογιων του τρεχοντα χρηστη - χρειαζεται για τον τυπο Pearson
        user_mean = sum(user_ratings.values()) / len(user_ratings)
        user_movies = set(user_ratings.keys())

        # βρισκουμε χρηστες που εχουν βαθμολογησει τουλαχιστον 2 κοινες ταινιες
        # placeholders: φτιαχνουμε δυναμικα ? για καθε movieId (ασφαλης τροπος για SQL IN clause)
        placeholders = ",".join("?" * len(user_movies))
        cursor.execute(f"""
            SELECT DISTINCT userId FROM ratings
            WHERE movieId IN ({placeholders})
            GROUP BY userId
            HAVING COUNT(DISTINCT movieId) >= 2
        """, list(user_movies))
        neighbor_ids = [row["userId"] for row in cursor.fetchall()]

        # υπολογισμος Pearson συσχετισης για καθε υποψηφιο γειτονα
        similarities = {}
        for vid in neighbor_ids:
            # παιρνουμε ολες τις βαθμολογιες του γειτονα
            cursor.execute(
                "SELECT movieId, rating FROM ratings WHERE userId = ?", (vid,)
            )
            v_ratings = {row["movieId"]: row["rating"] for row in cursor.fetchall()}

            # κοινες ταινιες μεταξυ χρηστη και γειτονα (set intersection με &)
            common = user_movies & set(v_ratings.keys())
            # βαθμολογιες για τις κοινες ταινιες
            u_vals = [user_ratings[m] for m in common]
            v_vals = [v_ratings[m] for m in common]
            u_mean = sum(u_vals) / len(u_vals)
            v_mean = sum(v_vals) / len(v_vals)

            # τυπος Pearson: μετραει ποσο παρομοια βαθμολογουν δυο χρηστες
            # αριθμητης: συμπαρεκκλιση, παρονομαστης: κανονικοποιηση
            numerator = sum((u - u_mean) * (v - v_mean) for u, v in zip(u_vals, v_vals))
            denom_u = sum((u - u_mean) ** 2 for u in u_vals) ** 0.5
            denom_v = sum((v - v_mean) ** 2 for v in v_vals) ** 0.5

            # αν ο παρονομαστης ειναι 0 δεν μπορουμε να διαιρεσουμε - παραλειπουμε τον γειτονα
            if denom_u == 0 or denom_v == 0:
                continue

            sim = numerator / (denom_u * denom_v)
            # κραταμε μονο θετικες ομοιοτητες (αρνητικη = αντιθετες προτιμησεις)
            if sim > 0:
               v_global_mean = sum(v_ratings.values()) / len(v_ratings)
               similarities[vid] = (sim, v_ratings, v_global_mean)

        # κρατουμε τους K πιο παρομοιους χρηστες (sorted by similarity descending)
        top_k = sorted(similarities.items(), key=lambda x: x[1][0], reverse=True)[:K]

        if not top_k:
            return {"status": "success", "recommendations": []}

        # μαζευουμε ταινιες που εχουν δει οι γειτονες αλλα οχι ο τρεχων χρηστης
        candidate_movies = set()
        for _, (sim, v_ratings, _) in top_k:
            candidate_movies.update(set(v_ratings.keys()) - user_movies)

        # προβλεπουμε βαθμολογια για καθε candidate ταινια
        predictions = []
        for movie_id in candidate_movies:
            numerator = 0
            denominator = 0
            for _, (sim, v_ratings, v_mean) in top_k:
                if movie_id in v_ratings:
                    # σταθμισμενος μεσος ορος: πιο παρομοιοι χρηστες εχουν μεγαλυτερη επιρροη
                    numerator += sim * (v_ratings[movie_id] - v_mean)
                    denominator += abs(sim)

            if denominator == 0:
                continue

            predicted = user_mean + (numerator / denominator)
            # clamp: κρατουμε την προβλεψη εντος της κλιμακας 0.5 - 5.0
            predicted = max(0.5, min(5.0, predicted))
            predictions.append((movie_id, predicted))

        # ταξινομουμε με βαση την προβλεπομενη βαθμολογια και παιρνουμε τις N καλυτερες
        predictions.sort(key=lambda x: x[1], reverse=True)
        top_n = predictions[:N]

        # παιρνουμε τα στοιχεια (τιτλος, genres) για τις προτεινομενες ταινιες απο τη βαση
        recommendations = []
        for movie_id, predicted in top_n:
            cursor.execute("SELECT * FROM movies WHERE movieId = ?", (movie_id,))
            movie = cursor.fetchone()
            if movie:
                recommendations.append({
                    "movieId": movie_id,
                    "title": movie["title"],
                    "genres": movie["genres"],
                    "predictedRating": round(predicted, 2)
                })

        conn.close()
        return {"status": "success", "recommendations": recommendations}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
