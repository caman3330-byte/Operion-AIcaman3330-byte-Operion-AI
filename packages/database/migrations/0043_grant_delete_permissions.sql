-- Grant DELETE permission to service_role for safe deletion of test data
GRANT DELETE ON public.acquisition_prospects TO service_role;
GRANT DELETE ON public.acquisition_import_batches TO service_role;
