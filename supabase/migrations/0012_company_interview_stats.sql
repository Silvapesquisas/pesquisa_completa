-- Contador de entrevistas por empresa (mês corrente e total).
-- SECURITY INVOKER: roda com as permissões de quem chama, então o RLS de
-- interviews continua valendo — admin vê só a própria empresa, super-admin vê
-- todas. Evita trazer as entrevistas inteiras para o navegador só para contar.
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
        and coalesce(i.completed_at, i.created_date) >= date_trunc('month', now())
    ) as used_this_month,
    count(*) as total
  from public.interviews i
  group by i.company_id
$$;

revoke all on function public.company_interview_stats() from public, anon;
grant execute on function public.company_interview_stats() to authenticated;
