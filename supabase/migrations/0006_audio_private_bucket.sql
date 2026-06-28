-- Áudio das entrevistas deixa de ser público. O painel passa a gerar URLs
-- assinadas (temporárias). Leitura permitida apenas a usuários autenticados da
-- mesma empresa (pasta = company_id) e ao super-admin. O upload continua via
-- service role (Edge Function), que ignora o RLS.
update storage.buckets set public = false where id = 'audio';

drop policy if exists audio_select_own_company on storage.objects;
create policy audio_select_own_company on storage.objects
  for select to authenticated
  using (
    bucket_id = 'audio' and (
      private.auth_is_super_admin()
      or (storage.foldername(name))[1] = private.auth_company_id()::text
    )
  );
