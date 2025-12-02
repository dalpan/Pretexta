#!/usr/bin/env python3
"""
Script untuk menghapus (drop) koleksi-koleksi utama di MongoDB.
Digunakan untuk membersihkan data aplikasi sebelum menjalankan seeding baru.
"""
import os
import sys
import asyncio
from pathlib import Path
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

# Tambahkan direktori induk ke path untuk memastikan impor berfungsi
sys.path.insert(0, str(Path(__file__).parent.parent))

# Muat variabel lingkungan dari file .env
load_dotenv()

# Daftar koleksi yang akan dihapus
COLLECTIONS_TO_DROP = [
    "challenges",
    "quizzes",
    "simulations"
]

async def drop_collections():
    """Menghubungkan ke MongoDB dan menghapus koleksi yang ditentukan."""
    try:
        # Dapatkan variabel lingkungan yang diperlukan
        mongo_url = os.environ.get('MONGO_URL')
        db_name = os.environ.get('DB_NAME')
        
        if not mongo_url or not db_name:
            print("❌ Error: MONGO_URL atau DB_NAME tidak ditemukan di environment variables.")
            sys.exit(1)

        print(f"🔗 Menghubungkan ke MongoDB di: {mongo_url}")
        client = AsyncIOMotorClient(mongo_url)
        db = client[db_name]
        
        print(f"🗑️ Memulai penghapusan koleksi dari database '{db_name}'...")

        success_count = 0
        for collection_name in COLLECTIONS_TO_DROP:
            # Periksa apakah koleksi ada sebelum mencoba menghapusnya
            collection_names = await db.list_collection_names()
            if collection_name in collection_names:
                await db[collection_name].drop()
                print(f"✅ Koleksi '{collection_name}' berhasil dihapus.")
                success_count += 1
            else:
                print(f"➡️ Koleksi '{collection_name}' tidak ditemukan, dilewati.")
                
        print(f"\n✨ Selesai. Total {success_count}/{len(COLLECTIONS_TO_DROP)} koleksi utama telah dihapus.")
        
        client.close()
        
    except Exception as e:
        print(f"❌ Terjadi kesalahan fatal selama operasi MongoDB: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(drop_collections())