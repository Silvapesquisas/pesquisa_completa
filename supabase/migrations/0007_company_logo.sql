-- Logomarca da empresa (data URL base64), usada nos relatórios.
-- Editável por admin da empresa/super-admin (não é um dos campos protegidos).
alter table public.companies add column if not exists logo_url text;
