import urllib.request
import zipfile
import csv
import sqlite3
import os

print("Step 1: Downloading dataset...")
url = "https://files.grouplens.org/datasets/movielens/ml-latest-small.zip"
urllib.request.urlretrieve(url, "ml-latest-small.zip")
print("Download complete!")

print("Step 2: Extracting zip...")
with zipfile.ZipFile("ml-latest-small.zip", "r") as z:
    z.extractall(".")
print("Extraction complete!")

print("Step 3: Creating database...")
conn = sqlite3.connect("movielens.db")
cursor = conn.cursor()

# Create tables matching the CSV structure from the dataset
cursor.executescript("""
    DROP TABLE IF EXISTS movies;
    DROP TABLE IF EXISTS ratings;
    DROP TABLE IF EXISTS tags;

    CREATE TABLE movies (
        movieId INTEGER PRIMARY KEY,
        title   TEXT NOT NULL,
        genres  TEXT
    );

    CREATE TABLE ratings (
        userId    INTEGER,
        movieId   INTEGER,
        rating    REAL,
        timestamp INTEGER
    );

    CREATE TABLE tags (
        userId    INTEGER,
        movieId   INTEGER,
        tag       TEXT,
        timestamp INTEGER
    );
""")
print("Tables created!")

# Load each CSV file into its corresponding table
print(" Loading movies...")
with open("ml-latest-small/movies.csv", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    rows = [(r["movieId"], r["title"], r["genres"]) for r in reader]
cursor.executemany("INSERT INTO movies VALUES (?,?,?)", rows)
print(f"  -> {len(rows)} movies loaded")

print(" Loading ratings...")
with open("ml-latest-small/ratings.csv", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    rows = [(r["userId"], r["movieId"], r["rating"], r["timestamp"]) for r in reader]
cursor.executemany("INSERT INTO ratings VALUES (?,?,?,?)", rows)
print(f"  -> {len(rows)} ratings loaded")

print(" Loading tags...")
with open("ml-latest-small/tags.csv", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    rows = [(r["userId"], r["movieId"], r["tag"], r["timestamp"]) for r in reader]
cursor.executemany("INSERT INTO tags VALUES (?,?,?,?)", rows)
print(f"  -> {len(rows)} tags loaded")

# Save all changes and close the connection
conn.commit()
conn.close()
print("\nDone! Database movielens.db created successfully.")