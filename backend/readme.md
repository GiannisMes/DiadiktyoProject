# MovieLens Web Application

A web application for exploring the MovieLens Latest Small dataset, rating movies, and getting personalized recommendations.

## Prerequisites

- Python 3.8+
- pip

## Project Structure

```
DiadiktyoProject/
├── frontend/
│   ├── index.html
│   ├── index.js
│   └── index.css
└── backend/
    ├── main.py
    ├── init_db.py
    ├── requirements.txt
    └── README.md
```

## Setup & Installation

### 1. Navigate to the backend directory

```bash
cd backend
```

### 2. Create and activate a virtual environment

```bash
# Create
python -m venv venv

# Activate (Windows)
venv\Scripts\activate

# Activate (Mac/Linux)
source venv/bin/activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Initialize the database

```bash
python init_db.py
```

This script will:
- Download the MovieLens Latest Small dataset automatically
- Extract the zip file
- Create the SQLite database (movielens.db)
- Populate the movies, ratings, and tags tables

### 5. Run the backend server

```bash
uvicorn main:app --reload --port 3000
```

The server will start at: `http://localhost:3000`

API documentation available at: `http://localhost:3000/docs`

## API Endpoints

Base URL: `http://localhost:3000/movielens/api`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /movies?search={keyword} | Search movies by title (case-insensitive) |
| GET | /ratings/{movieId} | Get all ratings for a specific movie |
| POST | /movies | Add a new movie to the database |
| POST | /recommendations | Get personalized movie recommendations |

### Example Requests

**Search Movies**
```
GET /movielens/api/movies?search=matrix
```

**Get Ratings**
```
GET /movielens/api/ratings/2571
```

**Add Movie**
```json
POST /movielens/api/movies
{
    "title": "Dune: Part Two",
    "genres": "Sci-Fi|Adventure"
}
```

**Get Recommendations**
```json
POST /movielens/api/recommendations
{
    "ratings": [
        { "movieId": 1,  "rating": 5.0 },
        { "movieId": 32, "rating": 4.0 },
        { "movieId": 50, "rating": 4.5 }
    ]
}
```

## Recommendation Algorithm

The recommendations are based on **User-Based Collaborative Filtering** with Pearson Correlation:

1. Identify users who have rated 2+ movies in common with the current user
2. Compute Pearson similarity between the current user and each neighbor
3. Select the Top-K most similar users (K=10)
4. For each unseen candidate movie, predict the rating:
   - predicted = user_mean + weighted_average(neighbor deviations from their mean)
   - Predicted ratings are clamped to the valid range [0.5, 5.0]
5. Return the Top-N movies with the highest predicted ratings (N=10)

Note: Ratings provided in the recommendation request are used only for that request and are not stored in the database.

## Running the Frontend

Open `frontend/index.html` directly in a browser — no server needed.

Make sure the backend server is running at `http://localhost:3000` before using the application.

## Frontend Features

- Search movies by keyword with scrollable results table
- View average rating with star display for each movie
- Interactive star rating widget (half-star precision, 0.5–5.0) — no dropdown needed
- Genre filter chips to narrow search results client-side without a new request
- Sort search results by ID, Title, or Average Rating
- "Rated this session" collapsible panel showing all rated movies and scores
- Toast notifications for all user actions (search, rating, add movie, recommendations)
- Get personalized movie recommendations based on session ratings
- Add new movies to the database
- Click outside a section to collapse its results

## Dataset

MovieLens Latest Small dataset by GroupLens Research:
- ~9,000 movies
- ~100,000 ratings
- ~600 users

Source: https://grouplens.org/datasets/movielens/latest/