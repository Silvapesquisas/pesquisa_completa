-- Corte do mês no horário de Brasília, não em UTC.
-- Sem isso, uma entrevista feita no último dia do mês após as 21h (Brasília)
-- já era 1º do mês seguinte em UTC e caía na cota do mês errado.
create or replace function public.company_interview_stats()
returns table (company_id uuid, used_this_month bigint, total bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    i.company_id,
    count(*) filter (
      where i.status = 'concluida'
        and coalesce(i.completed_at, i.created_date) >=
            (date_trunc('month', now() at time zone 'America/Sao_Paulo')
             at time zone 'America/Sao_Paulo')
    ) as used_this_month,
    count(*) as total
  from public.interviews i
  group by i.company_id
$$;

revoke all on function public.company_interview_stats() from public, anon;
grant execute on function public.company_interview_stats() to authenticated;
