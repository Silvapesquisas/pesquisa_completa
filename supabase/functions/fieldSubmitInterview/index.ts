// Envio de entrevista pelo App de Campo (anônimo, autenticado por access_code).
// Valida tudo no servidor e NUNCA confia em company_id/field_user_id do cliente
// — esses campos são forçados a partir do FieldUser dono do código.
//
// Entrada:  { code, interview, audio_base64? (data URL) }
// Saída:    { id, audio_url? }
import { corsHeaders, json, serviceClient, sleep, monthStartISO } from "../_shared/utils.ts";

const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const svc = serviceClient();
    const { code, interview = {}, audio_base64 } = await req.json().catch(() => ({}));
    if (!/^\d{8}$/.test(String(code || ""))) return json({ error: "Código inválido." }, 400);

    const { data: users } = await svc
      .from("field_users").select("*").eq("access_code", code).eq("active", true).limit(1);
    if (!users || users.length === 0) {
      await sleep(400);
      return json({ error: "Código inválido ou entrevistador inativo." }, 401);
    }
    const fieldUser = users[0];

    // Idempotência: se a mesma entrevista (client_uuid gerado no aparelho) já
    // foi registrada, devolve o id existente em vez de duplicar. Isso cobre o
    // caso de a resposta ter se perdido após a gravação (timeout/queda) e o
    // app reenviar. Checado ANTES dos limites para não rejeitar um reenvio.
    const clientUuid = (typeof interview.client_uuid === "string" && interview.client_uuid)
      ? interview.client_uuid : null;
    if (clientUuid) {
      const { data: dup } = await svc.from("interviews")
        .select("id, audio_url").eq("client_uuid", clientUuid).eq("company_id", fieldUser.company_id).limit(1);
      if (dup && dup.length > 0) {
        return json({ id: dup[0].id, audio_url: dup[0].audio_url, duplicate: true });
      }
    }

    // Pesquisa: existe, ativa, da empresa do entrevistador e atribuída a ele
    const { data: surveys } = await svc.from("surveys").select("*").eq("id", interview.survey_id).limit(1);
    const survey = surveys?.[0];
    if (!survey || survey.company_id !== fieldUser.company_id) {
      return json({ error: "Pesquisa não encontrada para esta empresa." }, 404);
    }
    if (survey.status !== "ativa") return json({ error: "Esta pesquisa não está mais ativa." }, 409);
    const assigned = fieldUser.assigned_survey_ids || [];
    if (assigned.length > 0 && !assigned.includes(survey.id)) {
      return json({ error: "Pesquisa não atribuída a este entrevistador." }, 403);
    }

    // Limite por entrevistador
    const personalLimit = fieldUser.survey_interview_limits?.[survey.id];
    const limit = (personalLimit !== undefined && personalLimit !== null && personalLimit !== "")
      ? Number(personalLimit)
      : (survey.max_interviews_per_interviewer || null);
    if (limit) {
      const { data: mine } = await svc.from("interviews").select("id")
        .eq("field_user_id", fieldUser.id).eq("survey_id", survey.id).eq("status", "concluida");
      if ((mine?.length || 0) >= limit) {
        return json({ error: `Limite de ${limit} entrevistas atingido para esta pesquisa. Fale com seu supervisor.` }, 409);
      }
    }

    // Cota mensal da empresa
    const { data: comp } = await svc.from("companies").select("max_interviews_per_month").eq("id", fieldUser.company_id).limit(1);
    const monthlyLimit = Number(comp?.[0]?.max_interviews_per_month) || 0;
    if (monthlyLimit > 0) {
      const ms = monthStartISO();
      const { data: ci } = await svc.from("interviews").select("completed_at, created_date, status")
        .eq("company_id", fieldUser.company_id).eq("status", "concluida");
      const used = (ci || []).filter((iv) => (iv.completed_at || iv.created_date || "") >= ms).length;
      if (used >= monthlyLimit) {
        return json({ error: `Limite mensal de ${monthlyLimit} entrevistas da empresa foi atingido. Fale com o administrador.` }, 409);
      }
    }

    // Áudio gravado no aparelho -> Supabase Storage (bucket "audio")
    let audioUrl: string | null = null;
    let audioFailed = false; // sinaliza ao app quando havia áudio mas o upload falhou
    if (typeof audio_base64 === "string" && audio_base64.startsWith("data:")) {
      const [, b64] = audio_base64.split(",");
      if (b64) {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        if (bytes.length > MAX_AUDIO_BYTES) return json({ error: "Áudio excede o tamanho máximo permitido." }, 413);
        try {
          const path = `${fieldUser.company_id}/${crypto.randomUUID()}.webm`;
          const { error: upErr } = await svc.storage.from("audio").upload(path, bytes, { contentType: "audio/webm" });
          if (!upErr) {
            audioUrl = svc.storage.from("audio").getPublicUrl(path).data.publicUrl;
          } else {
            audioFailed = true; // falha no áudio não bloqueia o registro, mas é avisada
          }
        } catch {
          audioFailed = true; // falha no áudio não bloqueia o registro, mas é avisada
        }
      }
    }

    // Identidade/escopo SEMPRE do servidor; do cliente, só o conteúdo
    const { data: created, error: insErr } = await svc.from("interviews").insert({
      survey_id: survey.id,
      survey_title: survey.title,
      field_user_id: fieldUser.id,
      interviewer_name: fieldUser.name,
      company_id: fieldUser.company_id,
      status: "concluida",
      client_uuid: clientUuid,
      answers: Array.isArray(interview.answers) ? interview.answers : [],
      latitude: typeof interview.latitude === "number" ? interview.latitude : null,
      longitude: typeof interview.longitude === "number" ? interview.longitude : null,
      location_accuracy: typeof interview.location_accuracy === "number" ? interview.location_accuracy : null,
      audio_url: audioUrl,
      audio_duration: typeof interview.audio_duration === "number" ? interview.audio_duration : 0,
      notes: typeof interview.notes === "string" ? interview.notes : "",
      completed_at: interview.completed_at || new Date().toISOString(),
      edit_history: [],
    }).select("id").single();
    if (insErr) {
      // Corrida: dois envios simultâneos do mesmo client_uuid. O índice único
      // barra o segundo; devolvemos o registro já gravado como sucesso.
      if (clientUuid && (insErr.code === "23505" || /duplicate key|client_uuid/i.test(insErr.message || ""))) {
        const { data: dup2 } = await svc.from("interviews")
          .select("id, audio_url").eq("client_uuid", clientUuid).eq("company_id", fieldUser.company_id).limit(1);
        if (dup2 && dup2.length > 0) return json({ id: dup2[0].id, audio_url: dup2[0].audio_url, duplicate: true });
      }
      return json({ error: insErr.message }, 500);
    }

    return json({ id: created.id, audio_url: audioUrl, audio_failed: audioFailed });
  } catch (error) {
    return json({ error: (error as Error).message || "Erro interno." }, 500);
  }
});
