alter table merchant_acquisition_sources
  add column if not exists last_success_at timestamptz,
  add column if not exists last_new_lead_at timestamptz,
  add column if not exists consecutive_zero_yield integer not null default 0 check (consecutive_zero_yield >= 0),
  add column if not exists duplicate_rate numeric(5,2) not null default 0 check (duplicate_rate >= 0 and duplicate_rate <= 100),
  add column if not exists verified_rate numeric(5,2) not null default 0 check (verified_rate >= 0 and verified_rate <= 100),
  add column if not exists false_positive_rate numeric(5,2) not null default 0 check (false_positive_rate >= 0 and false_positive_rate <= 100);

create index if not exists idx_merchant_sources_last_success
on merchant_acquisition_sources(last_success_at desc nulls last);

create index if not exists idx_merchant_sources_last_new_lead
on merchant_acquisition_sources(last_new_lead_at desc nulls last);

create index if not exists idx_merchant_sources_adaptive_priority
on merchant_acquisition_sources(health_status, acquisition_yield_score desc, verified_rate desc, duplicate_rate asc);
