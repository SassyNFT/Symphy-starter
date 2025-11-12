# backend/main.py
# Purpose: Run ICD-11 auto-import into PostgreSQL once on startup.

import os
import time
from auto_import_icd11 import run_auto_import

def main():
    print("🌍 Starting ICD-11 auto-import...")
    run_auto_import()
    print("✅ Import complete.")

    # Optional keep-alive so Render doesn't stop the worker (set KEEP_RUNNING=1 in env)
    if os.getenv("KEEP_RUNNING", "0") == "1":
        print("🕒 Keeping worker alive for monitoring...")
        while True:
            time.sleep(3600)  # Sleep 1 hour

if __name__ == "__main__":
    main()
