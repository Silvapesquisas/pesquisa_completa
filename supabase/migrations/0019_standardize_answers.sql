-- Padronização de respostas.
--
-- Respostas digitadas no campo chegam com grafias diferentes para a mesma coisa
-- ("Alex da Piatã", "alex piatan", "Alex da piatam "...). Esta função troca, em
-- todas as entrevistas de uma pesquisa, as grafias escolhidas pelo gestor por
-- uma única resposta padrão.
--
--  - security invoker: vale o RLS de interviews (só admin/supervisor da
--    empresa conseguem alterar; para os demais, nada muda e retorna 0);
--  - compara o texto EXATO de cada grafia (o painel envia os textos como estão
--    gravados, inclusive espaços), então nada além do que foi escolhido muda;
--  - múltipla escolha: troca dentro de answer_array e recompõe answer;
--  - cada entrevista alterada ganha um registro no histórico de edições.
create or replace function public.standardize_answers(
  p_survey_id uuid,
  p_question_ids text[],
  p_from text[],
  p_to text
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_to text := btrim(coalesce(p_to, ''));
  v_email text := auth.email();
  v_editor text;
  v_summary text;
  v_count integer := 0;
begin
  if v_to = '' then
    raise exception 'Informe a resposta padrão.';
  end if;
  if coalesce(array_length(p_from, 1), 0) = 0 or coalesce(array_length(p_question_ids, 1), 0) = 0 then
    return 0;
  end if;

  select coalesce(nullif(full_name, ''), email) into v_editor from public.users where id = auth.uid();
  v_summary := format('Padronização de resposta: %s → "%s"',
    (select string_agg(format('"%s"', btrim(f)), ', ') from unnest(p_from) f), v_to);

  with target as (
    select i.id,
      (select jsonb_agg(
          case
            when (a->>'question_id') <> all (p_question_ids) then a
            when jsonb_typeof(a->'answer_array') = 'array' and jsonb_array_length(a->'answer_array') > 0 then
              (select a || jsonb_build_object(
                        'answer_array', s.arr,
                        'answer', (select string_agg(x, ', ') from jsonb_array_elements_text(s.arr) x))
                 from (select jsonb_agg(case when e = any (p_from) then to_jsonb(v_to) else to_jsonb(e) end order by o) as arr
                         from jsonb_array_elements_text(a->'answer_array') with ordinality t(e, o)) s)
            when (a->>'answer') = any (p_from) then a || jsonb_build_object('answer', v_to)
            else a
          end order by ord)
         from jsonb_array_elements(i.answers) with ordinality q(a, ord)) as new_answers
    from public.interviews i
    where i.survey_id = p_survey_id
      and exists (
        select 1 from jsonb_array_elements(i.answers) a
        where (a->>'question_id') = any (p_question_ids)
          and ((a->>'answer') = any (p_from)
               or exists (select 1 from jsonb_array_elements_text(
                            case when jsonb_typeof(a->'answer_array') = 'array' then a->'answer_array' else '[]'::jsonb end) e
                          where e = any (p_from))))
  )
  update public.interviews i
     set answers = t.new_answers,
         edit_history = coalesce(i.edit_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
           'edited_at', now(),
           'edited_by', coalesce(v_email, 'desconhecido'),
           'edited_by_name', coalesce(v_editor, v_email, 'desconhecido'),
           'changes_summary', v_summary))
    from target t
   where i.id = t.id
     and t.new_answers is distinct from i.answers;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.standardize_answers(uuid, text[], text[], text) from public, anon;
grant execute on function public.standardize_answers(uuid, text[], text[], text) to authenticated;
