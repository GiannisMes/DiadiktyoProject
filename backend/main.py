import sqlite3
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List

app = FastAPI()

# Allow requests from the frontend (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    # Connect to the database and return connection
    conn = sqlite3.connect("movielens.db")
    conn.row_factory = sqlite3.Row
    return conn

# ── Endpoint 1: Search movies ──────────────────────────────
@app.get("/movielens/api/movies")
def search_movies(search: str = ""):
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM movies WHERE LOWER(title) LIKE LOWER(?)",
            (f"%{search}%",)
        )
        movies = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return {"status": "success", "movies": movies}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) #server error 

# ── Endpoint 2: Get ratings for a movie ───────────────────
@app.get("/movielens/api/ratings/{movieId}")
def get_ratings(movieId: int):
    try:
        conn = get_db()
        cursor = conn.cursor()

        # Check if movie exists first
        cursor.execute("SELECT * FROM movies WHERE movieId = ?", (movieId,))
        if cursor.fetchone() is None:
            raise HTTPException(status_code=404, detail="Movie not found")

        cursor.execute("SELECT * FROM ratings WHERE movieId = ?", (movieId,))
        ratings = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return {"status": "success", "ratings": ratings}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) #server error 

# ── Endpoint 3: Add a new movie ────────────────────────────
class MovieRequest(BaseModel):
    title: str
    genres: str

@app.post("/movielens/api/movies")
def add_movie(movie: MovieRequest):
    try:
        conn = get_db()
        cursor = conn.cursor()

        # Validate that title is not empty
        if not movie.title.strip():
            raise HTTPException(status_code=400, detail="Title cannot be empty") #bad request`

        # Get the next available ID
        cursor.execute("SELECT MAX(movieId) FROM movies")
        max_id = cursor.fetchone()[0]
        new_id = max_id + 1

        cursor.execute(
            "INSERT INTO movies VALUES (?, ?, ?)",
            (new_id, movie.title, movie.genres)
        )
        conn.commit()
        conn.close()
        return {"status": "success", "movieId": new_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) #server error
    
class RatingInput(BaseModel):
    movieId: int
    rating: float

class RecommendationRequest(BaseModel):
    ratings: List[RatingInput]  #list of RatingInput objects

@app.post("/movielens/api/recommendations")
def get_recommendations(request: RecommendationRequest):
    try:
        K = 10  # top-K similar users
        N = 10  # top-N recommendations

        conn = get_db()
        cursor = conn.cursor()

        # The user's ratings from the request
        user_ratings = {r.movieId: r.rating for r in request.ratings}
        user_mean = sum(user_ratings.values()) / len(user_ratings)
        user_movies = set(user_ratings.keys())

        # Find all users who rated at least two common movies
        placeholders = ",".join("?" * len(user_movies))
        cursor.execute(f"""
            SELECT DISTINCT userId FROM ratings
            WHERE movieId IN ({placeholders})
            GROUP BY userId
            HAVING COUNT(DISTINCT movieId) >= 2
        """, list(user_movies))
        neighbor_ids = [row["userId"] for row in cursor.fetchall()]

        # Compute Pearson similarity for each neighbor
        similarities = {}
        for vid in neighbor_ids:
            cursor.execute(
                "SELECT movieId, rating FROM ratings WHERE userId = ?", (vid,) #gets all the movies which the neighbor user has rated
            )
            v_ratings = {row["movieId"]: row["rating"] for row in cursor.fetchall()}

            # Find common movies
            common = user_movies & set(v_ratings.keys())
            # Pearson correlation on common movies
            u_vals = [user_ratings[m] for m in common] #gets the ratings of the current user for the common movies
            v_vals = [v_ratings[m] for m in common] #get the ratings of the neighbor user for the common movies
            u_mean = sum(u_vals) / len(u_vals)
            v_mean = sum(v_vals) / len(v_vals)

            numerator = sum((u - u_mean) * (v - v_mean) for u, v in zip(u_vals, v_vals))
            denom_u = sum((u - u_mean) ** 2 for u in u_vals) ** 0.5
            denom_v = sum((v - v_mean) ** 2 for v in v_vals) ** 0.5

            if denom_u == 0 or denom_v == 0:
                continue

            sim = numerator / (denom_u * denom_v)
            if sim > 0:
               v_global_mean = sum(v_ratings.values()) / len(v_ratings)
               similarities[vid] = (sim, v_ratings, v_global_mean)

        # Keep top-K similar users
        top_k = sorted(similarities.items(), key=lambda x: x[1][0], reverse=True)[:K]

        if not top_k:
            return {"status": "success", "recommendations": []}

        # Predict ratings for unseen movies
        candidate_movies = set()
        for _, (sim, v_ratings, _) in top_k:
            candidate_movies.update(set(v_ratings.keys()) - user_movies) #movies rated by the neighbors but not by the current user

        predictions = []
        for movie_id in candidate_movies:
            numerator = 0
            denominator = 0
            for _, (sim, v_ratings, v_mean) in top_k:
                if movie_id in v_ratings:
                    numerator += sim * (v_ratings[movie_id] - v_mean)
                    denominator += abs(sim)

            if denominator == 0:
                continue

            predicted = user_mean + (numerator / denominator)
            # clamp στο 0.5 - 5.0
            predicted = max(0.5, min(5.0, predicted))
            predictions.append((movie_id, predicted))

        # Sort by predicted rating and take top-N
        predictions.sort(key=lambda x: x[1], reverse=True)
        top_n = predictions[:N]

        # Fetch movie details for recommendations
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
