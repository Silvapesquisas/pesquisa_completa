// Regras de negócio do App de Campo, sem acesso a banco (funções puras).
// Ficam separadas para poderem ser testadas isoladamente.

/* ───────────────────────── Vínculo de aparelho ───────────────────────── */

export type BindingInput = {
  lockActive: boolean;          // trava de um aparelho por código já vigente?
  bound: string | null;         // device_id vinculado hoje
  boundLabel: string;           // rótulo do aparelho vinculado ("iPhone/iPad · Safari")
  boundStandalone: boolean;     // o vinculado é o app instalado?
  deviceId: string;             // aparelho desta requisição
  deviceLabel: string;
  displayMode: string;          // "standalone" (app instalado) | "browser"
};

export type BindingDecision =
  | "grace"      // antes da trava: libera sem vincular
  | "missing"    // requisição sem identificador de aparelho: recusa
  | "bind"       // primeiro aparelho: vincula
  | "same"       // mesmo aparelho: libera
  | "migrate"    // iPhone passando do Safari para o app instalado: troca o vínculo
  | "block";     // outro aparelho: recusa

const isApple = (label: string) => /^iPhone\/iPad/.test(label || "");

export function decideDeviceBinding(i: BindingInput): BindingDecision {
  if (!i.lockActive) return "grace";
  // O app oficial SEMPRE envia o identificador. Aceitar requisição sem ele
  // permitiria pular a trava simplesmente omitindo o campo.
  if (!i.deviceId) return "missing";
  if (!i.bound) return "bind";
  if (i.bound === i.deviceId) return "same";
  // No iPhone o app instalado tem armazenamento separado do Safari e nasce com
  // outro identificador. Permite UMA troca Safari → app instalado no mesmo tipo
  // de aparelho; depois disso o vínculo é do app instalado e trocas voltam a
  // exigir o gestor.
  if (i.displayMode === "standalone" && !i.boundStandalone && isApple(i.boundLabel) && isApple(i.deviceLabel)) {
    return "migrate";
  }
  return "block";
}

/* ─────────────────────────── Formato do áudio ─────────────────────────── */

export type AudioFormat = { ext: string; contentType: string };

// Identifica o formato pelos primeiros bytes do arquivo — mais confiável que o
// rótulo, porque versões antigas do app rotulavam o MP4 do iPhone como WebM.
export function detectAudioFormat(declaredMime: string, bytes: Uint8Array): AudioFormat {
  const b = bytes;
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    return { ext: "m4a", contentType: "audio/mp4" };                  // ....ftyp (MP4/M4A)
  }
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) {
    return { ext: "webm", contentType: "audio/webm" };                // EBML (WebM)
  }
  if (b.length >= 4 && b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53) {
    return { ext: "ogg", contentType: "audio/ogg" };                  // OggS
  }
  if (b.length >= 3 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) {
    return { ext: "mp3", contentType: "audio/mpeg" };                 // ID3
  }
  if (b.length >= 2 && b[0] === 0xff && (b[1] & 0xf6) === 0xf0) {
    return { ext: "aac", contentType: "audio/aac" };                  // ADTS
  }
  const byMime: Record<string, AudioFormat> = {
    "audio/mp4": { ext: "m4a", contentType: "audio/mp4" },
    "audio/x-m4a": { ext: "m4a", contentType: "audio/mp4" },
    "audio/aac": { ext: "aac", contentType: "audio/aac" },
    "audio/ogg": { ext: "ogg", contentType: "audio/ogg" },
    "audio/mpeg": { ext: "mp3", contentType: "audio/mpeg" },
    "audio/webm": { ext: "webm", contentType: "audio/webm" },
  };
  return byMime[(declaredMime || "").toLowerCase()] || { ext: "webm", contentType: "audio/webm" };
}

// "data:audio/mp4;codecs=...;base64,AAAA" -> { mime: "audio/mp4", b64: "AAAA" }
export function parseDataUrl(dataUrl: string): { mime: string; b64: string } | null {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return null;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const header = dataUrl.slice(5, comma);
  const mime = header.split(";")[0] || "";
  return { mime, b64: dataUrl.slice(comma + 1) };
}

/* ─────────────────────── Situação da pesquisa no envio ─────────────────────── */

// Tolerância entre o relógio do celular e o do servidor.
export const STATUS_CLOCK_GRACE_MS = 10 * 60 * 1000;

/**
 * Pode receber esta entrevista, dada a situação atual da pesquisa?
 *
 * Entrevistas feitas offline chegam depois. Se a pesquisa foi pausada ou
 * encerrada nesse meio-tempo, a entrevista concluída ANTES da mudança continua
 * valendo — recusá-la descartaria trabalho legítimo de campo. `updated_date` da
 * pesquisa marca a última alteração (o gatilho do banco atualiza a cada
 * mudança), então uma entrevista concluída até esse instante é aceita.
 */
export function acceptsSurveyStatus(
  survey: { status: string; updated_date?: string | null },
  completedAt: string | null | undefined,
): { ok: true } | { ok: false; error: string } {
  if (survey.status === "ativa") return { ok: true };
  const done = Date.parse(completedAt || "");
  const changed = Date.parse(survey.updated_date || "");
  if (Number.isFinite(done) && Number.isFinite(changed) && done <= changed + STATUS_CLOCK_GRACE_MS) {
    return { ok: true };
  }
  const label = survey.status === "encerrada" ? "encerrada" : survey.status === "pausada" ? "pausada" : "fora de campo";
  return { ok: false, error: `A pesquisa foi ${label} antes de esta entrevista ser concluída.` };
}
