// Login e dados do App de Campo (entrevistadores acessam por código, sem
// conta). Usa service role para que as tabelas fiquem trancadas por RLS para
// qualquer acesso anônimo direto.
//
// Entrada:  { code, withInterviews?, device_id?, device_label? }
// Saída:    { fieldUser, surveys, counts, quotas, myInterviews? }
import {
  corsHeaders, json, serviceClient, sleep,
  clientIp, rateLimit, rateLimitReset, tooMany,
  ACCESS_CODE_RE, checkDeviceBinding, notifyCompanyManagers,
} from "../_shared/utils.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const svc = serviceClient();
    const ip = clientIp(req);

    // Teto geral por IP (protege contra varredura automatizada de códigos):
    // 40 tentativas a cada 10 min; ao estourar, bloqueia por 30 min.
    const ipRl = await rateLimit(svc, `fieldLogin:ip:${ip}`, 40, 600, 1800);
    if (!ipRl.allowed) return tooMany(ipRl.retryAfter);

    const { code, withInterviews, device_id, device_label } = await req.json().catch(() => ({}));
    if (!ACCESS_CODE_RE.test(String(code || ""))) return json({ error: "Código inválido." }, 400);

    // Limite de ERROS por IP: 8 códigos errados em 15 min -> bloqueia 15 min.
    // Só conta falhas, então o entrevistador legítimo nunca é afetado.
    const failKey = `fieldLogin:fail:${ip}`;

    const { data: users } = await svc
      .from("field_users").select("*")
      .eq("access_code", code).eq("active", true).limit(1);
    if (!users || users.length === 0) {
      const failRl = await rateLimit(svc, failKey, 8, 900, 900);
      if (!failRl.allowed) return tooMany(failRl.retryAfter, "Muitas tentativas com código inválido. Aguarde alguns minutos.");
      await sleep(400); // atraso uniforme contra enumeração de códigos
      return json({ error: "Código inválido ou entrevistador inativo." }, 401);
    }
    const fieldUser = users[0];
    await rateLimitReset(svc, failKey); // login correto zera as falhas do IP

    // Um código só vale em UM aparelho por vez (a partir de DEVICE_LOCK_START).
    // Se outro celular já está vinculado, recusa e avisa os gestores.
    const dev = await checkDeviceBinding(svc, fieldUser, String(device_id || ""), String(device_label || ""));
    if (dev.blocked) {
      await notifyCompanyManagers(svc, fieldUser.company_id, {
        type: "device_blocked",
        title: "Tentativa de acesso em outro aparelho",
        message: `O código de ${fieldUser.name} foi usado em um aparelho diferente do vinculado. Se a troca for legítima, desvincule o aparelho atual em Entrevistadores.`,
        link_page: "Interviewers",
        link_id: fieldUser.id,
      });
      return json({
        error: "Este código já está vinculado a outro celular. Peça ao gestor para desvincular o aparelho anterior.",
        code: "device_blocked",
      }, 409);
    }

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

    // Cotas por estrato: progresso da PESQUISA (todos os entrevistadores),
    // porque a cota vem do plano amostral e não do limite individual.
    // Formato: { [surveyId]: { [questionId]: { [resposta]: quantidade } } }
    const quotas: Record<string, Record<string, Record<string, number>>> = {};
    const withStrata = surveys.filter((s) =>
      Array.isArray(s.strata) && s.strata.some((st: Record<string, unknown>) => st?.question_id)
    );
    if (withStrata.length > 0) {
      const { data: rows } = await svc.rpc("survey_stratum_counts", {
        p_survey_ids: withStrata.map((s) => s.id),
      });
      for (const r of rows || []) {
        const bySurvey = quotas[r.survey_id] ||= {};
        const byQuestion = bySurvey[r.question_id] ||= {};
        byQuestion[r.answer] = Number(r.total) || 0;
      }
    }

    // A cota mensal da empresa NÃO é exposta ao app de campo (informação
    // gerencial). A regra continua sendo aplicada no envio (fieldSubmitInterview).
    return json({
      fieldUser, surveys, counts, quotas,
      ...(withInterviews ? { myInterviews: myInterviews || [] } : {}),
    });
  } catch (error) {
    return json({ error: (error as Error).message || "Erro interno." }, 500);
  }
});
