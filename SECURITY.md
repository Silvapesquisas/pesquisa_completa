# Modelo de Segurança — Entrevista Pro

## Visão geral

O sistema é multi-tenant: cada empresa (`Company`) tem seus próprios usuários,
pesquisas, entrevistadores e entrevistas. O isolamento é garantido em **três
camadas**:

1. **RLS (Row-Level Security) nas entidades** — regra aplicada pelo servidor
   Base44 em `base44/entities/*.jsonc`. É a camada que de fato protege os
   dados: mesmo que alguém chame a API diretamente (console do navegador,
   curl), só recebe registros da própria empresa.
2. **Funções backend** (`base44/functions/`) — o App de Campo (entrevistadores
   com código de 8 dígitos, sem conta) não acessa entidades diretamente. Todo
   o fluxo passa por `fieldLogin` e `fieldSubmitInterview`, que validam o
   código no servidor e forçam `company_id`/`field_user_id` a partir do
   cadastro do entrevistador — nunca confiam no que o cliente envia.
3. **Escopo no cliente** — as páginas filtram por `company_id` e escondem
   ações sem permissão. É UX/defesa em profundidade, não a proteção real.

## Papéis

| Papel | Como é definido | O que pode |
|---|---|---|
| Super-admin | `User.is_super_admin = true` (defina no painel de dados do Base44) | Tudo, em todas as empresas: criar/editar empresas, vincular usuários |
| Admin de empresa | `role = "admin"` + `company_id` | Gerenciar usuários, entrevistadores e dados da própria empresa |
| Supervisor | `role = "supervisor"` + `company_id` | Operar pesquisas/entrevistas da própria empresa |
| Entrevistador de campo | Registro em `FieldUser` com `access_code` | Apenas via App de Campo: ver pesquisas atribuídas e enviar entrevistas próprias |

Campos protegidos por field-level security em `User`: `company_id` e
`is_super_admin` só podem ser alterados por um super-admin (ninguém se
auto-promove nem troca a própria empresa).

## Regras por entidade (resumo)

| Entidade | Leitura | Escrita |
|---|---|---|
| Survey | própria empresa | própria empresa |
| Interview | própria empresa | própria empresa (delete: admin) |
| FieldUser (códigos de acesso) | própria empresa | admin da empresa |
| Company | a própria | só super-admin |
| User | própria empresa + a si mesmo | admin da empresa (delete: a si mesmo) |
| Notification | destinatário (por e-mail) | criação na própria empresa |
| SurveyVersion | própria empresa | criação na própria empresa; imutável |

Super-admin tem acesso global em todas as regras acima.

## Passos obrigatórios após o deploy

1. **Marque seu usuário como super-admin**: no painel do Base44 (Dados →
   User), defina `is_super_admin = true` no seu registro. Sem isso, um admin
   sem empresa vinculada não enxerga nada após a ativação do RLS (as regras
   negam por padrão).
2. **Confirme que as entidades e funções foram publicadas** (as regras vivem
   nos arquivos `base44/entities/*.jsonc` e `base44/functions/`; verifique no
   painel do Base44 se o app sincronizou após o merge).
3. **Teste o isolamento**: com um usuário da empresa A, abra o console do
   navegador e rode
   `await base44.entities.Interview.list()` — o resultado deve conter apenas
   entrevistas da empresa A.
4. **Teste o App de Campo**: login por código, envio de entrevista com GPS e
   áudio, e sincronização de rascunhos offline.

## Limitações conhecidas

- O código de acesso de 8 dígitos é uma credencial de baixa entropia (10⁸
  combinações). A função `fieldLogin` responde com atraso uniforme em falhas,
  mas o ideal é a plataforma aplicar rate-limit. Não reutilize códigos e
  desative (`active = false`) entrevistadores desligados.
- Usuários convidados entram sem `company_id` e não veem nada até um
  super-admin vinculá-los a uma empresa (página Empresas) — comportamento
  intencional ("negar por padrão").
