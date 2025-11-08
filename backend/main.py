# backend/main.py
# Purpose: Run ICD-11 auto-import into PostgreSQL once on startup.

import os
import time
from database_init import init_database
from auto_import_icd11 import run_auto_import

def main():
    print("🔗 Connecting to database...")
    init_database()

    print("🌍 Starting ICD-11 auto-import...")
    run_auto_import()
    print("✅ Import complete.")

    # optional keep-alive so Render doesn't stop the worker
    if os.getenv("KEEP_RUNNING", "false").lower() == "true":
        print("🕒 Keeping worker alive for monitoring...")
        while True:
            time.sleep(3600)

if __name__ == "__main__":
    main()
