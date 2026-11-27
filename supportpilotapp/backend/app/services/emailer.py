"""Email bhejne wala. Provider settings se chunta hai (log | maileroo).
Ek hi email dobara nahi jaata (dedupe_key), aur email fail ho to bhi caller ko exception nahi milta."""
import logging

import httpx
from psycopg.types.json import Jsonb

from app.core.config import settings

log = logging.getLogger(__name__)


class EmailError(Exception):
    """Provider ne email nahi bheji."""


def _send_log(to_email: str, subject: str, text: str) -> None:
    """Dev/test: asli email nahi, bas log me dikhata hai."""
    log.info("EMAIL (not sent, log provider) to=%s subject=%s", to_email, subject)


def _send_maileroo(to_email: str, subject: str, text: str) -> None:
    if not settings.maileroo_api_key or not settings.email_from:
        raise EmailError("Maileroo is not configured")
    from_addr = settings.email_from if "@" in settings.email_from else f"support@{settings.email_from}"
    body = {
        "from": {"address": from_addr, "display_name": settings.email_from_name},
        "to": [{"address": to_email}],
        "subject": subject,
        "plain": text,
    }
    try:
        r = httpx.post(f"{settings.maileroo_base_url}/emails", json=body,
                       headers={"X-Api-Key": settings.maileroo_api_key}, timeout=8)
    except httpx.HTTPError as e:
        raise EmailError("Could not reach Maileroo") from e
    if r.status_code != 200:
        raise EmailError(f"Maileroo returned {r.status_code}: {r.text[:200]}")
    try:
        ok = r.json().get("success", True)
    except ValueError:
        ok = True
    if not ok:
        raise EmailError(f"Maileroo rejected the email: {r.text[:200]}")


PROVIDERS = {"log": _send_log, "maileroo": _send_maileroo}


def send_once(pool, *, dedupe_key: str, to_email: str, subject: str, text: str,
              ticket_id: int | None = None) -> str:
    """Returns: 'sent' | 'already_sent' | 'failed'. Kabhi exception nahi uchhalta.
    Order: (1) row banao  (2) row ko 'sending' claim karo, sirf ek jeetega  (3) bhejo  (4) result likho."""
    provider = settings.email_provider
    try:
        with pool.connection() as conn:
            conn.execute(
                "insert into email_outbox (dedupe_key, ticket_id, to_email, subject, body, provider) "
                "values (%s, %s, %s, %s, %s, %s) on conflict (dedupe_key) do nothing",
                (dedupe_key, ticket_id, to_email, subject, text, provider))
            claimed = conn.execute(
                "update email_outbox set status='sending', attempts=attempts+1 "
                "where dedupe_key=%s and status in ('pending','failed') returning id",
                (dedupe_key,)).fetchone()
        if claimed is None:
            return "already_sent"            # sent ho chuka hai ya koi aur bhej raha hai

        error = None
        send = PROVIDERS.get(provider)
        try:
            if send is None:
                raise EmailError(f"Unknown email provider: {provider}")
            send(to_email, subject, text)
        except EmailError as e:
            error = str(e)

        with pool.connection() as conn:
            if error is None:
                conn.execute("update email_outbox set status='sent', sent_at=now(), error=null where id=%s",
                             (claimed["id"],))
            else:
                conn.execute("update email_outbox set status='failed', error=%s where id=%s",
                             (error, claimed["id"]))
                if ticket_id is not None:
                    conn.execute(
                        "insert into ticket_events (ticket_id, kind, actor, data) values (%s, 'email_failed', 'system', %s)",
                        (ticket_id, Jsonb({"dedupe_key": dedupe_key, "to_email": to_email, "subject": subject, "error": error})),
                    )
        if error:
            log.error("EMAIL DELIVERY FAILED for %s (to=%s, ticket_id=%s): %s", dedupe_key, to_email, ticket_id, error)
            return "failed"
        return "sent"
    except Exception:
        log.exception("email step crashed for %s", dedupe_key)
        return "failed"