# Pesquisa Completa

Plataforma de pesquisas de campo (multiempresa) com painel web de gestão e
app de campo para entrevistadores. Stack própria: **Supabase** (Postgres +
Auth + Edge Functions + Storage) no backend e **Vercel** (Vite + React) no
frontend.

## Funcionalidades

- **Painel** (super-admin / admin / supervisor / entrevistador): empresas,
  usuários, construtor de pesquisas (com banco de questões pronto, lógica de
  pular e questões condicionais), entrevistadores de campo, relatórios,
  mapas/heatmap e insights por IA.
- **App de campo** (`/FieldApp`): login por código de 8 dígitos, coleta
  offline com sincronização, GPS e áudio.
- **Isolamento por empresa** garantido por RLS no Postgres; o super-admin
  enxerga tudo. Entrevistadores de campo são anônimos e só acessam o backend
  pelas Edge Functions.

## Rodando localmente

```bash
npm install
npm run dev
```

Crie um arquivo `.env.local` na raiz com as variáveis do front:

```
VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua_anon_key
```

Scripts: `npm run dev` (dev), `npm run build` (build de produção),
`npm run preview`, `npm run lint`.

## Estrutura

- `src/pages/` — telas do painel e o app de campo (`FieldApp.jsx`)
- `src/components/` — componentes (UI, dashboard, relatórios, app de campo…)
- `src/api/supabaseClient.js` — cliente Supabase
- `src/api/base44Client.js` — camada de compatibilidade sobre o Supabase
  (mantém a API `base44.entities/auth/functions/integrations` usada pelas telas)
- `supabase/migrations/` — schema, RLS e hardening de segurança
- `supabase/functions/` — Edge Functions (login/envio do app de campo, etc.)

## Backend (Supabase) e deploy (Vercel)

O passo a passo completo de criação do projeto Supabase, aplicação das
migrations e RLS, publicação das Edge Functions, criação do primeiro
super-admin e deploy na Vercel está em **[MIGRACAO_SUPABASE.md](./MIGRACAO_SUPABASE.md)**.

Segurança: veja **[SECURITY.md](./SECURITY.md)**.
