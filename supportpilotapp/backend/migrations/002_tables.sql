-- Customer Link (CloudNotes user <-> Stripe Customer)
create table if NOT EXISTS customers(
    id bigserial primary key,
    cloudnotes_user_id uuid  not null unique,   --Supabase login id (JWT se aata hai)
    email text,
    stripe_customer_id text unique,
    created_at timestamptz not null default now()
);

--staff users
create table if not exists staff_users(
    id bigserial primary key,
    auth_user_id uuid not null unique,          --staff ka supabase login id
    email text not null,
    name text,
    role text not null check ( role in('agent','approver','admin','viewer')),
    availability text not null default 'away' check (availability in ('available','away')),
    last_seen_at timestamptz,
    created_at timestamptz not null default now()

);

-- Extra columns in ticket
alter table tickets
    add column if not exists customer_id bigint references customers(id),
    add column if not exists assigned_agent_id bigint references staff_users(id),
    add column if not exists handoff_reason text,
    add column if not exists resolved_by text check (resolved_by in('ai','ai_after_approval','human')),
    add column if not exists ai_understanding jsonb,   --What AI understands
    add column if not exists flagged_wrong boolean not null default false;


create index if not exists idx_tickets_status on tickets(status,created_at desc);

--Chat messages
create table if not EXISTS messages(
    id bigserial primary key,
    ticket_id bigint not null references tickets(id) on delete cascade,
    sender text not null check (sender in('customer','ai','agent','system')),
    content text not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_messages_tickets on messages(ticket_id,created_at);

--Approvals
create table if not exists approvals(
    id bigserial primary key,
    ticket_id bigint not null references tickets(id) on delete cascade,
    action_type text not null check (action_type in ('refund','cancel_subscription')),
    stripe_charge_id text,
    amount_cents integer,
    evidence jsonb not null default '{}',
    ai_suggestion text,
    status text not null default 'pending' check (status in ('pending','approved','rejected','expired','cancelled')),
    token_hash text not null,           --email link token ka hash, asli token nahi
    expires_at timestamptz not null,
    decided_by bigint references staff_users(id),
    decision_reason text,
    decided_at timestamptz,
    created_at timestamptz not null default now()
);

--Ek charge ke liye ek hi pending approval
create unique index if not exists uq_pending_approval_per_charge on approvals(stripe_charge_id,action_type) where status='pending' and stripe_charge_id is not null;

--Actions(har asli kaam ka record)
create table if not EXISTS actions(
    id bigserial primary key,
    ticket_id bigint not null references tickets(id) on delete cascade,
    type text not null check (type in ('refund','cancel_subscription','send_update_card_link')),
    stripe_charge_id text,
    amount_cents integer,
    idempotency_key text not null unique,           --same kaam dobara nahi chalega
    status text not null default 'pending' check (status in('pending','done','failed')),
    executed_by text not null check (executed_by in ('ai_auto','ai_after_approval','human')),
    approval_id bigint references approvals(id),
    stripe_ref text,        --Stripe refund id
    error text,
    created_at timestamptz not null default now(),
    completed_at timestamptz
);

create index if not exists idx_actions_ticket on actions(ticket_id);
create index if not exists idx_actions_done_at on actions(completed_at) where status='done';

--Settings
create table if not exists settings(
    id int primary key default 1 check (id=1),
    ai_enabled boolean not null default true,           --kill switch
    watching_mode boolean not null default true,         --sirf suggest,act nahi
    auto_refund_limit_cents integer not null default 5000,   --50$
    daily_cap_cents integer not null default 50000,             --500$
    approver_emails text[] not null default '{}',
    auto_mode jsonb not null default '{"duplicate_charge":false,"cancellation":false,"failed_payment":false,"refund":false}',
    updated_at timestamptz not null default now()
);

insert into settings(id) values (1) on conflict do nothing;