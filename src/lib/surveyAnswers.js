// Leitura das respostas das entrevistas e numeração por pesquisa.
// Usado na busca da tela Entrevistas e na exportação KML.

// Minúsculas, sem acento e com espaços normalizados: "Não  " == "nao".
export const normalizeText = (s) => String(s ?? "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Perguntas das pesquisas, para escolher numa lista. Pesquisas diferentes podem
 * ter a mesma pergunta (ex.: "Qual o seu sexo?"): elas viram UMA opção, casada
 * pelo texto, para funcionar também com "Todas as pesquisas".
 * @returns [{ key, text, ids: [questionId...], options: [...], type }]
 */
export function questionChoices(surveys = []) {
  const map = new Map();
  for (const s of surveys) {
    for (const q of [...(s.questions || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
      const text = (q.text || "").trim();
      if (!text) continue;
      const key = normalizeText(text);
      const item = map.get(key) || { key, text, ids: [], options: [], type: q.type };
      item.ids.push(q.id);
      for (const o of q.options || []) if (o && !item.options.includes(o)) item.options.push(o);
      map.set(key, item);
    }
  }
  return [...map.values()];
}

// Pergunta de localidade (bairro, povoado...), sugerida como padrão.
const LOCALITY_RE = /\b(bairro|localidade|comunidade|povoado|distrito|regiao|zona|setor|vila|lugarejo)\b/;
export function suggestLocalityQuestion(choices = []) {
  return choices.find((c) => LOCALITY_RE.test(c.key)) || null;
}

// A resposta da entrevista para a pergunta escolhida (pelo id; se a pesquisa
// for outra, pelo texto da pergunta).
function findAnswer(interview, choice) {
  if (!choice) return null;
  const ids = new Set(choice.ids || []);
  const list = interview?.answers || [];
  return list.find((x) => ids.has(x.question_id))
    || list.find((x) => normalizeText(x.question_text) === choice.key)
    || null;
}

// Valores respondidos (múltipla escolha pode ter vários).
export function answerValues(interview, choice) {
  const a = findAnswer(interview, choice);
  if (!a) return [];
  if (Array.isArray(a.answer_array) && a.answer_array.length) return a.answer_array.map((v) => String(v).trim()).filter(Boolean);
  const v = String(a.answer ?? "").trim();
  return v ? [v] : [];
}

// Resposta como texto único (valores de múltipla escolha separados por vírgula).
export function answerFor(interview, choice) {
  return answerValues(interview, choice).join(", ");
}

// Data que define a ordem das entrevistas.
export const interviewWhen = (i) => i?.completed_at || i?.created_date || "";

/**
 * Número de cada entrevista DENTRO da sua pesquisa: Nº 1 é a primeira
 * entrevista concluída daquela pesquisa. Calculado sobre todas as entrevistas
 * da pesquisa, então o número é o mesmo em qualquer filtro ou exportação.
 * @returns Map(interviewId -> número)
 */
export function surveySequence(interviews = []) {
  const bySurvey = new Map();
  for (const i of interviews) {
    const k = i.survey_id || "";
    if (!bySurvey.has(k)) bySurvey.set(k, []);
    bySurvey.get(k).push(i);
  }
  const out = new Map();
  for (const list of bySurvey.values()) {
    list.sort((a, b) =>
      String(interviewWhen(a)).localeCompare(String(interviewWhen(b)))
      || String(a.created_date || "").localeCompare(String(b.created_date || ""))
      || String(a.id).localeCompare(String(b.id)));
    list.forEach((i, idx) => out.set(i.id, idx + 1));
  }
  return out;
}
