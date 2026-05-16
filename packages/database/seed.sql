insert into prompt_versions (
  label,
  system_prompt,
  user_prompt_template,
  scoring_weights,
  active,
  created_by,
  notes
)
values (
  'v1-default-mca-qualification',
  'You are Operion AI Qualification Agent. Return strict JSON only.',
  'Evaluate this business funding lead and return {"score":number,"tier":"A|B|C|D","reason":"string"}: {{lead_json}}',
  '{"revenue":30,"time_in_business":25,"industry":20,"contact":15,"location":10}'::jsonb,
  true,
  'system',
  'Initial MVP v1 prompt. Tune only through Prompt Manager.'
)
on conflict do nothing;

insert into lenders (
  company_name,
  contact_email,
  webhook_url,
  criteria_industries,
  criteria_min_revenue,
  criteria_max_revenue,
  price_per_lead,
  active,
  whitelisted
)
values
  ('Founding Capital Partner', 'ops@example-lender.com', null, array['restaurant','construction','retail'], 250000, 5000000, 75, true, true),
  ('Growth Funding Desk', 'intake@example-lender.com', null, array['healthcare','professional services','retail'], 400000, 8000000, 95, true, false)
on conflict do nothing;
