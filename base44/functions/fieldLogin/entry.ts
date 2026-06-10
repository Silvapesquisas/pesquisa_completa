// Login e dados do App de Campo (entrevistadores acessam por código de 8
// dígitos, sem conta Base44). Roda com service role no servidor para que as
// entidades possam ficar trancadas por RLS para clientes anônimos.
//
// Entrada:  { code: string, withInterviews?: boolean }
// Saída:    { fieldUser, surveys, counts, myInterviews? }
//   - fieldUser: dados do entrevistador (validado por access_code + active)
//   - surveys: pesquisas ATIVAS da empresa do entrevistador, restritas às
//     atribuídas (assigned_survey_ids) quando a lista não está vazia
//   - counts: { [survey_id]: nº de entrevistas concluídas deste entrevistador }
//   - myInterviews: entrevistas do próprio entrevistador (se withInterviews)
import { createClientFromRequest } from "npm:@base44/sdk";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    const code = String(body.code || "");
    if (!/^\d{8}$/.test(code)) {
      return Response.json({ error: "Código inválido." }, { status: 400 });
    }

    const users = await svc.entities.FieldUser.filter({ access_code: code, active: true });
    if (!users.length) {
      // Pequeno atraso uniforme para dificultar enumeração de códigos
      await new Promise((r) => setTimeout(r, 400));
      return Response.json({ error: "Código inválido ou entrevistador inativo." }, { status: 401 });
    }
    const fieldUser = users[0];

    // Pesquisas ativas SOMENTE da empresa do entrevistador
    const activeSurveys = await svc.entities.Survey.filter({
      status: "ativa",
      company_id: fieldUser.company_id,
    });
    const assigned = fieldUser.assigned_survey_ids || [];
    const surveys = assigned.length > 0
      ? activeSurveys.filter((s) => assigned.includes(s.id))
      : activeSurveys;

    // Entrevistas do próprio entrevistador (para metas/limites)
    const myInterviews = await svc.entities.Interview.filter({ field_user_id: fieldUser.id });
    const counts = {};
    for (const iv of myInterviews) {
      if (iv.status === "concluida") counts[iv.survey_id] = (counts[iv.survey_id] || 0) + 1;
    }

    return Response.json({
      fieldUser,
      surveys,
      counts,
      ...(body.withInterviews ? { myInterviews } : {}),
    });
  } catch (error) {
    return Response.json({ error: error.message || "Erro interno." }, { status: 500 });
  }
});
