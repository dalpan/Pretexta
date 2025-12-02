#!/usr/bin/env python3
"""
Import YAML challenges and quizzes into MongoDB
"""
import sys
import os
import yaml
import asyncio
from pathlib import Path
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone
import uuid

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

# Load environment
load_dotenv()

async def import_yaml_file(file_path: Path, db):
    """Import a single YAML file"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f)
        
        yaml_type = data.get('type')
        
        if not yaml_type:
            print(f"❌ {file_path.name}: No 'type' field")
            return False
        
        # Add ID and timestamp
        data['id'] = str(uuid.uuid4())
        data['created_at'] = datetime.now(timezone.utc).isoformat()
        
        if yaml_type == 'challenge':
            await db.challenges.insert_one(data)
            print(f"✅ Challenge: {data.get('title', 'Unknown')}")
            return True
        
        elif yaml_type == 'quiz':
            await db.quizzes.insert_one(data)
            print(f"✅ Quiz: {data.get('title', 'Unknown')}")
            return True
        
        else:
            print(f"❌ {file_path.name}: Unknown type '{yaml_type}'")
            return False
    
    except Exception as e:
        print(f"❌ {file_path.name}: {str(e)}")
        return False

async def main():
    # Connect to MongoDB
    mongo_url = os.environ['MONGO_URL']
    db_name = os.environ['DB_NAME']
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    # Get YAML directory
    if len(sys.argv) > 1:
        yaml_dir = Path(sys.argv[1])
    else:
        yaml_dir = Path(__file__).parent.parent.parent / 'data' / 'sample'
    
    if not yaml_dir.exists():
        print(f"❌ Directory not found: {yaml_dir}")
        sys.exit(1)
    
    # Find all YAML files
    yaml_files = list(yaml_dir.glob('*.yaml')) + list(yaml_dir.glob('*.yml'))
    
    if not yaml_files:
        print(f"❌ No YAML files found in {yaml_dir}")
        sys.exit(1)
    
    print(f"\n🔍 Found {len(yaml_files)} YAML files\n")
    
    # Import each file
    success_count = 0
    for yaml_file in sorted(yaml_files):
        if await import_yaml_file(yaml_file, db):
            success_count += 1
    
    print(f"\n✅ Imported {success_count}/{len(yaml_files)} files\n")
    
    # Show stats
    challenge_count = await db.challenges.count_documents({})
    quiz_count = await db.quizzes.count_documents({})
    
    print(f"📊 Database stats:")
    print(f"   Challenges: {challenge_count}")
    print(f"   Quizzes: {quiz_count}")
    
    client.close()

if __name__ == '__main__':
    asyncio.run(main())
