# Migração Base44 → Supabase + Vercel

Este guia leva o app do Base44 para uma stack própria: **Supabase** (banco
Postgres + Auth + Edge Functions + Storage) e **Vercel** (frontend).

O código já está pronto no repositório:
- `supabase/migrations/` — schema do banco + RLS (segurança por empresa)
- `supabase/functions/` — 5 Edge Functions (login/envio do app de campo, etc.)
- `src/api/base44Client.js` — agora é uma camada que fala com o Supabase
  (as telas não mudaram; continuam usando `base44.entities...`)

---

## 1. Criar o projeto no Supabase

1. Crie um projeto em https://supabase.com (guarde a senha do banco).
2. Em **Project Settings → API**, copie:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public key** → `VITE_SUPABASE_ANON_KEY`

## 2. Aplicar o banco e a segurança (RLS)

No computador, com a [CLI do Supabase](https://supabase.com/docs/guides/cli):

```bash
npm install -g supabase
supabase login
cd pesquisa_completa
supabase link --project-ref SEU_PROJECT_REF   # o ref está na URL do projeto
supabase db push                               # aplica supabase/migrations/*
```

> Alternativa sem CLI: abra **SQL Editor** no painel do Supabase e cole o
> conteúdo de `0001_init.sql` e depois `0002_rls.sql`, nessa ordem.

## 3. Publicar as Edge Functions

```bash
supabase functions deploy fieldLogin
supabase functions deploy fieldSubmitInterview
supabase functions deploy createFieldUser
supabase functions deploy invokeLLM
supabase functions deploy inviteUser
```

Configure a chave da Anthropic (recursos de IA):

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

## 4. Criar o primeiro super-admin

1. No painel Supabase → **Authentication → Users → Add user**, crie seu
   usuário com e-mail e senha.
2. No **SQL Editor**, rode (troque pelo seu e-mail):

```sql
update public.users set is_super_admin = true, role = 'admin'
where email = 'voce@empresa.com';
```

Pronto: esse usuário enxerga e gerencia tudo (todas as empresas).

## 5. Publicar o frontend na Vercel

1. Importe o repositório em https://vercel.com (framework: **Vite**).
2. Em **Environment Variables**, adicione:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Deploy. O `vercel.json` já cuida das rotas (SPA).

## 6. Testar

- **Painel**: acesse a URL da Vercel → tela de login (e-mail/senha) → entre
  como super-admin → crie uma Empresa, vincule seu usuário, crie pesquisas e
  entrevistadores.
- **Isolamento**: logado como usuário de uma empresa, no console:
  `await (await import('/src/api/supabaseClient.js')).supabase.from('interviews').select('*')`
  deve retornar só as entrevistas daquela empresa.
- **App de campo**: abra `/FieldApp`, entre com o código de 8 dígitos de um
  entrevistador, faça uma entrevista com GPS/áudio e envie.

---

## Como a segurança ficou

- **RLS no Postgres** (em `0002_rls.sql`): cada usuário só lê/escreve dados da
  própria empresa; super-admin vê tudo. Mesma regra que tínhamos no Base44.
- **App de campo (anônimo)**: não acessa o banco direto — as tabelas ficam
  trancadas para anônimos. Tudo passa pelas Edge Functions, que usam a
  *service role* e validam o código de acesso no servidor, forçando
  `company_id`/`field_user_id` (o cliente não consegue forjar).
- **Proteção de colunas** (gatilhos): limites da empresa só o super-admin
  altera; `role`/`active` só admin; `company_id`/`field_user_id` da entrevista
  são imutáveis.

## Observações

- O `@/api/base44Client` foi mantido só como nome — por baixo é Supabase.
  Se quiser, dá para renomear no futuro.
- `src/lib/app-params.js` ficou órfão (era do Base44) e pode ser removido.
