// Cria um usuário externo (entrevistador do App de Campo) com o limite por
// empresa aplicado NO SERVIDOR. Chamado por um admin autenticado do painel.
//
// Entrada:  { name, role?, region?, phone?, notes?, company_id? (só super-admin) }
// Saída:    { fieldUser }
import { corsHeaders, json, serviceClient, callerClient } from "../_shared/utils.ts";

const MIN_LIMIT = 4;
const MAX_LIMIT = 25;
const genCode = () => Math.floor(10000000 + Math.random() * 90000000).toString();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const svc = serviceClient();
    const caller = callerClient(req);
    const { data: { user: authUser } } = await caller.auth.getUser();
    if (!authUser) return json({ error: "Não autenticado." }, 401);

    const { data: me } = await svc.from("users").select("*").eq("id", authUser.id).single();
    const isSuperAdmin = me?.is_super_admin === true;
    const isAdmin = me?.role === "admin";
    if (!me || (!isAdmin && !isSuperAdmin)) {
      return json({ error: "Apenas administradores podem cadastrar entrevistadores." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const name = String(body.name || "").trim();
    if (!name) return json({ error: "Informe o nome do entrevistador." }, 400);

    const targetCompanyId = isSuperAdmin && body.company_id ? body.company_id : me.company_id;
    if (!targetCompanyId) return json({ error: "Empresa de destino não informada." }, 400);

    const { data: comp } = await svc.from("companies").select("*").eq("id", targetCompanyId).single();
    if (!comp) return json({ error: "Empresa não encontrada." }, 404);

    const limit = Math.min(Math.max(Number(comp.max_interviewers) || MIN_LIMIT, MIN_LIMIT), MAX_LIMIT);
    const { data: existing } = await svc.from("field_users").select("active").eq("company_id", targetCompanyId);
    const activeCount = (existing || []).filter((u) => u.active !== false).length;
    if (activeCount >= limit) {
      return json({ error: `Limite de ${limit} usuários externos atingido para esta empresa.` }, 409);
    }

    // Código único
    let code = genCode();
    for (let i = 0; i < 5; i++) {
      const { data: clash } = await svc.from("field_users").select("id").eq("access_code", code).limit(1);
      if (!clash || clash.length === 0) break;
      code = genCode();
    }

    const role = body.role === "supervisor" ? "supervisor" : "entrevistador";
    const { data: fieldUser, error } = await svc.from("field_users").insert({
      name, role,
      region: typeof body.region === "string" ? body.region : "",
      phone: typeof body.phone === "string" ? body.phone : "",
      notes: typeof body.notes === "string" ? body.notes : "",
      access_code: code,
      company_id: targetCompanyId,
      company_name: comp.name || "",
      active: true,
      assigned_survey_ids: [],
    }).select("*").single();
    if (error) return json({ error: error.message }, 500);

    return json({ fieldUser });
  } catch (error) {
    return json({ error: (error as Error).message || "Erro interno." }, 500);
  }
});
