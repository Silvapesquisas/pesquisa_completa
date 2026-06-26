// Convida um usuário de painel (gestor/admin) por e-mail e o vincula à empresa
// do convidante. Substitui base44.users.inviteUser. Apenas admin/super-admin.
//
// Entrada:  { email: string, role: "admin" | "supervisor" }
// Saída:    { ok: true }
import { corsHeaders, json, serviceClient, callerClient } from "../_shared/utils.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const svc = serviceClient();
    const { data: { user: authUser } } = await callerClient(req).auth.getUser();
    if (!authUser) return json({ error: "Não autenticado." }, 401);

    const { data: me } = await svc.from("users").select("*").eq("id", authUser.id).single();
    const isSuperAdmin = me?.is_super_admin === true;
    if (!me || (me.role !== "admin" && !isSuperAdmin)) {
      return json({ error: "Apenas administradores podem convidar usuários." }, 403);
    }

    const { email, role, company_id } = await req.json().catch(() => ({}));
    if (!email || typeof email !== "string") return json({ error: "Informe o e-mail." }, 400);
    const targetRole = role === "admin" ? "admin" : "supervisor";
    const targetCompanyId = isSuperAdmin && company_id ? company_id : me.company_id;

    // Cria/convida o usuário no Auth (envia e-mail para definir senha)
    const { data: invited, error: invErr } = await svc.auth.admin.inviteUserByEmail(email);
    if (invErr || !invited?.user) {
      return json({ error: invErr?.message || "Falha ao convidar." }, 400);
    }

    // Define perfil (role + empresa). O gatilho handle_new_user já criou a linha;
    // aqui garantimos os valores corretos.
    const { error: upErr } = await svc.from("users").upsert({
      id: invited.user.id,
      email,
      role: targetRole,
      company_id: targetCompanyId,
      active: true,
    });
    if (upErr) return json({ error: upErr.message }, 500);

    return json({ ok: true });
  } catch (error) {
    return json({ error: (error as Error).message || "Erro interno." }, 500);
  }
});
