-- Free-first founder acquisition sources.
-- Uses existing lead_sources and acquisition_jobs objects; no schema rewrite.

insert into lead_sources (source_key, name, source_type, description, config)
values
  ('company_websites', 'Company Websites', 'website', 'Founder-approved public company websites.', '{"free_first":true,"robots_respected":true}'::jsonb),
  ('public_business_directories', 'Public Business Directories', 'directory', 'Founder-approved publicly accessible business directory pages.', '{"free_first":true,"robots_respected":true}'::jsonb),
  ('chamber_directories', 'Chamber of Commerce Directories', 'directory', 'Founder-approved public Chamber of Commerce directories.', '{"free_first":true,"robots_respected":true}'::jsonb),
  ('industry_associations', 'Industry Association Directories', 'directory', 'Founder-approved public industry association directories.', '{"free_first":true,"robots_respected":true}'::jsonb),
  ('public_local_listings', 'Public Local Business Listings', 'directory', 'Founder-approved public local business listing pages.', '{"free_first":true,"robots_respected":true}'::jsonb),
  ('google_places', 'Google Places (Future Optional)', 'google_maps', 'Disabled placeholder for a future optional paid source adapter.', '{"enabled":false,"placeholder":true}'::jsonb)
on conflict (source_key) do update set
  name = excluded.name,
  source_type = excluded.source_type,
  description = excluded.description,
  config = excluded.config,
  active = true,
  updated_at = now();
