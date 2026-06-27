-- =========================================================================
-- Hardening dos avisos do linter de segurança do Supabase
--  1) Helpers de RLS (auth_*) saem do schema 'public' (exposto pela API
--     PostgREST) para um schema 'private' NÃO exposto. Continuam
--     SECURITY DEFINER (necessário p/ evitar recursão de RLS em users) e o
--     papel 'authenticated' mantém EXECUTE -> o RLS continua funcionando,
--     mas deixa de existir /rest/v1/rpc/auth_*.
--  2) Funções usadas APENAS por triggers têm EXECUTE revogado de
--     public/anon/authenticated (o trigger dispara mesmo assim).
--  3) set_updated_date passa a ter search_path fixo.
-- =========================================================================

create schema if not exists private;
grant usage on schema private to authenticated, service_role;

-- 1) Helpers movidos para 'private'
create or replace function private.auth_company_id()
returns uuid language sql security definer stable set search_path = public as $$
  select company_id from public.users where id = auth.uid()
$$;
create or replace function private.auth_is_super_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce(is_super_admin, false) from public.users where id = auth.uid()
$$;
create or replace function private.auth_role()
returns text language sql security definer stable set search_path = public as $$
  select role from public.users where id = auth.uid()
$$;
revoke execute on function private.auth_company_id(), private.auth_is_super_admin(), private.auth_role() from public;
grant execute on function private.auth_company_id(), private.auth_is_super_admin(), private.auth_role() to authenticated, service_role;

-- 2) Repontar TODAS as políticas para private.auth_*
-- COMPANIES
drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies for select to authenticated
  using (id = private.auth_company_id() or private.auth_is_super_admin());
drop policy if exists companies_insert on public.companies;
create policy companies_insert on public.companies for insert to authenticated
  with check (private.auth_is_super_admin());
drop policy if exists companies_update on public.companies;
create policy companies_update on public.companies for update to authenticated
  using (private.auth_is_super_admin() or (id = private.auth_company_id() and private.auth_role() = 'admin'))
  with check (private.auth_is_super_admin() or (id = private.auth_company_id() and private.auth_role() = 'admin'));
drop policy if exists companies_delete on public.companies;
create policy companies_delete on public.companies for delete to authenticated
  using (private.auth_is_super_admin());

-- USERS
drop policy if exists users_select on public.users;
create policy users_select on public.users for select to authenticated
  using (id = auth.uid() or private.auth_is_super_admin()
    or (company_id = private.auth_company_id() and private.auth_role() in ('admin','supervisor')));
drop policy if exists users_insert on public.users;
create policy users_insert on public.users for insert to authenticated
  with check (private.auth_is_super_admin());
drop policy if exists users_update on public.users;
create policy users_update on public.users for update to authenticated
  using (id = auth.uid() or private.auth_is_super_admin()
    or (company_id = private.auth_company_id() and private.auth_role() = 'admin'))
  with check (id = auth.uid() or private.auth_is_super_admin()
    or (company_id = private.auth_company_id() and private.auth_role() = 'admin'));
drop policy if exists users_delete on public.users;
create policy users_delete on public.users for delete to authenticated
  using (id = auth.uid() or private.auth_is_super_admin());

-- FIELD_USERS
drop policy if exists field_users_select on public.field_users;
create policy field_users_select on public.field_users for select to authenticated
  using (company_id = private.auth_company_id() or private.auth_is_super_admin());
drop policy if exists field_users_cud on public.field_users;
create policy field_users_cud on public.field_users for all to authenticated
  using (private.auth_is_super_admin() or (company_id = private.auth_company_id() and private.auth_role() = 'admin'))
  with check (private.auth_is_super_admin() or (company_id = private.auth_company_id() and private.auth_role() = 'admin'));

-- SURVEYS
drop policy if exists surveys_select on public.surveys;
create policy surveys_select on public.surveys for select to authenticated
  using (company_id = private.auth_company_id() or private.auth_is_super_admin());
drop policy if exists surveys_insert on public.surveys;
create policy surveys_insert on public.surveys for insert to authenticated
  with check (private.auth_is_super_admin() or (company_id = private.auth_company_id() and private.auth_role() in ('admin','supervisor')));
drop policy if exists surveys_update on public.surveys;
create policy surveys_update on public.surveys for update to authenticated
  using (private.auth_is_super_admin() or (company_id = private.auth_company_id() and private.auth_role() in ('admin','supervisor')))
  with check (private.auth_is_super_admin() or (company_id = private.auth_company_id() and private.auth_role() in ('admin','supervisor')));
drop policy if exists surveys_delete on public.surveys;
create policy surveys_delete on public.surveys for delete to authenticated
  using (private.auth_is_super_admin() or (company_id = private.auth_company_id() and private.auth_role() = 'admin'));

-- SURVEY_VERSIONS
drop policy if exists sv_select on public.survey_versions;
create policy sv_select on public.survey_versions for select to authenticated
  using (company_id = private.auth_company_id() or private.auth_is_super_admin());
drop policy if exists sv_insert on public.survey_versions;
create policy sv_insert on public.survey_versions for insert to authenticated
  with check (private.auth_is_super_admin() or (company_id = private.auth_company_id() and private.auth_role() in ('admin','supervisor')));
drop policy if exists sv_delete on public.survey_versions;
create policy sv_delete on public.survey_versions for delete to authenticated
  using (private.auth_is_super_admin() or (company_id = private.auth_company_id() and private.auth_role() = 'admin'));

-- INTERVIEWS
drop policy if exists interviews_select on public.interviews;
create policy interviews_select on public.interviews for select to authenticated
  using (company_id = private.auth_company_id() or private.auth_is_super_admin());
drop policy if exists interviews_insert on public.interviews;
create policy interviews_insert on public.interviews for insert to authenticated
  with check (private.auth_is_super_admin() or (company_id = private.auth_company_id() and private.auth_role() in ('admin','supervisor')));
drop policy if exists interviews_update on public.interviews;
create policy interviews_update on public.interviews for update to authenticated
  using (private.auth_is_super_admin() or (company_id = private.auth_company_id() and private.auth_role() in ('admin','supervisor')))
  with check (private.auth_is_super_admin() or (company_id = private.auth_company_id() and private.auth_role() in ('admin','supervisor')));
drop policy if exists interviews_delete on public.interviews;
create policy interviews_delete on public.interviews for delete to authenticated
  using (private.auth_is_super_admin() or (company_id = private.auth_company_id() and private.auth_role() = 'admin'));

-- NOTIFICATIONS
drop policy if exists notif_select on public.notifications;
create policy notif_select on public.notifications for select to authenticated
  using (user_email = auth.email() or private.auth_is_super_admin());
drop policy if exists notif_insert on public.notifications;
create policy notif_insert on public.notifications for insert to authenticated
  with check (private.auth_is_super_admin() or (company_id = private.auth_company_id() and private.auth_role() in ('admin','supervisor')));
drop policy if exists notif_update on public.notifications;
create policy notif_update on public.notifications for update to authenticated
  using (user_email = auth.email()) with check (user_email = auth.email());
drop policy if exists notif_delete on public.notifications;
create policy notif_delete on public.notifications for delete to authenticated
  using (user_email = auth.email());

-- 3) Remover os helpers antigos do schema exposto (agora sem referências)
drop function if exists public.auth_company_id();
drop function if exists public.auth_is_super_admin();
drop function if exists public.auth_role();

-- 4) Recriar as funções de trigger de proteção de colunas usando private.auth_*
create or replace function public.protect_user_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if private.auth_is_super_admin() then return new; end if;
  if new.company_id is distinct from old.company_id
     or new.is_super_admin is distinct from old.is_super_admin then
    raise exception 'Sem permissão para alterar company_id/is_super_admin.';
  end if;
  if (new.role is distinct from old.role or new.active is distinct from old.active) then
    if not (private.auth_role() = 'admin' and old.company_id = private.auth_company_id()) then
      raise exception 'Sem permissão para alterar role/active.';
    end if;
  end if;
  return new;
end $$;

create or replace function public.protect_company_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if private.auth_is_super_admin() then return new; end if;
  if new.max_interviewers is distinct from old.max_interviewers
     or new.max_interviews_per_month is distinct from old.max_interviews_per_month then
    raise exception 'Apenas o super-admin pode alterar os limites da empresa.';
  end if;
  return new;
end $$;

create or replace function public.protect_interview_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if private.auth_is_super_admin() then return new; end if;
  if new.company_id is distinct from old.company_id
     or new.field_user_id is distinct from old.field_user_id then
    raise exception 'company_id/field_user_id são imutáveis.';
  end if;
  return new;
end $$;

-- 5) set_updated_date com search_path fixo
create or replace function public.set_updated_date()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_date = now();
  return new;
end $$;

-- 6) Revogar EXECUTE das funções usadas SOMENTE por triggers
revoke execute on function public.set_updated_date() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.protect_user_columns() from public, anon, authenticated;
revoke execute on function public.protect_company_columns() from public, anon, authenticated;
revoke execute on function public.protect_interview_columns() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
