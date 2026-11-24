"""Customer ko jaane wali emails ka text. Body me wahi text hai jo chat me dikha,
taaki chat aur email kabhi alag baat na kahein."""

HUMAN_STATUSES = ("waiting_for_approval", "needs_human", "waiting_for_agent")


def for_status(ticket_id: int, status: str, reply_text: str) -> tuple[str, str] | None:
    """(subject, body) lautata hai, ya None agar is status par email nahi bhejni."""
    footer = f"\n\nTicket #{ticket_id}\nCloudNotes Support"
    if status == "resolved_by_ai":
        return (f"Update on your CloudNotes request #{ticket_id}", reply_text + footer)
    if status in HUMAN_STATUSES:
        return (f"We received your request #{ticket_id}", reply_text + footer)
    return None