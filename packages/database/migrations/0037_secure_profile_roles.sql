-- Auth metadata is user-controlled. Profile roles may only be assigned by a trusted
-- server/service-role workflow after account creation, never by a browser session.
create or replace function public.handle_new_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone, role)
  values (
    new.id,
    coalesce(new.email, ''),
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone',
    'customer'::app_role
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    phone = coalesce(excluded.phone, public.profiles.phone),
    updated_at = now();
  return new;
end;
$$;

-- The auth trigger owns profile creation. A user can update their own non-role fields,
-- but cannot promote or demote themselves.
drop policy if exists "profiles_self_insert" on public.profiles;
drop policy if exists "profiles_self_update" on public.profiles;
drop policy if exists "profiles_self_update_without_role_change" on public.profiles;
create policy "profiles_self_update_without_role_change" on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid() and role = public.current_app_role());

-- The old policy used a tautology, granting every signed-in user
-- administrative access to this table.
drop policy if exists "admin_manage_self_or_internal" on public.admin_users;
drop policy if exists "internal_manage_admin_users" on public.admin_users;
create policy "internal_manage_admin_users" on public.admin_users
for all to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());
