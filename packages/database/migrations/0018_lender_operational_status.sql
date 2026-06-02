-- Lender operational status for controlled production readiness.
-- Separates founder approval state from whether a lender is usable for live routing.

alter table lenders add column if not exists lender_status text not null default 'pending_review';

update lenders
set lender_status = case
  when active = true and approval_status = 'approved' then 'active'
  when approval_status = 'approved' then 'approved'
  when active = false and approval_status = 'rejected' then 'suspended'
  else 'pending_review'
end
where lender_status is null or lender_status not in ('pending_review', 'approved', 'active', 'suspended');

do $$
begin
  alter table lenders add constraint lenders_lender_status_check check (
    lender_status in ('pending_review', 'approved', 'active', 'suspended')
  );
exception
  when duplicate_object then null;
end $$;

create index if not exists lenders_lender_status_idx on lenders (lender_status, created_at desc);
