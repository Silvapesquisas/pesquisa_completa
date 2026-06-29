-- O PLANO da empresa passa a ser protegido: só o super-admin pode alterar
-- (a empresa pode solicitar a mudança, mas não trocar por conta própria).
create or replace function public.protect_company_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;            -- service role / backend
  if private.auth_is_super_admin() then return new; end if;
  if new.max_interviewers is distinct from old.max_interviewers
     or new.max_interviews_per_month is distinct from old.max_interviews_per_month
     or new.plan is distinct from old.plan
     or new.status is distinct from old.status then
    raise exception 'Apenas o super-admin pode alterar plano/limites/status da empresa.';
  end if;
  return new;
end $$;
