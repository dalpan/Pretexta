"""
Inbox triage: a high-signal exercise that measures discrimination, not recall.

The trainee reviews an inbox of mostly-legitimate mail with a few pretexts and
flags the ones they think are phishing. Scoring uses signal-detection theory,
so flagging a legitimate message (a false alarm) costs — "report everything" no
longer earns a perfect score.

Grading is server-side; the per-item labels are never sent to the taker.
"""

import math
import uuid
from datetime import UTC, datetime

from fastapi import HTTPException

from services.database import db


def strip_item(item: dict) -> dict:
    """An inbox item as the taker sees it — without the label or explanation."""
    return {
        "id": item.get("id"),
        "from": item.get("from"),
        "subject": item.get("subject"),
        "body": item.get("body"),
        "channel": item.get("channel", "email_inbox"),
        "received": item.get("received"),
    }


def _probit(p: float) -> float:
    """Inverse standard-normal CDF (Acklam's rational approximation)."""
    if p <= 0:
        return -math.inf
    if p >= 1:
        return math.inf
    a = [
        -3.969683028665376e01,
        2.209460984245205e02,
        -2.759285104469687e02,
        1.383577518672690e02,
        -3.066479806614716e01,
        2.506628277459239e00,
    ]
    b = [
        -5.447609879822406e01,
        1.615858368580409e02,
        -1.556989798598866e02,
        6.680131188771972e01,
        -1.328068155288572e01,
    ]
    c = [
        -7.784894002430293e-03,
        -3.223964580411365e-01,
        -2.400758277161838e00,
        -2.549732539343734e00,
        4.374664141464968e00,
        2.938163982698783e00,
    ]
    d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e00, 3.754408661907416e00]
    plow, phigh = 0.02425, 1 - 0.02425
    if p < plow:
        q = math.sqrt(-2 * math.log(p))
        return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / (
            (((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1
        )
    if p > phigh:
        q = math.sqrt(-2 * math.log(1 - p))
        return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / (
            (((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1
        )
    q = p - 0.5
    r = q * q
    return (
        (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5])
        * q
        / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    )


def signal_detection(hits: int, pretexts: int, false_alarms: int, legits: int) -> dict:
    """d' and criterion from hit/false-alarm counts, with the standard
    log-linear correction so rates of 0 or 1 stay finite."""
    hit_rate = (hits + 0.5) / (pretexts + 1)
    fa_rate = (false_alarms + 0.5) / (legits + 1)
    z_hit = _probit(hit_rate)
    z_fa = _probit(fa_rate)
    d_prime = z_hit - z_fa
    criterion = -0.5 * (z_hit + z_fa)
    return {
        "d_prime": round(d_prime, 2),
        "criterion": round(criterion, 2),
        "hit_rate": round(hits / pretexts, 2) if pretexts else None,
        "false_alarm_rate": round(false_alarms / legits, 2) if legits else None,
    }


async def get_set(set_id: str, *, with_labels: bool = False) -> dict:
    triage = await db.triage_sets.find_one({"id": set_id}, {"_id": 0})
    if not triage:
        raise HTTPException(status_code=404, detail="Triage set not found")
    if not with_labels:
        triage["items"] = [strip_item(i) for i in triage.get("items", [])]
    return triage


async def grade(set_id: str, user_id: str, marks: dict[str, str], duration_seconds: int) -> dict:
    """marks maps item_id -> "flag" (report as phishing) or "leave".
    Unmarked items count as "leave"."""
    triage = await get_set(set_id, with_labels=True)
    items = triage.get("items", [])
    if not items:
        raise HTTPException(status_code=400, detail="Triage set has no items")

    hits = misses = false_alarms = correct_rejections = 0
    pretexts = legits = 0
    results = []
    for item in items:
        flagged = marks.get(item["id"]) == "flag"
        is_pretext = bool(item.get("is_pretext"))
        if is_pretext:
            pretexts += 1
            outcome = "hit" if flagged else "miss"
            hits += flagged
            misses += not flagged
        else:
            legits += 1
            outcome = "false_alarm" if flagged else "correct_rejection"
            false_alarms += flagged
            correct_rejections += not flagged
        results.append(
            {
                "id": item["id"],
                "is_pretext": is_pretext,
                "flagged": flagged,
                "outcome": outcome,
                "principle": item.get("principle"),
                "explanation": item.get("explanation"),
            }
        )

    sdt = signal_detection(hits, pretexts, false_alarms, legits)
    # A 0-100 score for leaderboard compatibility: correct decisions, with a
    # heavier penalty for false alarms (over-flagging legitimate mail).
    correct = hits + correct_rejections
    score = max(0, round((correct / len(items)) * 100 - false_alarms * 5))

    from services.simulation import create_simulation

    sim = await create_simulation(
        {
            "simulation_type": "triage",
            "triage_set_id": set_id,
            "status": "completed",
            "score": score,
            "title": triage.get("title", "Inbox Triage"),
            "difficulty": triage.get("difficulty"),
            "challenge_data": {
                "cialdini_categories": sorted({r["principle"] for r in results if r["principle"]})
            },
            "events": [{"event_type": "triage_graded", "payload": sdt}],
            "total_questions": len(items),
            "correct_answers": correct,
            "completed_at": datetime.now(UTC).isoformat(),
        },
        user_id,
        internal=True,
    )
    return {
        "score": score,
        "metrics": {
            **sdt,
            "hits": hits,
            "misses": misses,
            "false_alarms": false_alarms,
            "correct_rejections": correct_rejections,
            "pretexts": pretexts,
            "legitimate": legits,
            "duration_seconds": duration_seconds,
        },
        "results": results,
        "simulation_id": sim["id"],
    }


async def seed_default_set() -> None:
    """Seed the built-in triage sets so the exercise is demoable out of the box.

    Inserted by id, so a set added in a later release still reaches an existing
    database, while sets an admin edited are left alone.
    """
    for doc in (_default_set(), _default_set_id()):
        if not await db.triage_sets.find_one({"id": doc["id"]}, {"_id": 1}):
            await db.triage_sets.insert_one(doc)


def _item(
    from_, subject, body, is_pretext, principle=None, explanation=None, channel="email_inbox"
):
    return {
        "id": str(uuid.uuid4()),
        "from": from_,
        "subject": subject,
        "body": body,
        "channel": channel,
        "is_pretext": is_pretext,
        "principle": principle,
        "explanation": explanation,
    }


def _default_set() -> dict:
    return {
        "id": "triage-inbox-01",
        "title": "Monday Morning Inbox",
        "language": "en",
        "difficulty": "medium",
        "description": "Ten messages waiting on a normal Monday. Flag the ones you would report.",
        "items": [
            _item(
                "notifications@github.com",
                "[acme/web] PR #482 merged",
                "Your pull request was merged into main by a teammate.",
                False,
            ),
            _item(
                "calendar@acme.com",
                "Invite: Sprint planning, 10:00",
                "You have been invited to Sprint planning. Accept / Decline.",
                False,
            ),
            _item(
                "it-helpdesk@acme-support.net",
                "Action required: your mailbox will be locked",
                "We detected unusual activity. Verify within 2 hours or your mailbox is suspended. Click: http://acme-support.net/verify",
                True,
                "scarcity",
                "Look-alike domain (acme-support.net, not acme.com), urgency, and a link to 'verify' — classic credential phish.",
            ),
            _item(
                "hr@acme.com",
                "Reminder: submit your timesheet",
                "Please submit this week's timesheet by Friday in the HR portal.",
                False,
            ),
            _item(
                "ceo@acme.corp-mail.com",
                "Quick favour — are you at your desk?",
                "I'm in a meeting and need you to buy 5 gift cards for a client. Send me the codes, I'll reimburse. Keep this between us.",
                True,
                "authority",
                "Executive impersonation from a look-alike domain, urgency, secrecy, and gift-card codes — textbook BEC.",
            ),
            _item(
                "newsletter@industryweekly.com",
                "This week in security",
                "Your weekly digest of security news and analysis.",
                False,
            ),
            _item(
                "no-reply@dropbox.com",
                "Someone shared 'Q3 report.xlsx' with you",
                "A colleague shared a file with you on Dropbox.",
                False,
            ),
            _item(
                "payroll@acme.com",
                "Your payslip for this month is available",
                "Your payslip is available in the payroll portal (bookmarked link).",
                False,
            ),
            _item(
                "support@paypaI-billing.com",
                "Your account has been limited",
                "We limited your account. Confirm your card details to restore access: http://paypaI-billing.com/restore",
                True,
                "authority",
                "Brand impersonation using a capital-I instead of lowercase-l in 'paypal', plus a request for card details.",
            ),
            _item(
                "teammate@acme.com",
                "lunch?",
                "Want to grab lunch at 12:30? Replying to confirm.",
                False,
            ),
        ],
    }


def _default_set_id() -> dict:
    """Indonesian counterpart of the default set (fictional organization and brands)."""
    return {
        "id": "triage-inbox-01-id",
        "title": "Inbox Senin Pagi",
        "language": "id",
        "difficulty": "medium",
        "description": "Sepuluh pesan menunggu di hari Senin biasa. Tandai yang akan Anda laporkan.",
        "items": [
            _item(
                "sekretariat@acme.co.id",
                "Rapat koordinasi mingguan, Senin 09.00",
                "Rapat koordinasi mingguan diadakan di ruang rapat lantai 3. Agenda terlampir di kalender.",
                False,
            ),
            _item(
                "sdm@acme.co.id",
                "Pengingat: lengkapi absensi dan laporan lembur",
                "Mohon lengkapi absensi dan laporan lembur minggu ini di portal SDM paling lambat Jumat.",
                False,
            ),
            _item(
                "it-support@acme-co-id.net",
                "PENTING: kuota email penuh, akun dinonaktifkan dalam 2 jam",
                "Kuota kotak surat Anda melebihi batas. Verifikasi akun dalam 2 jam atau email "
                "Anda akan dinonaktifkan. Klik: http://acme-co-id.net/verifikasi",
                True,
                "scarcity",
                "Domain tiruan (acme-co-id.net, bukan acme.co.id), tenggat 2 jam, dan tautan "
                "'verifikasi' — pola phishing kredensial yang klasik.",
            ),
            _item(
                "keuangan@acme.co.id",
                "Slip gaji bulan ini sudah tersedia",
                "Slip gaji Anda dapat dilihat di portal kepegawaian (gunakan bookmark yang biasa).",
                False,
            ),
            _item(
                "direktur.utama@acme-co.id",
                "Bisa bantu sebentar? Mohon dirahasiakan",
                "Saya sedang rapat dan tidak bisa telepon. Tolong belikan 5 voucher saldo e-wallet "
                "untuk relasi kita, lalu kirim kodenya ke saya. Nanti saya ganti. Jangan bilang siapa-siapa dulu.",
                True,
                "authority",
                "Mencatut pimpinan dari domain tiruan, desakan, permintaan merahasiakan, dan kode "
                "voucher — pola penipuan BEC yang umum.",
            ),
            _item(
                "kalender@acme.co.id",
                "Undangan: Pelatihan K3, Kamis 13.00",
                "Anda diundang ke Pelatihan K3 hari Kamis pukul 13.00. Terima / Tolak.",
                False,
            ),
            _item(
                "buletin@infosekuriti.example",
                "Buletin keamanan siber pekan ini",
                "Rangkuman berita dan analisis keamanan siber pekan ini.",
                False,
            ),
            _item(
                "layanan@nusapay-verifikasi.com",
                "Akun NusaPay Anda dibatasi sementara",
                "Akun Anda kami batasi karena aktivitas mencurigakan. Balas email ini dengan kode OTP "
                "yang kami kirim ke ponsel Anda untuk memulihkan akses.",
                True,
                "authority",
                "Mencatut layanan pembayaran dari domain yang bukan milik resminya, lalu meminta kode OTP. "
                "Layanan resmi tidak pernah meminta OTP.",
            ),
            _item(
                "rekan.kerja@acme.co.id",
                "Notulen rapat kemarin",
                "Notulen rapat kemarin sudah saya unggah ke folder bersama tim seperti biasa.",
                False,
            ),
            _item(
                "teman.satu.tim@acme.co.id",
                "makan siang?",
                "Makan siang jam 12.30 di kantin? Kabari ya.",
                False,
            ),
        ],
    }
