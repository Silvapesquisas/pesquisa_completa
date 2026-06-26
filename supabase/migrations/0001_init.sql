-- ============================================================================
-- Entrevista Pro — Esquema inicial (migração do Base44 para Supabase)
-- Cria tabelas, índices, gatilhos de timestamp, perfil de usuário e bucket de áudio.
-- As regras de segurança (RLS) ficam em 0002_rls.sql.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------- Empresas ----------
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_email text not null,
  plan text not null default 'basico',
  max_interviewers integer not null default 5,        -- usuários externos (4–25), só super-admin altera
  max_interviews_per_month integer,                   -- null = ilimitado, só super-admin altera
  active boolean not null default true,
  logo_url text,
  phone text,
  cnpj text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

-- ---------- Usuários do painel (perfil ligado ao auth.users) ----------
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'entrevistador' check (role in ('admin','supervisor','entrevistador')),
  active boolean not null default true,
  company_id uuid references public.companies(id) on delete set null,
  is_super_admin boolean not null default false,      -- acesso global à plataforma
  region text,
  phone text,
  assigned_survey_ids text[] not null default '{}',
  notes text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

-- ---------- Entrevistadores de campo (login por código, sem conta) ----------
create table if not exists public.field_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null default 'entrevistador',
  access_code text not null unique,                   -- 8 dígitos
  company_id uuid not null references public.companies(id) on delete cascade,
  company_name text,
  active boolean not null default true,
  region text,
  phone text,
  assigned_survey_ids text[] not null default '{}',
  survey_interview_limits jsonb not null default '{}'::jsonb,
  notes text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

-- ---------- Pesquisas ----------
create table if not exists public.surveys (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text not null default 'urbano',
  status text not null default 'rascunho',
  company_id uuid references public.companies(id) on delete cascade,
  created_by_name text,
  questions jsonb not null default '[]'::jsonb,        -- inclui skip_logic, depends_on, options
  target_interviews integer,
  max_interviews_per_interviewer integer,
  start_date date,
  end_date date,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

-- ---------- Versões de pesquisa (histórico imutável) ----------
create table if not exists public.survey_versions (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  version_number integer,
  title text,
  snapshot jsonb not null,
  created_by_name text,
  note text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

-- ---------- Entrevistas ----------
create table if not exists public.interviews (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid references public.surveys(id) on delete set null,
  survey_title text,
  interviewer_id uuid,
  field_user_id uuid references public.field_users(id) on delete set null,
  interviewer_name text,
  company_id uuid references public.companies(id) on delete cascade,
  status text not null default 'em_andamento' check (status in ('em_andamento','concluida','revisao')),
  answers jsonb not null default '[]'::jsonb,
  latitude double precision,
  longitude double precision,
  location_accuracy double precision,
  location_address text,
  audio_url text,
  audio_duration double precision,
  completed_at timestamptz,
  notes text,
  edit_history jsonb not null default '[]'::jsonb,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

-- ---------- Notificações ----------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  company_id uuid references public.companies(id) on delete cascade,
  type text not null default 'system',
  title text not null,
  message text not null,
  read boolean not null default false,
  link_page text,
  link_id text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

-- ---------- Índices ----------
create index if not exists idx_users_company on public.users(company_id);
create index if not exists idx_field_users_company on public.field_users(company_id);
create index if not exists idx_field_users_code on public.field_users(access_code);
create index if not exists idx_surveys_company on public.surveys(company_id);
create index if not exists idx_surveys_status on public.surveys(status);
create index if not exists idx_survey_versions_survey on public.survey_versions(survey_id);
create index if not exists idx_interviews_company on public.interviews(company_id);
create index if not exists idx_interviews_field_user on public.interviews(field_user_id);
create index if not exists idx_interviews_survey on public.interviews(survey_id);
create index if not exists idx_notifications_email on public.notifications(user_email);

-- ---------- Gatilho: atualizar updated_date ----------
create or replace function public.set_updated_date()
returns trigger language plpgsql as $$
begin
  new.updated_date = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['companies','users','field_users','surveys','survey_versions','interviews','notifications']
  loop
    execute format('drop trigger if exists set_updated_date on public.%I', t);
    execute format('create trigger set_updated_date before update on public.%I for each row execute function public.set_updated_date()', t);
  end loop;
end $$;

-- ---------- Perfil automático ao criar usuário no Auth ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Storage: bucket de áudio (leitura pública para tocar no app) ----------
insert into storage.buckets (id, name, public)
values ('audio', 'audio', true)
on conflict (id) do nothing;
