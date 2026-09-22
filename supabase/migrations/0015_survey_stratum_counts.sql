-- Contagem de entrevistas concluídas por grupo de estrato.
--
-- Alimenta as cotas do App de Campo: o entrevistador precisa saber quantas
-- entrevistas já existem em cada grupo (sexo, zona, faixa etária...) para
-- procurar quem ainda falta. A contagem é da pesquisa inteira, não do
-- entrevistador, porque a cota é do plano amostral.
--
-- Agregar no banco evita trafegar o jsonb de respostas de todas as entrevistas
-- até a função de borda a cada login.
--
-- SECURITY INVOKER (padrão): o RLS do chamador continua valendo. A função de
-- borda chama com service role, que já restringe as pesquisas à empresa do
-- entrevistador antes de passar os ids.

create or replace function public.survey_stratum_counts(p_survey_ids uuid[])
returns table (survey_id uuid, question_id text, answer text, total bigint)
language sql
stable
set search_path = public
as $$
  with stratum_questions as (
    select s.id as survey_id, (st ->> 'question_id') as question_id
    from public.surveys s,
         lateral jsonb_array_elements(coalesce(s.strata, '[]'::jsonb)) st
    where s.id = any(p_survey_ids)
      and nullif(st ->> 'question_id', '') is not null
  )
  select
    i.survey_id,
    q.question_id,
    -- Estratos são sempre questões de resposta única; `answer_array` só
    -- aparece em múltipla escolha, mas é lido como fallback por segurança.
    coalesce(nullif(a ->> 'answer', ''), a -> 'answer_array' ->> 0) as answer,
    count(*)::bigint as total
  from public.interviews i
  join stratum_questions q on q.survey_id = i.survey_id
  cross join lateral jsonb_array_elements(coalesce(i.answers, '[]'::jsonb)) a
  where i.status = 'concluida'
    and (a ->> 'question_id') = q.question_id
    and coalesce(nullif(a ->> 'answer', ''), a -> 'answer_array' ->> 0) is not null
  group by 1, 2, 3;
$$;

comment on function public.survey_stratum_counts(uuid[]) is
  'Entrevistas concluídas por resposta nas questões vinculadas a estratos, usado pelas cotas do App de Campo.';
