-- 008_approval_email.sql: Add approver_email to approvals table
alter table approvals add column if not exists approver_email text;
