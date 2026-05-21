import asyncio
import datetime as dt
import os
import sys
import uuid
from datetime import datetime
from pathlib import Path

import yaml
from motor.motor_asyncio import AsyncIOMotorClient


async def import_yaml_file(file_path: Path, db):
    try:
        with open(file_path, encoding="utf-8") as f:
            data = yaml.safe_load(f)

        yaml_type = data.get("type")
        if not yaml_type:
            print(f"[ERROR] {file_path.name}: No 'type' field")
            return False

        # Add ID if not present (or overwrite to ensure
        # uniqueness if needed, but keeping existing ID is
        # better if simulating updates)
        # For now, just generate new ID to be safe
        data["id"] = str(uuid.uuid4())
        data["created_at"] = datetime.now(dt.UTC).isoformat()

        if yaml_type == "challenge":
            await db.challenges.insert_one(data)
            print(f"[OK] Challenge: {data.get('title', 'Unknown')}")
            return True
        elif yaml_type == "quiz":
            await db.quizzes.insert_one(data)
            print(f"[OK] Quiz: {data.get('title', 'Unknown')}")
            return True
        else:
            print(f"[SKIP] {file_path.name}: Unknown type '{yaml_type}'")
            return False
    except Exception as e:
        print(f"[ERROR] {file_path.name}: {str(e)}")
        return False


async def main():
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "Pretexta")

    print(f"Connecting to {mongo_url}/{db_name}...")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    # Target directory: relative to this script in backend/scripts -> ../../data/professionals
    # Script is in backend/scripts
    base_dir = Path(__file__).parent.parent.parent
    yaml_dir = base_dir / "data" / "professionals"

    if not yaml_dir.exists():
        print(f"Directory not found: {yaml_dir}")
        return

    files = list(yaml_dir.glob("**/*.yaml"))
    print(f"Found {len(files)} YAML files.")

    count = 0
    for f in files:
        if await import_yaml_file(f, db):
            count += 1

    print(f"Imported {count} files.")
    client.close()


if __name__ == "__main__":
    # Force utf-8 output for windows
    sys.stdout.reconfigure(encoding="utf-8")
    asyncio.run(main())
