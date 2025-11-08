# Symphy-starter/backend/main.py
# Purpose: run DB init and ICD-11 import on startup and keep a tiny server alive.

import os
import threading
import traceback
from fastapi import FastAPI

app = FastAPI(title="Symphy Starter Worker")

def _do_import():
    try:
        # 1) Try DB init first (safe if it already exists)
        try:
            print("🔧 Running database_init.init_db() ...")
            from database_init import init_db
            init_db()
            print("✅ Database init complete.")
        except Exception as e:
            print(f"⚠️ database_init.init_db skipped/failed: {e}")

        # 2) Run the ICD-11 importer
        print("📦 Importing ICD-11 via auto_import_icd11.run_auto_import() ...")
        from auto_import_icd11 import run_auto_import
        run_auto_import()
        print("✅ ICD-11 import finished.")
    except Exception as e:
        print("❌ ICD-11 import failed:")
        print(e)
        print(traceback.format_exc())

@app.on_event("startup")
def _startup():
    run_flag = os.getenv("RUN_AUTO_IMPORT", "true").lower() == "true"
    if run_flag:
        print("🚀 Launching ICD-11 import thread...")
        threading.Thread(target=_do_import, daemon=True).start()
    else:
        print("⏭️ RUN_AUTO_IMPORT is false — skipping import.")

@app.get("/")
def health():
    return {
        "status": "ICD-11 importer running",
        "RUN_AUTO_IMPORT": os.getenv("RUN_AUTO_IMPORT", "true")
    }
