// Cópia local das pesquisas no App de Campo.
//
// Regra: o servidor é a fonte da verdade. Toda vez que o app consegue falar com
// ele, a cópia do celular vira um espelho da lista do servidor — pesquisas novas
// entram, alteradas são substituídas e as que saíram (pausadas, encerradas ou
// desatribuídas) somem. A cópia só é usada quando não há internet.
//
// A entrevista em andamento NÃO muda no meio: a tela de entrevista trabalha com
// a versão que estava aberta quando ela começou, e a entrevista registra essa
// versão (survey_version) ao ser enviada.

// Versão do questionário. Cópias antigas (anteriores ao controle de versão) não
// têm o campo e contam como 0, então são substituídas na primeira atualização.
export const questionsVersion = (s) => Number(s?.questions_version) || 0;

// Qualquer alteração na pesquisa muda updated_date (inclusive áudio obrigatório,
// limites e cotas, que o app também usa); só as perguntas mudam a versão.
const signature = (s) => `${questionsVersion(s)}|${s?.updated_date || ""}`;

/**
 * Decide o que gravar no celular depois de receber a lista do servidor.
 *
 * @param cached    pesquisas guardadas no celular
 * @param server    pesquisas ativas atribuídas ao entrevistador (resposta do servidor)
 * @param keepIds   pesquisas com entrevistas em andamento no celular: mesmo que
 *                  tenham saído da lista, a cópia é mantida para que o rascunho
 *                  possa ser aberto e concluído
 * @param now       data/hora da verificação (ISO)
 * @returns { puts, dels, next, updated }
 *    puts/dels: registros a gravar/apagar
 *    next:      como a lista local fica
 *    updated:   pesquisas cujo QUESTIONÁRIO mudou (para avisar o entrevistador)
 */
export function planSurveyCache({ cached = [], server = [], keepIds = [], now = new Date().toISOString() }) {
  const cachedById = new Map(cached.map((s) => [s.id, s]));
  const serverIds = new Set(server.map((s) => s.id));
  const keep = new Set(keepIds);
  const puts = [];
  const dels = [];
  const next = [];
  const updated = [];

  for (const s of server) {
    const old = cachedById.get(s.id);
    const same = old && !old._retainedForDrafts && signature(old) === signature(s);
    const item = same
      ? old
      : { ...s, _savedAt: now, _size: JSON.stringify(s).length };
    if (!same) puts.push(item);
    if (old && questionsVersion(s) > questionsVersion(old)) {
      updated.push({ id: s.id, title: s.title, from: questionsVersion(old), to: questionsVersion(s) });
    }
    next.push(item);
  }

  for (const old of cached) {
    if (serverIds.has(old.id)) continue;
    if (keep.has(old.id)) {
      // Fora da lista, mas com rascunho no celular: fica guardada só para ele.
      const item = old._retainedForDrafts ? old : { ...old, _retainedForDrafts: true };
      if (item !== old) puts.push(item);
      next.push(item);
    } else {
      dels.push(old.id);
    }
  }

  return { puts, dels, next, updated };
}

// Pesquisas em que o entrevistador pode INICIAR uma entrevista agora.
// Com resposta do servidor: exatamente a lista dele. Sem internet: a cópia do
// celular, menos as que só ficaram guardadas por causa de rascunhos.
export function availableSurveys({ serverLoaded, server = [], cached = [] }) {
  if (serverLoaded) return server;
  return cached.filter((s) => !s._retainedForDrafts);
}

// Pesquisa para abrir um rascunho: a versão mais atual que o celular conhece.
export function findSurveyForDraft({ surveyId, server = [], cached = [] }) {
  return server.find((s) => s.id === surveyId) || cached.find((s) => s.id === surveyId) || null;
}
