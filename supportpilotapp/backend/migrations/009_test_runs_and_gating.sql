-- 009_test_runs_and_gating.sql
create table if not exists test_runs (
    id serial primary key,
    run_at timestamptz not null default now(),
    prompt_hash text not null,
    llm_model text not null,
    all_passed boolean not null default false,
    use_real_llm boolean not null default false,
    results jsonb not null default '[]'::jsonb,
    category_pass jsonb not null default '{}'::jsonb
);

alter table settings add column if not exists last_tested_prompt_hash text;
alter table settings add column if not exists last_tested_model text;
alter table settings add column if not exists test_results jsonb default '{}'::jsonb;
