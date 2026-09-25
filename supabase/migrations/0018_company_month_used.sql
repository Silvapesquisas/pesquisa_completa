-- Entrevistas concluídas no mês corrente (horário de Brasília) de UMA empresa.
--
-- O envio pelo App de Campo contava o uso da cota mensal buscando as linhas e
-- contando no código. O Supabase devolve no máximo 1000 linhas por consulta,
-- então acima disso a contagem ficava errada e a cota deixava de ser aplicada.
-- A contagem agora é feita no banco, com o mesmo corte de mês de
-- company_interview_stats (0013).
create or replace function public.company_month_used(p_company_id uuid)
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)
  from public.interviews i
  where i.company_id = p_company_id
    and i.status = 'concluida'
    and coalesce(i.completed_at, i.created_date) >=
        (date_trunc('month', now() at time zone 'America/Sao_Paulo')
         at time zone 'America/Sao_Paulo')
$$;

-- Uso exclusivo das Edge Functions (service role).
revoke all on function public.company_month_used(uuid) from public, anon, authenticated;
grant execute on function public.company_month_used(uuid) to service_role;
