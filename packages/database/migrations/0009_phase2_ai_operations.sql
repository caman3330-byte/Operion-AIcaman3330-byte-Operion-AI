-- Operion AI Phase 2 AI operations and lifecycle additions.
-- Apply after 0008_production_mca_platform.sql.

alter type lead_status add value if not exists 'reviewed';
alter type lead_status add value if not exists 'routed';

alter type business_application_status add value if not exists 'raw';
alter type business_application_status add value if not exists 'reviewed';
alter type business_application_status add value if not exists 'routed';

alter type ai_task_type add value if not exists 'lead_extraction';
alter type ai_task_type add value if not exists 'customer_support';
alter type ai_task_type add value if not exists 'crm_activity';
alter type ai_task_type add value if not exists 'executive_summary';

create index if not exists idx_ai_tasks_assigned_status on ai_tasks(assigned_agent, status, created_at desc);
create index if not exists idx_ai_tasks_type_status on ai_tasks(task_type, status, created_at desc);
create index if not exists idx_business_applications_status_updated on business_applications(status, updated_at desc);

insert into agent_departments (department_key, name, type, manager_agent_key, description)
values
  ('ai_operations', 'AI Operations', 'operations', 'executive_manager_agent', 'Owns provider routing, AI task execution, cost control, and model observability.')
on conflict (department_key) do update set
  name = excluded.name,
  type = excluded.type,
  manager_agent_key = excluded.manager_agent_key,
  description = excluded.description,
  active = true,
  updated_at = now();

insert into agent_definitions (
  department_key,
  agent_key,
  name,
  role,
  manager_agent_key,
  purpose,
  owns,
  constraints,
  tools,
  escalation_triggers,
  status
)
values
  (
    'ai_operations',
    'ai_task_dispatcher_agent',
    'AI Task Dispatcher Agent',
    'specialist',
    'operations_manager_agent',
    'Claims queued AI tasks, routes them to the correct provider, records outputs, and escalates failures.',
    '["ai_tasks","ai_task_logs","api_usage_logs","provider routing"]'::jsonb,
    '["Never executes unapproved outbound actions","Stops after configured retries","Logs every provider decision"]'::jsonb,
    '["openai","anthropic","ai_tasks","audit_logs"]'::jsonb,
    '["provider failure","cost threshold","schema validation failure"]'::jsonb,
    'active'
  ),
  (
    'support',
    'support_agent',
    'Support Agent',
    'specialist',
    'customer_support_agent',
    'Handles customer support classification, response drafting, and escalation preparation.',
    '["support triage","customer reply drafts","account issue classification"]'::jsonb,
    '["No legal or financial advice","Escalates sensitive or regulated customer issues"]'::jsonb,
    '["openai","alerts","agent_messages"]'::jsonb,
    '["angry customer","legal concern","data request","funding complaint"]'::jsonb,
    'active'
  )
on conflict (agent_key) do update set
  department_key = excluded.department_key,
  name = excluded.name,
  role = excluded.role,
  manager_agent_key = excluded.manager_agent_key,
  purpose = excluded.purpose,
  owns = excluded.owns,
  constraints = excluded.constraints,
  tools = excluded.tools,
  escalation_triggers = excluded.escalation_triggers,
  status = 'active',
  updated_at = now();

insert into workflow_routes (
  workflow_key,
  name,
  trigger_type,
  department_key,
  primary_agent_key,
  fallback_agent_key,
  requires_approval,
  approval_policy,
  active
)
values
  ('ai_task_dispatch', 'AI Task Dispatch', 'api_or_worker', 'ai_operations', 'ai_task_dispatcher_agent', 'operations_manager_agent', false, '{}'::jsonb, true),
  ('crm_activity_generation', 'CRM Activity Generation', 'api_or_worker', 'support', 'support_agent', 'customer_support_agent', false, '{}'::jsonb, true),
  ('executive_summary_generation', 'Executive Summary Generation', 'api_or_worker', 'executive', 'executive_manager_agent', 'operations_manager_agent', false, '{}'::jsonb, true)
on conflict (workflow_key) do update set
  name = excluded.name,
  trigger_type = excluded.trigger_type,
  department_key = excluded.department_key,
  primary_agent_key = excluded.primary_agent_key,
  fallback_agent_key = excluded.fallback_agent_key,
  requires_approval = excluded.requires_approval,
  approval_policy = excluded.approval_policy,
  active = true,
  updated_at = now();
