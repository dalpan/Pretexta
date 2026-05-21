import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path

import yaml
from fastapi import APIRouter, FastAPI
from starlette.middleware.cors import CORSMiddleware

from middleware.rate_limit import RateLimitMiddleware
from models.schemas import User
from routes import (
    adaptive_router,
    glossary_router,
    analytics_router,
    assignments_router,
    auth_router,
    campaigns_router,
    certificates_router,
    challenges_router,
    debrief_router,
    imports_router,
    instructor_router,
    leaderboard_router,
    llm_router,
    notifications_router,
    organizations_router,
    personas_router,
    quizzes_router,
    reports_router,
    risk_profile_router,
    scenario_builder_router,
    settings_router,
    simulations_router,
    webhooks_router,
)
from services.auth import hash_password
from services.database import db

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


async def _seed_glossary():
    """Seed initial glossary terms on first startup."""
    terms = [
        {"term": "Phishing", "category": "Attack Vector", "cialdini_principle": "authority",
         "definition": "Pengiriman komunikasi palsu yang terlihat berasal dari sumber terpercaya, biasanya melalui email, untuk mencuri data.",
         "example": "Email yang tampak dari Microsoft 365 meminta login ulang dengan tautan ke situs palsu."},
        {"term": "Spear Phishing", "category": "Attack Vector", "cialdini_principle": "liking",
         "definition": "Phishing bertarget dimana penyerang meneliti korban terlebih dahulu untuk membuat pesan yang sangat personal dan meyakinkan.",
         "example": "Email yang menyebut nama proyek Anda yang spesifik dan jabatan Anda."},
        {"term": "Vishing (Voice Phishing)", "category": "Attack Vector", "cialdini_principle": "authority",
         "definition": "Phishing yang dilakukan melalui telepon. Penyerang sering menggunakan modulasi suara atau deepfake.",
         "example": "Telepon dari 'Departemen Penipuan Bank' yang meminta PIN ATM Anda."},
        {"term": "Smishing", "category": "Attack Vector", "cialdini_principle": "scarcity",
         "definition": "Phishing yang dilakukan melalui SMS atau pesan teks, sering mengandung tautan berbahaya.",
         "example": "SMS 'Paket Anda tertahan, verifikasi sekarang: [link]'."},
        {"term": "BEC (Business Email Compromise)", "category": "Attack Vector", "cialdini_principle": "authority",
         "definition": "Serangan yang menarget perusahaan dengan menyamar sebagai eksekutif atau vendor untuk meminta transfer dana atau data sensitif.",
         "example": "Email dari 'Direktur Utama' meminta transfer dana darurat ke rekening baru."},
        {"term": "Pretexting", "category": "Attack Vector", "cialdini_principle": "liking",
         "definition": "Penciptaan skenario palsu (pretext) untuk memanipulasi korban agar mau memberikan informasi atau melakukan tindakan.",
         "example": "Berpura-pura sebagai karyawan IT yang perlu akses darurat ke sistem."},
        {"term": "Baiting", "category": "Attack Vector",
         "definition": "Menggunakan umpan fisik atau digital untuk menjebak korban, mengeksploitasi rasa ingin tahu.",
         "example": "USB drive berlabel 'Gaji Direksi 2026' yang ditinggalkan di parkiran."},
        {"term": "Tailgating / Piggybacking", "category": "Attack Vector",
         "definition": "Memasuki area terlarang secara fisik dengan mengikuti orang yang berwenang, sering dengan dalih 'tangan penuh'.",
         "example": "Mengikuti karyawan masuk ke ruang server saat mereka membuka pintu."},
        {"term": "Quid Pro Quo", "category": "Attack Vector", "cialdini_principle": "reciprocity",
         "definition": "Menawarkan sesuatu sebagai imbalan informasi atau tindakan. Penyerang memberikan 'layanan' untuk mendapat akses.",
         "example": "Pura-pura sebagai IT Support yang menawarkan perbaikan masalah komputer sebagai imbalan password."},
        {"term": "Reciprocity (Timbal Balik)", "category": "Psychology", "cialdini_principle": "reciprocity",
         "definition": "Kecenderungan manusia untuk merasa wajib membalas budi. Penyerang mengeksploitasi ini dengan memberi sesuatu terlebih dahulu.",
         "example": "Penyerang membantu masalah IT Anda tanpa diminta, lalu meminta password untuk 'verifikasi perbaikan'.",
         "related_terms": ["Quid Pro Quo", "Liking"]},
        {"term": "Scarcity (Kelangkaan)", "category": "Psychology", "cialdini_principle": "scarcity",
         "definition": "Manusia menilai tinggi sesuatu yang langka atau hampir habis. Penyerang menciptakan tekanan waktu buatan untuk bypass berpikir kritis.",
         "example": "'Akun Anda akan dihapus dalam 24 jam' atau 'Transfer harus dilakukan sebelum pukul 15.00 hari ini'.",
         "related_terms": ["FOMO", "Urgency"]},
        {"term": "Authority (Otoritas)", "category": "Psychology", "cialdini_principle": "authority",
         "definition": "Kita dikondisikan untuk mematuhi figur otoritas. Penyerang menyamar sebagai CEO, pejabat, atau administrator IT.",
         "example": "Voice call deepfake dari 'CEO' yang meminta transfer wire segera.",
         "related_terms": ["BEC", "Impersonation"]},
        {"term": "Commitment (Komitmen)", "category": "Psychology", "cialdini_principle": "commitment",
         "definition": "Setelah berkomitmen pada sesuatu, manusia cenderung konsisten dengan keputusan tersebut meski tidak lagi masuk akal.",
         "example": "Penyerang meminta persetujuan kecil dulu (isi survei), lalu eskalasi ke permintaan lebih besar (download file).",
         "related_terms": ["Foot-in-the-Door", "Social Proof"]},
        {"term": "Liking (Kesukaan)", "category": "Psychology", "cialdini_principle": "liking",
         "definition": "Kita lebih mudah menyetujui permintaan orang yang kita sukai. Penyerang membangun rapport sebelum menyerang.",
         "example": "Penyerang meneliti hobi Anda dari LinkedIn dan membangun persahabatan sebelum meminta informasi sensitif.",
         "related_terms": ["Rapport Building", "Pretexting"]},
        {"term": "Social Proof (Bukti Sosial)", "category": "Psychology", "cialdini_principle": "social_proof",
         "definition": "Kita melihat perilaku sebagai lebih benar ketika orang lain melakukannya. Penyerang mengklaim 'semua orang sudah melakukannya'.",
         "example": "'70% rekan Anda sudah memperbarui password di sini. Jangan sampai tertinggal.'",
         "related_terms": ["Peer Pressure", "Bandwagon Effect"]},
        {"term": "OSINT", "category": "Technology",
         "definition": "Open Source Intelligence — pengumpulan data dari sumber publik untuk keperluan intelijen atau persiapan serangan.",
         "example": "Penyerang memindai LinkedIn untuk membangun struktur organisasi sebelum serangan spear phishing.",
         "related_terms": ["Reconnaissance", "Pretexting"]},
        {"term": "Deepfake", "category": "Technology",
         "definition": "Media sintetis berbasis AI di mana wajah atau suara seseorang digantikan dengan milik orang lain secara realistis.",
         "example": "Audio palsu CEO yang mengotorisasi transfer dana.",
         "related_terms": ["AI Voice Cloning", "Vishing"]},
        {"term": "MFA Fatigue Attack", "category": "Technology", "cialdini_principle": "scarcity",
         "definition": "Serangan yang membanjiri korban dengan notifikasi MFA hingga kelelahan dan menyetujui salah satunya.",
         "example": "Penyerang brute-force password Anda dan mengirim 50 notifikasi MFA berturut-turut hingga Anda menyetujui satu.",
         "related_terms": ["Account Takeover", "2FA"]},
        {"term": "Caller ID Spoofing", "category": "Technology",
         "definition": "Manipulasi nomor telepon yang muncul di layar penerima agar terlihat seperti nomor resmi atau terpercaya.",
         "example": "Penipu menelepon dengan nomor yang terlihat persis seperti nomor resmi Bank BRI 14017.",
         "related_terms": ["Vishing", "Impersonation"]},
        {"term": "DJP (Direktorat Jenderal Pajak)", "category": "Konteks Indonesia",
         "definition": "Instansi pajak pemerintah Indonesia. Domain resmi: @pajak.go.id | Website: www.pajak.go.id | Hotline: 1500200.",
         "example": "Penipu menyamar sebagai petugas DJP untuk mencuri NPWP dan data rekening bank korban.",
         "related_terms": ["NPWP", "Phishing Pemerintah"]},
        {"term": "UU PDP (Perlindungan Data Pribadi)", "category": "Regulation",
         "definition": "UU No. 27 Tahun 2022 tentang Perlindungan Data Pribadi Indonesia. Mewajibkan notifikasi pelanggaran data dalam 14 hari.",
         "example": "Perusahaan yang mengalami kebocoran data wajib memberitahu pemilik data dalam 14 hari.",
         "related_terms": ["BSSN", "OJK", "Data Breach"]},
        {"term": "BSSN (Badan Siber dan Sandi Negara)", "category": "Konteks Indonesia",
         "definition": "Lembaga pemerintah Indonesia yang bertanggung jawab atas keamanan siber nasional. Laporan insiden: lapor@bssn.go.id | 021-5797-4552.",
         "example": "Serangan siber terhadap infrastruktur pemerintah dilaporkan ke BSSN untuk koordinasi respons nasional.",
         "related_terms": ["CSIRT", "UU PDP"]},
        {"term": "OTP (One-Time Password)", "category": "Technology",
         "definition": "Kode verifikasi sekali pakai yang dikirim ke perangkat terdaftar untuk autentikasi dua faktor.",
         "example": "Kode 6 digit yang dikirim WhatsApp saat mendaftar perangkat baru. TIDAK BOLEH dibagikan ke siapapun.",
         "related_terms": ["MFA", "WhatsApp Hijacking", "2FA"]},
        {"term": "SIM Swap", "category": "Technology",
         "definition": "Penipuan di mana penipu menduplikasi kartu SIM Anda dengan berpura-pura sebagai Anda ke operator telekomunikasi untuk mencegat OTP.",
         "example": "Penipu melaporkan SIM hilang ke Telkomsel, mendapat SIM baru, lalu mencegat semua OTP mobile banking.",
         "related_terms": ["OTP", "Vishing", "Mobile Banking"]},
    ]
    for t in terms:
        t["id"] = str(uuid.uuid4())
        t["created_at"] = datetime.now(UTC).isoformat()
        t["updated_at"] = t["created_at"]
        t["created_by"] = "system"
        t.setdefault("example", "")
        t.setdefault("related_terms", [])
        t.setdefault("tags", [])
        t.setdefault("cialdini_principle", None)
        await db.glossary.insert_one(t)
    logger.info(f"Seeded {len(terms)} glossary terms")


async def auto_import_yaml(db):
    """Import YAML sample data, skipping titles that already exist."""
    data_dirs = [
        Path("/app/data/sample"),
        Path("/app/data/professionals"),
        Path("data/sample"),
        Path("data/professionals"),
    ]
    total = 0
    skipped = 0
    for data_dir in data_dirs:
        if not data_dir.exists():
            continue
        for yaml_file in sorted(data_dir.glob("*.yaml")):
            try:
                with open(yaml_file, encoding="utf-8") as f:
                    data = yaml.safe_load(f)
                yaml_type = data.get("type")
                title = data.get("title")
                if not yaml_type or not title:
                    continue
                if yaml_type == "challenge":
                    if await db.challenges.find_one({"title": title}):
                        skipped += 1
                        continue
                    data["id"] = str(uuid.uuid4())
                    data["created_at"] = datetime.now(UTC).isoformat()
                    await db.challenges.insert_one(data)
                elif yaml_type == "quiz":
                    if await db.quizzes.find_one({"title": title}):
                        skipped += 1
                        continue
                    data["id"] = str(uuid.uuid4())
                    data["created_at"] = datetime.now(UTC).isoformat()
                    await db.quizzes.insert_one(data)
                elif yaml_type == "campaign":
                    if await db.campaigns.find_one({"title": title}):
                        skipped += 1
                        continue
                    data["id"] = str(uuid.uuid4())
                    data["created_at"] = datetime.now(UTC).isoformat()
                    data["is_published"] = data.get("is_published", True)
                    # Normalize stages
                    for i, stage in enumerate(data.get("stages", [])):
                        if not stage.get("stage_id"):
                            stage["stage_id"] = str(uuid.uuid4())
                        if "order" not in stage:
                            stage["order"] = i
                    await db.campaigns.insert_one(data)
                else:
                    continue
                total += 1
                logger.info(f"  Imported: {title}")
            except Exception as e:
                logger.warning(f"  Failed to import {yaml_file.name}: {e}")
    logger.info(f"Auto-import complete: {total} new items loaded, {skipped} already existed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown events."""
    # Startup: seed default admin user from env vars
    seed_username = os.environ.get("SEED_ADMIN_USERNAME", "soceng")
    seed_password = os.environ.get("SEED_ADMIN_PASSWORD", "Cialdini@2025!")
    seed_display = os.environ.get("SEED_ADMIN_DISPLAY_NAME", "Admin")
    existing_user = await db.users.find_one({"username": seed_username})
    if not existing_user:
        seed_user = User(
            username=seed_username,
            password_hash=hash_password(seed_password),
            display_name=seed_display,
            role="admin",
        )
        doc = seed_user.model_dump()
        doc["created_at"] = doc["created_at"].isoformat()
        await db.users.insert_one(doc)
        logger.info(f"Seed admin user created: {seed_username}")

    # Ensure indexes
    await db.users.create_index("username", unique=True)
    await db.organizations.create_index("invite_code", unique=True, sparse=True)
    await db.notifications.create_index([("user_id", 1), ("read", 1)])
    await db.simulations.create_index([("user_id", 1), ("status", 1)])
    await db.campaign_progress.create_index([("campaign_id", 1), ("user_id", 1)])
    # v3 platform indexes
    await db.simulation_events.create_index([("simulation_id", 1), ("sequence", 1)])
    await db.risk_profiles.create_index("user_id", unique=True)
    await db.personas.create_index("id", unique=True)
    # instructor/training indexes
    await db.training_groups.create_index("instructor_id")
    await db.assignments.create_index([("instructor_id", 1), ("trainee_id", 1)])
    await db.assignments.create_index("trainee_id")
    await db.assignments.create_index([("trainee_id", 1), ("status", 1)])
    await db.assignment_results.create_index([("assignment_id", 1), ("trainee_id", 1)])
    await db.glossary.create_index("id", unique=True)
    await db.glossary.create_index("term")

    # Auto-import sample data on every startup (skips titles that already exist)
    logger.info("Syncing sample data from YAML files...")
    await auto_import_yaml(db)

    # Seed glossary terms if empty
    if await db.glossary.count_documents({}) == 0:
        await _seed_glossary()

    # Warn about default JWT secret
    jwt_secret = os.environ.get("JWT_SECRET", "")
    if not jwt_secret or jwt_secret == "change-this-secret-key-in-production":
        logger.warning("WARNING: Using default JWT secret. Set JWT_SECRET env var in production!")

    yield

    # Shutdown
    from services.database import client

    client.close()


# Create the app
app = FastAPI(
    title="Pretexta API",
    description="Social Engineering Simulation & Awareness Platform API",
    version="3.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# API router with /api prefix
api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "Pretexta API", "version": "3.0.0", "docs": "/docs"}


@api_router.get("/health")
async def health_check():
    """Health check endpoint for Docker, load balancers, and monitoring."""
    from datetime import UTC, datetime
    db_status = "disconnected"
    try:
        await db.command("ping")
        db_status = "connected"
    except Exception:
        pass

    is_healthy = db_status == "connected"
    return {
        "status": "healthy" if is_healthy else "degraded",
        "database": db_status,
        "timestamp": datetime.now(UTC).isoformat(),
        "version": "3.0.0",
    }


# Register all route modules
api_router.include_router(auth_router)
api_router.include_router(challenges_router)
api_router.include_router(quizzes_router)
api_router.include_router(simulations_router)
api_router.include_router(llm_router)
api_router.include_router(settings_router)
api_router.include_router(imports_router)
api_router.include_router(reports_router)
api_router.include_router(leaderboard_router)
api_router.include_router(analytics_router)
api_router.include_router(organizations_router)
api_router.include_router(campaigns_router)
api_router.include_router(notifications_router)
api_router.include_router(webhooks_router)
api_router.include_router(scenario_builder_router)
api_router.include_router(debrief_router)
api_router.include_router(certificates_router)
api_router.include_router(adaptive_router)
# v3 platform services
api_router.include_router(personas_router)
api_router.include_router(risk_profile_router)
api_router.include_router(instructor_router)
api_router.include_router(assignments_router)
api_router.include_router(glossary_router)

app.include_router(api_router)

# Middleware (order matters: last added = first executed)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(RateLimitMiddleware, max_attempts=10, window_seconds=300)
