create table if not exists email_outbox(
    id bigserial primary key,
    dedupe_key text not null unique,        -- "ticket:1042:resolved_by_ai": ek baat ka ek email
    ticket_id bigint references tickets(id) on delete cascade,
    to_email text not null,
    subject text not null,
    body text not null,
    provider text not null,
    status text not null default 'pending' check (status in ('pending','sending','sent','failed')),
    attempts int not null default 0,
    error text,
    created_at timestamptz not null default now(),
    sent_at timestamptz
);

create index if not exists idx_email_outbox_ticket on email_outbox(ticket_id);