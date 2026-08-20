-- Rate limiting das Edge Functions públicas (força bruta de código de campo e
-- spam de cadastro de empresa). Fica no schema private: inacessível pela API.
create table if not exists private.rate_limits (
  key           text primary key,
  count         int not null default 0,
  window_start  timestamptz not null default now(),
  blocked_until timestamptz
);

-- Conta uma tentativa e diz se ela é permitida. Atômico (bloqueio de linha),
-- para funcionar mesmo com várias instâncias da função rodando em paralelo.
create or replace function private.check_rate_limit(
  p_key text,
  p_limit int,
  p_window_seconds int,
  p_block_seconds int
) returns jsonb
language plpgsql
security definer
set search_path = private, public
as $$
declare
  rec private.rate_limits%rowtype;
  now_ts timestamptz := now();
begin
  -- Limpeza oportunista de registros velhos (evita crescimento da tabela).
  delete from private.rate_limits
   where window_start < now_ts - interval '1 day'
     and (blocked_until is null or blocked_until < now_ts);

  insert into private.rate_limits(key, count, window_start)
       values (p_key, 0, now_ts)
  on conflict (key) do nothing;

  select * into rec from private.rate_limits where key = p_key for update;

  -- Já bloqueado: nega sem contar de novo.
  if rec.blocked_until is not null and rec.blocked_until > now_ts then
    return jsonb_build_object(
      'allowed', false,
      'retry_after', ceil(extract(epoch from (rec.blocked_until - now_ts)))::int
    );
  end if;

  -- Janela expirou: reinicia a contagem.
  if rec.window_start + make_interval(secs => p_window_seconds) < now_ts then
    update private.rate_limits
       set count = 1, window_start = now_ts, blocked_until = null
     where key = p_key;
    return jsonb_build_object('allowed', true);
  end if;

  -- Estourou o limite dentro da janela: bloqueia por p_block_seconds.
  if rec.count + 1 > p_limit then
    update private.rate_limits
       set count = rec.count + 1,
           blocked_until = now_ts + make_interval(secs => p_block_seconds)
     where key = p_key;
    return jsonb_build_object('allowed', false, 'retry_after', p_block_seconds);
  end if;

  update private.rate_limits set count = rec.count + 1 where key = p_key;
  return jsonb_build_object('allowed', true);
end $$;

-- Zera o contador (ex.: após um login bem-sucedido).
create or replace function private.reset_rate_limit(p_key text)
returns void
language sql
security definer
set search_path = private, public
as $$ delete from private.rate_limits where key = p_key $$;

alter table private.rate_limits enable row level security;
revoke all on function private.check_rate_limit(text,int,int,int) from public, anon, authenticated;
revoke all on function private.reset_rate_limit(text) from public, anon, authenticated;

-- Wrappers em public para o backend chamar via RPC (a API só enxerga public).
-- O acesso é revogado de anon/authenticated: SOMENTE a service role executa.
create or replace function public.rl_check(
  p_key text, p_limit int, p_window_seconds int, p_block_seconds int
) returns jsonb
language sql
security definer
set search_path = private, public
as $$ select private.check_rate_limit(p_key, p_limit, p_window_seconds, p_block_seconds) $$;

create or replace function public.rl_reset(p_key text)
returns void
language sql
security definer
set search_path = private, public
as $$ select private.reset_rate_limit(p_key) $$;

revoke all on function public.rl_check(text,int,int,int) from public, anon, authenticated;
revoke all on function public.rl_reset(text) from public, anon, authenticated;
grant execute on function public.rl_check(text,int,int,int) to service_role;
grant execute on function public.rl_reset(text) to service_role;
