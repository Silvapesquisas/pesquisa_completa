// Envio de entrevista pelo App de Campo (anônimo, autenticado por access_code).
// Valida tudo no servidor e NUNCA confia em company_id/field_user_id do cliente
// — esses campos são forçados a partir do FieldUser dono do código.
//
// Entrada:  { code, interview, audio_base64? (data URL), device_id, device_label?, display_mode? }
// Saída:    { id, audio_url?, audio_failed? }
import {
  corsHeaders, json, serviceClient, sleep, countRows,
  clientIp, rateLimit, tooMany,
  ACCESS_CODE_RE, checkDeviceBinding, notifyCompanyManagers, alreadyNotifiedThisMonth,
} from "../_shared/utils.ts";
import { acceptsSurveyStatus, detectAudioFormat, parseDataUrl } from "../_shared/rules.ts";

const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const svc = serviceClient();
    const ip = clientIp(req);

    // Teto por IP só contra inundação. O limite de ritmo de verdade é POR
    // ENTREVISTADOR (abaixo): operadoras móveis colocam muitos celulares atrás
    // do mesmo IP (CGNAT), e a equipe sincronizando junto no fim do dia não
    // pode travar uma à outra.
    const ipRl = await rateLimit(svc, `fieldSubmit:ip:${ip}`, 600, 600, 900);
    if (!ipRl.allowed) return tooMany(ipRl.retryAfter);

    const { code, interview = {}, audio_base64, device_id, device_label, display_mode } = await req.json().catch(() => ({}));
    if (!ACCESS_CODE_RE.test(String(code || ""))) return json({ error: "Código inválido." }, 400);

    const { data: users } = await svc
      .from("field_users").select("*").eq("access_code", code).eq("active", true).limit(1);
    if (!users || users.length === 0) {
      // Código errado aqui também é sinal de varredura: 20 falhas / 15 min.
      const failRl = await rateLimit(svc, `fieldSubmit:fail:${ip}`, 20, 900, 900);
      if (!failRl.allowed) return tooMany(failRl.retryAfter, "Muitas tentativas com código inválido. Aguarde alguns minutos.");
      await sleep(400);
      return json({ error: "Código inválido ou entrevistador inativo." }, 401);
    }
    const fieldUser = users[0];

    // Vínculo de dispositivo também no envio: sem isso, bastaria pular a tela
    // de login para contornar a trava.
    // Ritmo por entrevistador: 200 envios a cada 10 min cobre com folga uma
    // fila grande acumulada offline sendo sincronizada de uma vez.
    const userRl = await rateLimit(svc, `fieldSubmit:user:${fieldUser.id}`, 200, 600, 600);
    if (!userRl.allowed) return tooMany(userRl.retryAfter);

    const dev = await checkDeviceBinding(svc, fieldUser, String(device_id || ""), String(device_label || ""), String(display_mode || ""));
    if (dev.missing) {
      return json({
        error: "Não foi possível identificar este aparelho. Feche o app e abra de novo.",
        code: "device_missing",
      }, 400);
    }
    if (dev.blocked) {
      return json({
        error: "Este código está vinculado a outro celular. Peça ao gestor para desvincular o aparelho anterior.",
        code: "device_blocked",
      }, 409);
    }

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
    // Pesquisa pausada/encerrada depois de a entrevista ter sido feita (comum
    // offline): a entrevista concluída ANTES da mudança continua valendo.
    const statusCheck = acceptsSurveyStatus(survey, interview.completed_at);
    if (!statusCheck.ok) return json({ error: statusCheck.error }, 409);
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
      // Contado no banco: buscar as linhas pararia em 1000.
      const mine = await countRows(svc.from("interviews").select("id", { count: "exact", head: true })
        .eq("field_user_id", fieldUser.id).eq("survey_id", survey.id).eq("status", "concluida"));
      if (mine >= limit) {
        return json({ error: `Limite de ${limit} entrevistas atingido para esta pesquisa. Fale com seu supervisor.` }, 409);
      }
    }

    // Cota mensal da empresa
    const { data: comp } = await svc.from("companies").select("max_interviews_per_month").eq("id", fieldUser.company_id).limit(1);
    const monthlyLimit = Number(comp?.[0]?.max_interviews_per_month) || 0;
    // Uso do mês contado no banco (company_month_used): buscar as linhas e
    // contar aqui parava em 1000 e deixava a cota de ser aplicada.
    const monthUsed = async () => {
      const { data, error } = await svc.rpc("company_month_used", { p_company_id: fieldUser.company_id });
      if (error) throw error;
      return Number(data) || 0;
    };
    if (monthlyLimit > 0) {
      const used = await monthUsed();
      if (used >= monthlyLimit) {
        return json({ error: `Limite mensal de ${monthlyLimit} entrevistas da empresa foi atingido. Fale com o administrador.` }, 409);
      }
    }

    // Áudio gravado no aparelho -> Supabase Storage (bucket "audio")
    let audioUrl: string | null = null;
    let audioFailed = false; // sinaliza ao app quando havia áudio mas o upload falhou
    const parsedAudio = parseDataUrl(audio_base64);
    if (parsedAudio && parsedAudio.b64) {
      const bytes = Uint8Array.from(atob(parsedAudio.b64), (c) => c.charCodeAt(0));
      if (bytes.length > MAX_AUDIO_BYTES) return json({ error: "Áudio excede o tamanho máximo permitido." }, 413);
      try {
        // Formato real do arquivo: o iPhone grava MP4/AAC, o Android WebM/Opus.
        // Extensão e tipo corretos garantem a reprodução no painel.
        const fmt = detectAudioFormat(parsedAudio.mime, bytes);
        const path = `${fieldUser.company_id}/${crypto.randomUUID()}.${fmt.ext}`;
        const { error: upErr } = await svc.storage.from("audio").upload(path, bytes, { contentType: fmt.contentType });
        if (!upErr) {
          // Guarda o CAMINHO no storage (bucket privado). O painel gera uma
          // URL assinada temporária na hora de reproduzir/baixar.
          audioUrl = path;
        } else {
          audioFailed = true; // falha no áudio não bloqueia o registro, mas é avisada
        }
      } catch {
        audioFailed = true; // falha no áudio não bloqueia o registro, mas é avisada
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
      // Versão do questionário com que a entrevista foi feita (pode ser anterior
      // à atual, se ela ficou guardada offline enquanto o questionário mudou).
      survey_version: Number.isInteger(interview.survey_version) && interview.survey_version > 0
        ? interview.survey_version : null,
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

    // Aviso de cota: 80% e 95% do limite mensal da empresa, uma vez por mês
    // cada. Dá tempo do gestor renovar antes de o campo parar.
    // A entrevista já está gravada: uma falha no aviso não pode virar erro no envio.
    try {
      if (monthlyLimit > 0) {
        const used2 = await monthUsed();
        const pct = (used2 / monthlyLimit) * 100;
        const level = pct >= 95 ? 95 : pct >= 80 ? 80 : 0;
        if (level > 0) {
          const type = `quota_${level}`;
          if (!(await alreadyNotifiedThisMonth(svc, fieldUser.company_id, type))) {
            const restam = Math.max(monthlyLimit - used2, 0);
            await notifyCompanyManagers(svc, fieldUser.company_id, {
              type,
              title: level >= 95 ? "Cota mensal quase esgotada" : "Cota mensal em 80%",
              message: `Sua empresa já realizou ${used2} de ${monthlyLimit} entrevistas do mês (${Math.round(pct)}%). Restam ${restam}. Para ampliar o limite, fale com a plataforma pelo WhatsApp.`,
              link_page: "Companies",
            });
          }
        }
      }
    } catch { /* aviso de cota é secundário */ }

    return json({ id: created.id, audio_url: audioUrl, audio_failed: audioFailed });
  } catch (error) {
    return json({ error: (error as Error).message || "Erro interno." }, 500);
  }
});
