-- Vínculo de dispositivo do entrevistador: um código só funciona em UM celular
-- por vez. Impede que o mesmo código seja compartilhado entre várias pessoas
-- (o que também burlava o limite de usuários externos do plano).
--
-- device_id null = livre; o próximo aparelho que fizer login assume o vínculo.
-- O admin da empresa desvincula pela tela de Entrevistadores.
alter table public.field_users
  add column if not exists device_id       text,
  add column if not exists device_label    text,
  add column if not exists device_bound_at timestamptz,
  add column if not exists last_seen_at    timestamptz;

create index if not exists idx_field_users_device on public.field_users(device_id);

comment on column public.field_users.device_id is
  'Identificador do aparelho vinculado. Null = livre para o próximo aparelho que logar.';
