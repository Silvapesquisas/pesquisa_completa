-- ============================================================================
-- Entrevista Pro — Segurança (RLS) no Supabase/Postgres
--
-- Modelo (igual ao desenhado no Base44):
--  • Cada usuário só acessa dados da própria empresa (company_id).
--  • Super-admin (users.is_super_admin) tem acesso global.
--  • Entrevistadores de campo são ANÔNIMOS: não têm acesso direto às tabelas.
--    Todo o acesso deles passa pelas Edge Functions, que usam a service role
--    (a service role IGNORA o RLS) e validam o código de acesso no servidor.
--  • Proteções de coluna (quem pode mudar role/limite/company_id) são feitas
--    por gatilhos, pois o RLS do Postgres é por linha, não por coluna.
-- ============================================================================

-- ---------- Helpers (SECURITY DEFINER evita recursão de RLS na tabela users) ----------
create or replace function public.auth_company_id()
returns uuid language sql security definer stable set search_path = public as $$
  select company_id from public.users where id = auth.uid()
$$;

create or replace function public.auth_is_super_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce(is_super_admin, false) from public.users where id = auth.uid()
$$;

create or replace function public.auth_role()
returns text language sql security definer stable set search_path = public as $$
  select role from public.users where id = auth.uid()
$$;

-- ---------- Habilita RLS (sem políticas para anon => acesso negado por padrão) ----------
alter table public.companies       enable row level security;
alter table public.users           enable row level security;
alter table public.field_users     enable row level security;
alter table public.surveys         enable row level security;
alter table public.survey_versions enable row level security;
alter table public.interviews      enable row level security;
alter table public.notifications   enable row level security;

-- ============================ COMPANIES ============================
drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies for select to authenticated
  using (id = public.auth_company_id() or public.auth_is_super_admin());

drop policy if exists companies_insert on public.companies;
create policy companies_insert on public.companies for insert to authenticated
  with check (public.auth_is_super_admin());

drop policy if exists companies_update on public.companies;
create policy companies_update on public.companies for update to authenticated
  using (public.auth_is_super_admin() or (id = public.auth_company_id() and public.auth_role() = 'admin'))
  with check (public.auth_is_super_admin() or (id = public.auth_company_id() and public.auth_role() = 'admin'));

drop policy if exists companies_delete on public.companies;
create policy companies_delete on public.companies for delete to authenticated
  using (public.auth_is_super_admin());

-- ============================ USERS ============================
drop policy if exists users_select on public.users;
create policy users_select on public.users for select to authenticated
  using (
    id = auth.uid()
    or public.auth_is_super_admin()
    or (company_id = public.auth_company_id() and public.auth_role() in ('admin','supervisor'))
  );

drop policy if exists users_insert on public.users;
create policy users_insert on public.users for insert to authenticated
  with check (public.auth_is_super_admin());

drop policy if exists users_update on public.users;
create policy users_update on public.users for update to authenticated
  using (
    id = auth.uid()
    or public.auth_is_super_admin()
    or (company_id = public.auth_company_id() and public.auth_role() = 'admin')
  )
  with check (
    id = auth.uid()
    or public.auth_is_super_admin()
    or (company_id = public.auth_company_id() and public.auth_role() = 'admin')
  );

drop policy if exists users_delete on public.users;
create policy users_delete on public.users for delete to authenticated
  using (id = auth.uid() or public.auth_is_super_admin());

-- ============================ FIELD_USERS ============================
drop policy if exists field_users_select on public.field_users;
create policy field_users_select on public.field_users for select to authenticated
  using (company_id = public.auth_company_id() or public.auth_is_super_admin());

drop policy if exists field_users_cud on public.field_users;
create policy field_users_cud on public.field_users for all to authenticated
  using (public.auth_is_super_admin() or (company_id = public.auth_company_id() and public.auth_role() = 'admin'))
  with check (public.auth_is_super_admin() or (company_id = public.auth_company_id() and public.auth_role() = 'admin'));

-- ============================ SURVEYS ============================
drop policy if exists surveys_select on public.surveys;
create policy surveys_select on public.surveys for select to authenticated
  using (company_id = public.auth_company_id() or public.auth_is_super_admin());

drop policy if exists surveys_insert on public.surveys;
create policy surveys_insert on public.surveys for insert to authenticated
  with check (public.auth_is_super_admin() or (company_id = public.auth_company_id() and public.auth_role() in ('admin','supervisor')));

drop policy if exists surveys_update on public.surveys;
create policy surveys_update on public.surveys for update to authenticated
  using (public.auth_is_super_admin() or (company_id = public.auth_company_id() and public.auth_role() in ('admin','supervisor')))
  with check (public.auth_is_super_admin() or (company_id = public.auth_company_id() and public.auth_role() in ('admin','supervisor')));

drop policy if exists surveys_delete on public.surveys;
create policy surveys_delete on public.surveys for delete to authenticated
  using (public.auth_is_super_admin() or (company_id = public.auth_company_id() and public.auth_role() = 'admin'));

-- ============================ SURVEY_VERSIONS ============================
drop policy if exists sv_select on public.survey_versions;
create policy sv_select on public.survey_versions for select to authenticated
  using (company_id = public.auth_company_id() or public.auth_is_super_admin());

drop policy if exists sv_insert on public.survey_versions;
create policy sv_insert on public.survey_versions for insert to authenticated
  with check (public.auth_is_super_admin() or (company_id = public.auth_company_id() and public.auth_role() in ('admin','supervisor')));

drop policy if exists sv_delete on public.survey_versions;
create policy sv_delete on public.survey_versions for delete to authenticated
  using (public.auth_is_super_admin() or (company_id = public.auth_company_id() and public.auth_role() = 'admin'));
-- (sem política de UPDATE => versões são imutáveis)

-- ============================ INTERVIEWS ============================
drop policy if exists interviews_select on public.interviews;
create policy interviews_select on public.interviews for select to authenticated
  using (company_id = public.auth_company_id() or public.auth_is_super_admin());

drop policy if exists interviews_insert on public.interviews;
create policy interviews_insert on public.interviews for insert to authenticated
  with check (public.auth_is_super_admin() or (company_id = public.auth_company_id() and public.auth_role() in ('admin','supervisor')));

drop policy if exists interviews_update on public.interviews;
create policy interviews_update on public.interviews for update to authenticated
  using (public.auth_is_super_admin() or (company_id = public.auth_company_id() and public.auth_role() in ('admin','supervisor')))
  with check (public.auth_is_super_admin() or (company_id = public.auth_company_id() and public.auth_role() in ('admin','supervisor')));

drop policy if exists interviews_delete on public.interviews;
create policy interviews_delete on public.interviews for delete to authenticated
  using (public.auth_is_super_admin() or (company_id = public.auth_company_id() and public.auth_role() = 'admin'));

-- ============================ NOTIFICATIONS ============================
drop policy if exists notif_select on public.notifications;
create policy notif_select on public.notifications for select to authenticated
  using (user_email = auth.email() or public.auth_is_super_admin());

drop policy if exists notif_insert on public.notifications;
create policy notif_insert on public.notifications for insert to authenticated
  with check (public.auth_is_super_admin() or (company_id = public.auth_company_id() and public.auth_role() in ('admin','supervisor')));

drop policy if exists notif_update on public.notifications;
create policy notif_update on public.notifications for update to authenticated
  using (user_email = auth.email()) with check (user_email = auth.email());

drop policy if exists notif_delete on public.notifications;
create policy notif_delete on public.notifications for delete to authenticated
  using (user_email = auth.email());

-- ============================================================================
-- Proteção de COLUNAS (equivalente ao field-level security do Base44).
-- A service role tem auth.uid() = null => liberada (backend confiável).
-- ============================================================================

-- users: ninguém muda company_id/is_super_admin (exceto super-admin);
-- role/active só admin da mesma empresa.
create or replace function public.protect_user_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;            -- service role / backend
  if public.auth_is_super_admin() then return new; end if;
  if new.company_id is distinct from old.company_id
     or new.is_super_admin is distinct from old.is_super_admin then
    raise exception 'Sem permissão para alterar company_id/is_super_admin.';
  end if;
  if (new.role is distinct from old.role or new.active is distinct from old.active) then
    if not (public.auth_role() = 'admin' and old.company_id = public.auth_company_id()) then
      raise exception 'Sem permissão para alterar role/active.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists protect_user_columns on public.users;
create trigger protect_user_columns before update on public.users
  for each row execute function public.protect_user_columns();

-- companies: limites (max_interviewers / max_interviews_per_month) só super-admin.
create or replace function public.protect_company_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if public.auth_is_super_admin() then return new; end if;
  if new.max_interviewers is distinct from old.max_interviewers
     or new.max_interviews_per_month is distinct from old.max_interviews_per_month then
    raise exception 'Apenas o super-admin pode alterar os limites da empresa.';
  end if;
  return new;
end $$;
drop trigger if exists protect_company_columns on public.companies;
create trigger protect_company_columns before update on public.companies
  for each row execute function public.protect_company_columns();

-- interviews: company_id e field_user_id são imutáveis (definidos pelo backend).
create or replace function public.protect_interview_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if public.auth_is_super_admin() then return new; end if;
  if new.company_id is distinct from old.company_id
     or new.field_user_id is distinct from old.field_user_id then
    raise exception 'company_id/field_user_id são imutáveis.';
  end if;
  return new;
end $$;
drop trigger if exists protect_interview_columns on public.interviews;
create trigger protect_interview_columns before update on public.interviews
  for each row execute function public.protect_interview_columns();
