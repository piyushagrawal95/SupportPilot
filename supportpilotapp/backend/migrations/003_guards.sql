-- Execution time guards ke liye
alter table actions add column if not exists stripe_customer_id text;

create index if not exists idx_actions_customer_done on actions(stripe_customer_id,completed_at) where status='done';

--$500 daily cap lagne pr auto refunds band, jab tak admin wapas na chalaye
alter table settings add column if not exists auto_refunds_paused boolean not null default false;


