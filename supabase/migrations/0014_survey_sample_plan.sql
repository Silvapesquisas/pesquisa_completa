-- Plano amostral da pesquisa.
--
-- Até aqui a margem de erro era calculada só a partir da meta de entrevistas,
-- assumindo população infinita e amostra aleatória simples. Estas colunas
-- passam a guardar o universo (público-alvo), o nível de confiança, o efeito
-- de desenho e a estratificação planejada, permitindo:
--   1. calcular a margem de erro com correção de população finita;
--   2. dimensionar a amostra a partir de uma margem desejada;
--   3. comparar, no relatório final, a composição realizada com a do universo.

alter table public.surveys
  add column if not exists population_size integer,          -- universo/público-alvo (ex.: eleitorado)
  add column if not exists confidence_level numeric,          -- 90, 95 ou 99 (null = 95)
  add column if not exists design_effect numeric,             -- deff declarado (conglomeração); null = 1
  add column if not exists target_margin numeric,             -- margem de erro desejada, em p.p.
  add column if not exists strata jsonb not null default '[]'::jsonb;

-- Estrutura de `strata` (estratificação planejada):
-- [
--   {
--     "id": "uuid",
--     "label": "Sexo",
--     "question_id": "<id da questão que capta o estrato>",   -- opcional
--     "groups": [
--       { "label": "Masculino", "share": 48.5 },              -- % no universo
--       { "label": "Feminino",  "share": 51.5 }
--     ]
--   }
-- ]

comment on column public.surveys.population_size is 'Tamanho do universo/público-alvo, usado na correção de população finita.';
comment on column public.surveys.confidence_level is 'Nível de confiança em % (90, 95 ou 99). Nulo equivale a 95.';
comment on column public.surveys.design_effect is 'Efeito de desenho declarado (conglomeração). Nulo equivale a 1.';
comment on column public.surveys.target_margin is 'Margem de erro desejada, em pontos percentuais, usada no dimensionamento.';
comment on column public.surveys.strata is 'Estratificação planejada: grupos e sua participação (%) no universo.';
