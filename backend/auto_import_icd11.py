# backend/auto_import_icd11.py
import os
import time
from import_icd11 import main as import_icd11_main

def should_run_import():
    flag_file = "/tmp/icd_import_done"
    if os.path.exists(flag_file):
        return False
    return True

def mark_done():
    with open("/tmp/icd_import_done", "w") as f:
        f.write(str(time.time()))

def run_auto_import():
    print("🔁 Checking ICD-11 import state...")
    if not should_run_import():
        print("✅ ICD-11 data already imported this build.")
        return
    try:
        print("⏳ Starting ICD-11 import process...")
        import_icd11_main()
        mark_done()
        print("🎉 ICD-11 import complete and cached.")
    except Exception as e:
        print(f"⚠️ ICD-11 import failed: {e}")

if __name__ == "__main__":
    run_auto_import()
