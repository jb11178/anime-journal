import os
import shutil
import sqlite3
from pathlib import Path

if os.environ.get("APP_ENV") != "production":
    raise RuntimeError("This migration must only run in production.")

if os.environ.get("DATA_DIR") != "/data":
    raise RuntimeError("Expected DATA_DIR=/data.")

DATA_DIR = Path("/data")

STAGING_DIR = DATA_DIR / "migration-staging"
SOURCE_DB = STAGING_DIR / "database.db"
TARGET_DB = DATA_DIR / "database.db"

SOURCE_UPLOADS = STAGING_DIR / "uploads"
TARGET_UPLOADS = DATA_DIR / "uploads"

MARKER = DATA_DIR / ".migration-complete"


def main():
    if MARKER.exists():
        print("Migration already completed. Skipping.")
        return

    if not SOURCE_DB.is_file():
        raise RuntimeError("Staged database not found.")

    if not SOURCE_UPLOADS.is_dir():
        raise RuntimeError("Staged uploads directory not found.")

    with sqlite3.connect(SOURCE_DB) as db:
        result = db.execute("PRAGMA integrity_check").fetchone()[0]

    if result != "ok":
        raise RuntimeError(f"Database integrity check failed: {result}")

    print("Staged database integrity verified.")

    # Copy images without removing the staged originals.
    shutil.copytree(
        SOURCE_UPLOADS,
        TARGET_UPLOADS,
        dirs_exist_ok=True
    )

    # Copy the database to a temporary file first, then replace it.
    temporary_db = DATA_DIR / "database.migration-tmp"
    shutil.copy2(SOURCE_DB, temporary_db)
    os.replace(temporary_db, TARGET_DB)

    MARKER.write_text("Migration completed successfully.\n")

    print("Migration completed successfully.")


if __name__ == "__main__":
    main()