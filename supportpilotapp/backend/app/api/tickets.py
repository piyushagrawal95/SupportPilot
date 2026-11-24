from typing import Literal
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.core.security import require_internal_key
from app.db.pool import pool

router=APIRouter(prefix="/tickets",tags=["tickets"], dependencies=[Depends(require_internal_key)])

class TicketCreate(BaseModel):
    source:Literal["chat","stripe_event"] ="chat"
    customer_ref:str | None=None
    use_case:Literal["duplicate_charge","cancellation","failed_payment","refund","dispute","unknown"] | None=None

@router.post("")
def create_ticket(body:TicketCreate):
    with pool.connection() as conn:
        ticket=conn.execute(
            "insert into tickets (source,customer_ref,use_case) values(%s,%s,%s) returning *",(body.source,body.customer_ref,body.use_case)
        ).fetchone()
        conn.execute("insert into ticket_events(ticket_id,kind,actor) values(%s, 'ticket_created','system')",(ticket["id"],))

    return ticket

@router.get("")
def list_tickets(status:str|None=None):
    with pool.connection() as conn:
        rows=conn.execute("select * from tickets where (%s::text is null or status=%s) order by created_at desc limit 1000",(status,status)).fetchall()

    return rows

