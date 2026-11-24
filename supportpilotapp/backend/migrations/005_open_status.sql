alter table tickets drop constraint if exists tickets_status_check;
alter table tickets add constraint tickets_status_check check (status in('open','resolved_by_ai','waiting_for_approval','waiting_for_agent','needs_human','waiting_for_customer','closed'));
