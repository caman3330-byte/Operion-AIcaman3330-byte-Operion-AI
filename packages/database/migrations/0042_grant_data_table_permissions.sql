-- Grant SELECT on acquisition_prospects to service_role for view execution
-- This is required because data_prospect_records view has security_invoker=true
-- which means it runs with the invoker's permissions

GRANT SELECT ON public.acquisition_prospects TO service_role;
GRANT SELECT ON public.acquisition_import_batches TO service_role;

-- Also grant to authenticated role for frontend access
GRANT SELECT ON public.acquisition_prospects TO authenticated;
GRANT SELECT ON public.acquisition_import_batches TO authenticated;
