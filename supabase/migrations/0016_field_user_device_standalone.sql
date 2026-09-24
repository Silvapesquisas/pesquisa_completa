-- Vínculo de aparelho: registra se o aparelho vinculado é o app instalado.
--
-- No iPhone, o app instalado na tela inicial tem armazenamento separado do
-- Safari. Quem entra primeiro pelo Safari e depois instala o app ganha um novo
-- identificador de aparelho — e era bloqueado como "outro celular".
--
-- Com esta coluna, o servidor permite UMA troca automática do vínculo
-- "Safari → app instalado" no mesmo tipo de aparelho (iPhone/iPad). Depois que o
-- vínculo passa a ser o app instalado, novas trocas voltam a exigir o gestor.

alter table public.field_users
  add column if not exists device_standalone boolean not null default false;

comment on column public.field_users.device_standalone is
  'true quando o aparelho vinculado é o app instalado (tela inicial), não o navegador.';
