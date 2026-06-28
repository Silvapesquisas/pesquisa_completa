-- Pesquisas que exigem gravação de áudio (entrevistas 100% auditáveis):
-- o app de campo não deixa concluir sem áudio quando require_audio = true.
alter table public.surveys add column if not exists require_audio boolean not null default false;
