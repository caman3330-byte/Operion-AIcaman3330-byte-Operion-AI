do $$
begin
  alter type business_application_status add value if not exists 'needs_review';
exception
  when duplicate_object then null;
end $$;
