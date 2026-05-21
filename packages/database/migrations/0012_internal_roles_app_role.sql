-- Add expanded internal RBAC values to the canonical app_role enum.
-- This migration is backwards-compatible and safe to apply after existing production schema.

do $$
begin
  alter type app_role add value if not exists 'admin';
  alter type app_role add value if not exists 'operator';
  alter type app_role add value if not exists 'analyst';
  alter type app_role add value if not exists 'super_admin';
exception
  when undefined_object then null;
end $$;
