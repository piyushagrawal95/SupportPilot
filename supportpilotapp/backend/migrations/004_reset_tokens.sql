-- Reset password token support for staff users
alter table staff_users add column if not exists reset_token_hash text;
alter table staff_users add column if not exists reset_token_expires_at timestamptz;
