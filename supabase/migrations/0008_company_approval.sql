-- Aprovação de empresas (autocadastro pela tela de login).
-- status: 'pending' (aguardando), 'active' (aprovada), 'rejected' (reprovada).
-- Empresas existentes ficam 'active'. Só o super-admin altera o status.
alter table public.companies add column if not exists status text not null default 'active';
update public.companies set status = 'active' where status is null;

create or replace function public.protect_company_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;            -- service role / backend
  if private.auth_is_super_admin() then return new; end if;
  if new.max_interviewers is distinct from old.max_interviewers
     or new.max_interviews_per_month is distinct from old.max_interviews_per_month
     or new.status is distinct from old.status then
    raise exception 'Apenas o super-admin pode alterar limites/status da empresa.';
  end if;
  return new;
end $$;
