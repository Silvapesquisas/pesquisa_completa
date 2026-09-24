-- Versão do questionário.
--
-- O App de Campo guarda uma cópia do questionário no celular para funcionar
-- sem internet. Para saber se a cópia está desatualizada, cada pesquisa passa
-- a ter um número de versão que SÓ muda quando as perguntas mudam (editar o
-- plano amostral, a meta ou o status não gera versão nova).
--
-- O número é mantido pelo banco: o valor enviado pelo painel é ignorado, então
-- duas abas salvando ao mesmo tempo, ou uma restauração de versão antiga, não
-- conseguem fazer o número andar para trás.
--
-- Cada entrevista registra a versão com que foi feita (interviews.survey_version),
-- para o relatório saber quais respostas vieram de qual questionário.

alter table public.surveys
  add column if not exists questions_version integer not null default 1,
  add column if not exists questions_updated_at timestamptz not null default now();

alter table public.interviews
  add column if not exists survey_version integer;

comment on column public.surveys.questions_version is
  'Versão do questionário; incrementada pelo banco a cada alteração em questions.';
comment on column public.surveys.questions_updated_at is
  'Quando as perguntas mudaram pela última vez.';
comment on column public.interviews.survey_version is
  'Versão do questionário (surveys.questions_version) usada na entrevista.';

create or replace function public.bump_survey_questions_version()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.questions_version := 1;
    new.questions_updated_at := now();
  elsif new.questions is distinct from old.questions then
    new.questions_version := old.questions_version + 1;
    new.questions_updated_at := now();
  else
    new.questions_version := old.questions_version;
    new.questions_updated_at := old.questions_updated_at;
  end if;
  return new;
end $$;

revoke execute on function public.bump_survey_questions_version() from public, anon, authenticated;

drop trigger if exists bump_survey_questions_version on public.surveys;
create trigger bump_survey_questions_version
  before insert or update on public.surveys
  for each row execute function public.bump_survey_questions_version();
