-- Idempotência do envio de entrevistas do app de campo: um id estável por
-- entrevista, gerado no aparelho, evita duplicar quando o reenvio acontece
-- após uma resposta perdida (timeout/queda de conexão).
alter table public.interviews add column if not exists client_uuid uuid;
create unique index if not exists interviews_client_uuid_key
  on public.interviews (client_uuid) where client_uuid is not null;
