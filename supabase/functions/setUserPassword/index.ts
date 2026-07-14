// Define/redefine a senha de um usuário do painel (senha temporária).
// Chamado por um admin de empresa (só usuários da própria empresa) ou pelo
// super-admin (qualquer usuário). O usuário depois troca a senha por conta
// própria em Configurações.
//
// Entrada: { user_id, password }
// Saída:   { ok: true }
import { corsHeaders, json, serviceClient, callerClient } from "../_shared/utils.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const svc = serviceClient();
    const { data: { user: authUser } } = await callerClient(req).auth.getUser();
    if (!authUser) return json({ error: "Não autenticado." }, 401);

    const { data: me } = await svc.from("users").select("*").eq("id", authUser.id).single();
    const isSuper = me?.is_super_admin === true;
    if (!me || (me.role !== "admin" && !isSuper)) {
      return json({ error: "Apenas administradores podem redefinir senhas." }, 403);
    }

    const { user_id, password } = await req.json().catch(() => ({}));
    if (!user_id) return json({ error: "Usuário não informado." }, 400);
    if (!password || String(password).length < 6) return json({ error: "A senha deve ter ao menos 6 caracteres." }, 400);

    const { data: target } = await svc.from("users").select("id, company_id, is_super_admin").eq("id", user_id).single();
    if (!target) return json({ error: "Usuário não encontrado." }, 404);

    // Escopo: admin de empresa só redefine usuários da própria empresa e nunca
    // um super-admin. O super-admin pode redefinir qualquer um.
    if (!isSuper) {
      if (target.is_super_admin) return json({ error: "Sem permissão." }, 403);
      if (target.company_id !== me.company_id) return json({ error: "Este usuário não pertence à sua empresa." }, 403);
    }

    const { error } = await svc.auth.admin.updateUserById(user_id, { password: String(password) });
    if (error) return json({ error: error.message }, 500);

    return json({ ok: true });
  } catch (error) {
    return json({ error: (error as Error).message || "Erro interno." }, 500);
  }
});
