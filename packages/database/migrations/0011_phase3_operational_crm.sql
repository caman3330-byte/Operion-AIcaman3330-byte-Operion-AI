do $$
begin
  alter type business_application_status add value if not exists 'new_lead';
  alter type business_application_status add value if not exists 'onboarding';
  alter type business_application_status add value if not exists 'documents_pending';
  alter type business_application_status add value if not exists 'underwriting_review';
  alter type business_application_status add value if not exists 'inactive';
  alter type ai_task_type add value if not exists 'lead_extraction';
  alter type ai_task_type add value if not exists 'crm_activity';
  alter type ai_task_type add value if not exists 'customer_support';
  alter type ai_task_type add value if not exists 'executive_summary';
exception
  when duplicate_object then null;
end $$;
