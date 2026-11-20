create table if not exists tickets(
    id bigserial primary key,
    source text not null check (source in ('chat','stripe_event')),
    customer_ref text,               -- User Id of CloudNotes (login se milta hai, chat se nahi)
    stripe_customer_id text,
    use_case text check (use_case in ('duplicate_charge','cancellation','failed_payment','refund','dispute','unknown')),
    status text not null default 'needs_human' check (status in('resolved_by_ai','waiting_for_approval','waiting_for_agent','needs_human','waiting_for_customer','closed')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
)

-- Table for tickets Timeline
create table if not exists ticket_events(
    id bigserial primary key,
    ticket_id bigint not null references tickets(id) on delete cascade,
    kind text not null,      --'message','fact_checked','rule_decision','action_done','approval' ..
    actor text not null,     --'customer','ai','human:<id>','system'
    data jsonb not null default '{}',
    created_at timestamptz not null default now(),
);

create index if not exists idx_ticket_events_ticket on ticket_events(ticket_id,created_at)

--Table for stripe webhook events
create table if not exists stripe_events(
    event_id text primary key,
    type text not null,
    payload  jsonb not null,
    processed_at timestamptz,
    received_at timestamptz not null default now()
)