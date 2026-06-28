// Login e dados do App de Campo (entrevistadores acessam por código de 8
// dígitos, sem conta). Usa service role para que as tabelas fiquem trancadas
// por RLS para qualquer acesso anônimo direto.
//
// Entrada:  { code: string, withInterviews?: boolean }
// Saída:    { fieldUser, surveys, counts, myInterviews? }
import { corsHeaders, json, serviceClient, sleep } from "../_shared/utils.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const svc = serviceClient();
    const { code, withInterviews } = await req.json().catch(() => ({}));
    if (!/^\d{8}$/.test(String(code || ""))) return json({ error: "Código inválido." }, 400);

    const { data: users } = await svc
      .from("field_users").select("*")
      .eq("access_code", code).eq("active", true).limit(1);
    if (!users || users.length === 0) {
      await sleep(400); // atraso uniforme contra enumeração de códigos
      return json({ error: "Código inválido ou entrevistador inativo." }, 401);
    }
    const fieldUser = users[0];

    // Pesquisas ativas SOMENTE da empresa do entrevistador
    const { data: activeSurveys } = await svc
      .from("surveys").select("*")
      .eq("status", "ativa").eq("company_id", fieldUser.company_id);
    const assigned = fieldUser.assigned_survey_ids || [];
    const surveys = assigned.length > 0
      ? (activeSurveys || []).filter((s) => assigned.includes(s.id))
      : (activeSurveys || []);

    // Entrevistas do próprio entrevistador (metas/limites)
    const { data: myInterviews } = await svc
      .from("interviews").select("*").eq("field_user_id", fieldUser.id);
    const counts: Record<string, number> = {};
    for (const iv of myInterviews || []) {
      if (iv.status === "concluida") counts[iv.survey_id] = (counts[iv.survey_id] || 0) + 1;
    }

    // A cota mensal da empresa NÃO é exposta ao app de campo (informação
    // gerencial). A regra continua sendo aplicada no envio (fieldSubmitInterview).
    return json({
      fieldUser, surveys, counts,
      ...(withInterviews ? { myInterviews: myInterviews || [] } : {}),
    });
  } catch (error) {
    return json({ error: (error as Error).message || "Erro interno." }, 500);
  }
});
