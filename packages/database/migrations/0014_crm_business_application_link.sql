-- Link CRM activities to the production business_applications table without
-- removing the legacy applications relationship.

alter table crm_activities
  add column if not exists business_application_id uuid null references business_applications(id) on delete cascade;

create index if not exists idx_crm_activities_business_application_id
  on crm_activities(business_application_id, created_at desc)
  where business_application_id is not null;
