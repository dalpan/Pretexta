"""
Launch a live campaign through GoPhish and sync its results.

Pretexta owns the campaign; GoPhish objects are created per campaign, named
`pretexta-<campaign_id>`, so re-runs never collide. Excluded recipients (G11)
are filtered out here, the last line of defense before anything is sent.
"""

import logging
from datetime import UTC, datetime
from typing import Any

from services import audit
from services.database import db
from services.live.gophish import EVENT_RANK, STATUS_TO_EVENT, GophishClient, GophishError
from services.live.preflight import excluded_addresses, has_errors, run_preflight

logger = logging.getLogger(__name__)

TEACHABLE_MOMENT_HTML = """<!doctype html><html><head><meta charset="utf-8">
<title>Security awareness check</title></head>
<body style="font-family:sans-serif;max-width:40rem;margin:3rem auto;line-height:1.5">
<h1>This was a simulated phishing test</h1>
<p>No account was compromised. This message was part of an authorized security
awareness exercise run by your organization.</p>
<p>In a real attack, this link could have led to a credential-stealing page.
When a message pressures you to act quickly, verify it through a channel you
trust before clicking.</p>
<p>Thank you for helping keep everyone safer.</p>
</body></html>"""


async def get_live_config() -> dict[str, Any] | None:
    return await db.live_config.find_one({"id": "live_config"}, {"_id": 0})


def _obj_name(campaign_id: str) -> str:
    return f"pretexta-{campaign_id}"


def _reply_to_address(config: dict, campaign: dict) -> str | None:
    """Reply-To that routes replies back to this campaign via plus-addressing."""
    local = config.get("reply_local")
    domain = config.get("reply_domain")
    if not local or not domain:
        return None
    return f"{local}+{campaign['reply_token']}@{domain}"


async def _eligible_recipients(campaign: dict) -> list[str]:
    excluded = await excluded_addresses(campaign.get("organization_id"))
    return [email for email in campaign["recipients"] if email not in excluded]


async def launch_campaign(campaign: dict, actor_id: str) -> dict:
    """Create GoPhish objects and launch. Caller enforces status/kill-switch rules."""
    config = await get_live_config()
    if not config or not config.get("gophish_base_url"):
        raise GophishError("GoPhish is not configured (Settings → Live)")

    # Re-run preflight at the last moment: DNS or exclusions may have changed.
    findings = await run_preflight(campaign)
    if has_errors(findings):
        raise GophishError("Preflight failed at launch; reopen the campaign to see why")

    recipients = await _eligible_recipients(campaign)
    if not recipients:
        raise GophishError("No eligible recipients remain after exclusions")

    name = _obj_name(campaign["id"])
    targets = [{"email": e, "first_name": "", "last_name": "", "position": ""} for e in recipients]

    async with GophishClient(
        config["gophish_base_url"], config["gophish_api_key"], config.get("verify_tls", False)
    ) as gp:
        await gp.create_group(name, targets)
        await gp.create_template(name, campaign["subject"], campaign["body_html"])
        await gp.create_page(name, TEACHABLE_MOMENT_HTML, redirect_url="")
        headers = [
            {"key": "From", "value": f"{campaign['sender_name']} <{campaign['sender_email']}>"}
        ]
        reply_to = _reply_to_address(config, campaign)
        if reply_to:
            headers.append({"key": "Reply-To", "value": reply_to})
        await gp.create_smtp(
            name,
            host=config.get("smtp_host", "localhost:25"),
            from_address=campaign["sender_email"],
            username=config.get("smtp_username", ""),
            password=config.get("smtp_password", ""),
            headers=headers,
        )
        result = await gp.launch_campaign(
            name,
            template=name,
            page=name,
            smtp=name,
            url=config.get("phish_url", "http://localhost"),
            groups=[name],
        )

    gophish_id = result["id"]
    now = datetime.now(UTC).isoformat()
    await db.live_recipients.delete_many({"campaign_id": campaign["id"]})
    await db.live_recipients.insert_many(
        [
            {
                "campaign_id": campaign["id"],
                "email": email,
                "state": "queued",
                "reported": False,
                "updated_at": now,
            }
            for email in recipients
        ]
    )
    await db.live_campaigns.update_one(
        {"id": campaign["id"]},
        {"$set": {"status": "running", "gophish_campaign_id": gophish_id, "launched_at": now}},
    )
    await audit.record(
        actor_id,
        "live.campaign.launch",
        campaign["id"],
        {"gophish_campaign_id": gophish_id, "recipients": len(recipients)},
    )
    return {"status": "running", "gophish_campaign_id": gophish_id, "recipients": len(recipients)}


async def sync_results(campaign: dict) -> dict:
    """Pull GoPhish results into Pretexta events. Idempotent: only advances state."""
    gophish_id = campaign.get("gophish_campaign_id")
    if not gophish_id:
        return {"synced": 0}
    config = await get_live_config()
    if not config:
        return {"synced": 0}

    async with GophishClient(
        config["gophish_base_url"], config["gophish_api_key"], config.get("verify_tls", False)
    ) as gp:
        data = await gp.campaign_results(gophish_id)

    changed = 0
    for row in data.get("results", []):
        event = STATUS_TO_EVENT.get(row.get("status"))
        reported = bool(row.get("reported"))
        current = await db.live_recipients.find_one(
            {"campaign_id": campaign["id"], "email": row["email"]}, {"_id": 0}
        )
        if not current:
            continue

        updates: dict[str, Any] = {}
        if event and EVENT_RANK.get(event, -1) > EVENT_RANK.get(current.get("state", ""), -1):
            updates["state"] = event
            await _record_event(campaign, row["email"], event)
        if reported and not current.get("reported"):
            updates["reported"] = True
            await _record_event(campaign, row["email"], "reported")
        if updates:
            updates["updated_at"] = datetime.now(UTC).isoformat()
            await db.live_recipients.update_one(
                {"campaign_id": campaign["id"], "email": row["email"]}, {"$set": updates}
            )
            changed += 1

    return {"synced": changed, "gophish_status": data.get("status")}


async def _record_event(campaign: dict, email: str, event_type: str) -> None:
    # `at` is stored as a BSON Date (not ISO string) so the TTL index can expire it (G14).
    await db.live_events.insert_one(
        {
            "campaign_id": campaign["id"],
            "organization_id": campaign.get("organization_id"),
            "email": email,
            "type": event_type,
            "at": datetime.now(UTC),
        }
    )


async def stop_campaign(campaign: dict) -> None:
    """Best-effort: delete the GoPhish campaign so no further mail is sent (G4)."""
    gophish_id = campaign.get("gophish_campaign_id")
    if not gophish_id:
        return
    config = await get_live_config()
    if not config:
        return
    try:
        async with GophishClient(
            config["gophish_base_url"], config["gophish_api_key"], config.get("verify_tls", False)
        ) as gp:
            await gp.delete_campaign(gophish_id)
    except GophishError as exc:
        logger.warning(f"Could not stop GoPhish campaign {gophish_id}: {exc}")


async def report_rate(campaign_id: str) -> dict[str, Any]:
    """Primary metric: share of recipients who reported, and median time-to-report."""
    recipients = await db.live_recipients.count_documents({"campaign_id": campaign_id})
    reported = await db.live_recipients.count_documents(
        {"campaign_id": campaign_id, "reported": True}
    )
    clicked = await db.live_recipients.count_documents(
        {"campaign_id": campaign_id, "state": {"$in": ["clicked", "submitted"]}}
    )
    return {
        "recipients": recipients,
        "reported": reported,
        "clicked": clicked,
        "report_rate": round(reported / recipients, 3) if recipients else None,
    }


__all__ = [
    "launch_campaign",
    "sync_results",
    "stop_campaign",
    "report_rate",
    "get_live_config",
]


# ── Built-in phishing templates ──────────────────────────────────────

LIVE_TEMPLATES = [
    {
        "id": "tmpl-helpdesk-otp",
        "name": "IT Helpdesk — verify your mailbox",
        "category": "Credential / OTP",
        "objective": "agree_to_share_otp",
        "principles": ["authority", "scarcity"],
        "sender_name": "IT Helpdesk",
        "subject": "Action required: verify your mailbox",
        "body_html": "<p>Hi,</p><p>We detected unusual sign-in activity on your account. "
        "To keep your mailbox active, please confirm your identity within 2 hours: "
        '<a href="{{.URL}}">verify now</a>.</p><p>IT Helpdesk</p>',
    },
    {
        "id": "tmpl-ceo-wire",
        "name": "CEO — urgent wire transfer",
        "category": "Business Email Compromise",
        "objective": "agree_to_approve_payment",
        "principles": ["authority", "scarcity"],
        "sender_name": "CEO Office",
        "subject": "Quick favour — are you at your desk?",
        "body_html": "<p>I'm in a meeting and can't talk. I need an urgent supplier payment "
        "processed today. Open the secure portal and confirm: "
        '<a href="{{.URL}}">{{.URL}}</a>. Keep this confidential.</p>',
    },
    {
        "id": "tmpl-hr-policy",
        "name": "HR — updated policy acknowledgement",
        "category": "Click / Credential",
        "objective": "click_link",
        "principles": ["authority", "commitment"],
        "sender_name": "Human Resources",
        "subject": "Please acknowledge the updated remote-work policy",
        "body_html": "<p>Hello,</p><p>Our remote-work policy has changed. All staff must "
        'review and acknowledge it by Friday: <a href="{{.URL}}">open the policy</a>.</p>'
        "<p>Thanks, HR</p>",
    },
    {
        "id": "tmpl-delivery",
        "name": "Delivery — package held",
        "category": "Click / Credential",
        "objective": "click_link",
        "principles": ["scarcity", "liking"],
        "sender_name": "Delivery Notifications",
        "subject": "Your package could not be delivered",
        "body_html": "<p>We attempted delivery but no one was available. Reschedule within "
        '24 hours or the parcel is returned: <a href="{{.URL}}">reschedule delivery</a>.</p>',
    },
    {
        "id": "tmpl-it-tool",
        "name": "IT — install the new security agent",
        "category": "Tool install",
        "objective": "agree_to_install_tool",
        "principles": ["authority"],
        "sender_name": "IT Security",
        "subject": "Required: install the new endpoint agent",
        "body_html": "<p>As part of our security upgrade, all laptops must run the new "
        'endpoint agent by end of week. Download and install: <a href="{{.URL}}">get the agent</a>.</p>',
    },
]


async def seed_templates() -> None:
    if await db.live_templates.count_documents({}):
        return
    await db.live_templates.insert_many([dict(t) for t in LIVE_TEMPLATES])
