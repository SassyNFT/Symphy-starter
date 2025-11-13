# backend/app.py
# Purpose: Start the FastAPI server AND ensure the database is initialized on first boot

from api_server import app  # This loads your FastAPI routes
from database_init import init_database
import os

# Run only once per deploy (safe, non-destructive)
if os.getenv("RUN_INIT_DB", "true") == "true":
    print("🛠️ Initializing database schema (non-destructive)...")
    init_database()
    print("✅ Database schema ready.")

# This file simply exposes "app" for Uvicorn
# Render will run: python app.py
