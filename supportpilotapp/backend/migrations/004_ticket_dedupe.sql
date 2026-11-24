alter table tickets add column if not exists stripe_ref text;
create unique index if not exists uq_ticket_per_stripe_ref on tickets(use_case, stripe_ref) where stripe_ref is not null;