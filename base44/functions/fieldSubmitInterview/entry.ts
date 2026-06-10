// Envio de entrevista pelo App de Campo (anônimo, autenticado por access_code).
// Valida tudo no servidor e NUNCA confia em company_id/field_user_id vindos do
// cliente — esses campos são forçados a partir do FieldUser dono do código.
//
// Entrada:  { code: string, interview: object, audio_base64?: string (data URL) }
// Saída:    { id, audio_url? } ou erro 4xx/5xx
import { createClientFromRequest } from "npm:@base44/sdk";

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    const code = String(body.code || "");
    const interview = body.interview || {};
    if (!/^\d{8}$/.test(code)) {
      return Response.json({ error: "Código inválido." }, { status: 400 });
    }

    const users = await svc.entities.FieldUser.filter({ access_code: code, active: true });
    if (!users.length) {
      await new Promise((r) => setTimeout(r, 400));
      return Response.json({ error: "Código inválido ou entrevistador inativo." }, { status: 401 });
    }
    const fieldUser = users[0];

    // A pesquisa precisa existir, estar ativa, pertencer à empresa do
    // entrevistador e (se houver atribuições) estar atribuída a ele
    const surveys = await svc.entities.Survey.filter({ id: interview.survey_id });
    const survey = surveys[0];
    if (!survey || survey.company_id !== fieldUser.company_id) {
      return Response.json({ error: "Pesquisa não encontrada para esta empresa." }, { status: 404 });
    }
    if (survey.status !== "ativa") {
      return Response.json({ error: "Esta pesquisa não está mais ativa." }, { status: 409 });
    }
    const assigned = fieldUser.assigned_survey_ids || [];
    if (assigned.length > 0 && !assigned.includes(survey.id)) {
      return Response.json({ error: "Pesquisa não atribuída a este entrevistador." }, { status: 403 });
    }

    // Limite de entrevistas por entrevistador, aplicado no servidor
    const personalLimit = fieldUser.survey_interview_limits?.[survey.id];
    const limit = (personalLimit !== undefined && personalLimit !== null && personalLimit !== "")
      ? Number(personalLimit)
      : (survey.max_interviews_per_interviewer || null);
    if (limit) {
      const mine = await svc.entities.Interview.filter({
        field_user_id: fieldUser.id,
        survey_id: survey.id,
        status: "concluida",
      });
      if (mine.length >= limit) {
        return Response.json(
          { error: `Limite de ${limit} entrevistas atingido para esta pesquisa. Fale com seu supervisor.` },
          { status: 409 },
        );
      }
    }

    // Áudio gravado no aparelho: sobe pelo servidor (cliente anônimo não tem
    // acesso direto às integrações)
    let audioUrl = null;
    const audioBase64 = body.audio_base64;
    if (typeof audioBase64 === "string" && audioBase64.startsWith("data:")) {
      const [, b64] = audioBase64.split(",");
      if (b64) {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        if (bytes.length > MAX_AUDIO_BYTES) {
          return Response.json({ error: "Áudio excede o tamanho máximo permitido." }, { status: 413 });
        }
        try {
          const file = new File([bytes], "audio.webm", { type: "audio/webm" });
          const { file_url } = await svc.integrations.Core.UploadFile({ file });
          audioUrl = file_url;
        } catch {
          // Falha no upload do áudio não bloqueia o registro da entrevista
          audioUrl = null;
        }
      }
    }

    // Campos de identidade/escopo SEMPRE do servidor; do cliente, apenas o
    // conteúdo da entrevista em si
    const created = await svc.entities.Interview.create({
      survey_id: survey.id,
      survey_title: survey.title,
      field_user_id: fieldUser.id,
      interviewer_name: fieldUser.name,
      company_id: fieldUser.company_id,
      status: "concluida",
      answers: Array.isArray(interview.answers) ? interview.answers : [],
      latitude: typeof interview.latitude === "number" ? interview.latitude : null,
      longitude: typeof interview.longitude === "number" ? interview.longitude : null,
      location_accuracy: typeof interview.location_accuracy === "number" ? interview.location_accuracy : null,
      audio_url: audioUrl,
      audio_duration: typeof interview.audio_duration === "number" ? interview.audio_duration : 0,
      notes: typeof interview.notes === "string" ? interview.notes : "",
      completed_at: interview.completed_at || new Date().toISOString(),
      edit_history: [],
    });

    return Response.json({ id: created.id, audio_url: audioUrl });
  } catch (error) {
    return Response.json({ error: error.message || "Erro interno." }, { status: 500 });
  }
});
