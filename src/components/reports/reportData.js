// Monta o "modelo" do relatório a partir da pesquisa + entrevistas selecionadas.
// Usado pelos geradores de PDF e DOCX (mesma fonte de dados).
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const isChoice = (t) => ["unica_escolha", "multipla_escolha", "sim_nao"].includes(t);

// Resposta de uma entrevista para uma questão.
function answerValues(interview, qid) {
  const a = (interview.answers || []).find(x => x.question_id === qid);
  if (!a) return [];
  if (a.answer_array && a.answer_array.length) return a.answer_array.filter(Boolean);
  return a.answer ? [a.answer] : [];
}

// Detecta as questões demográficas (sexo e faixa etária) pelo enunciado.
function findDemographics(questions) {
  const demo = {};
  for (const q of questions || []) {
    const t = (q.text || "").toLowerCase();
    if (!demo.sexo && /\bsexo\b|g[êe]nero/.test(t) && isChoice(q.type)) demo.sexo = q;
    if (!demo.idade && /(faixa et|idade)/.test(t) && isChoice(q.type)) demo.idade = q;
  }
  return demo;
}

function countAnswers(interviews, q) {
  const counts = {};
  let total = 0;
  for (const iv of interviews) {
    const vals = answerValues(iv, q.id);
    if (vals.length) total++;
    for (const v of vals) counts[v] = (counts[v] || 0) + 1;
  }
  const data = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));
  return { data, total };
}

// Tabela cruzada: linhas = opções da demográfica; colunas = principais respostas.
function crosstab(interviews, targetQ, demoQ, topCols) {
  const cols = topCols.slice(0, 6); // limita colunas para caber na página
  const rowsMap = {};
  for (const iv of interviews) {
    const demoVals = answerValues(iv, demoQ.id);
    if (!demoVals.length) continue;
    const rowKey = demoVals[0];
    const tVals = answerValues(iv, targetQ.id);
    if (!tVals.length) continue;
    if (!rowsMap[rowKey]) rowsMap[rowKey] = { label: rowKey, total: 0, cells: {} };
    rowsMap[rowKey].total += 1;
    for (const v of tVals) {
      if (cols.includes(v)) rowsMap[rowKey].cells[v] = (rowsMap[rowKey].cells[v] || 0) + 1;
    }
  }
  const rows = Object.values(rowsMap).map(r => ({
    label: r.label,
    total: r.total,
    pcts: cols.map(c => (r.total > 0 ? ((r.cells[c] || 0) / r.total) * 100 : 0)),
  }));
  if (rows.length === 0) return null;
  return { cols, rows };
}

export function buildReportModel({ surveyObj, interviews, options = {} }) {
  const list = interviews || [];
  const total = list.length;
  const interviewers = [...new Set(list.map(i => i.interviewer_name).filter(Boolean))];
  const withGeo = list.filter(i => i.latitude && i.longitude).length;
  const withAudio = list.filter(i => i.audio_url).length;
  const marginError = total > 0 ? (1.96 * Math.sqrt(0.25 / total) * 100).toFixed(2) : "—";
  const coords = list.filter(i => typeof i.latitude === "number" && typeof i.longitude === "number")
    .map(i => ({ lat: i.latitude, lng: i.longitude }));

  const fmtDate = (d) => { try { return format(new Date(d), "dd/MM/yyyy", { locale: ptBR }); } catch { return null; } };
  const dates = list.map(i => i.completed_at || i.created_date).filter(Boolean).sort();
  const periodStart = options.dateFrom || (dates.length ? fmtDate(dates[0]) : "—");
  const periodEnd = options.dateTo || (dates.length ? fmtDate(dates[dates.length - 1]) : "—");

  const allQuestions = surveyObj?.questions || [];
  const demo = findDemographics(allQuestions);

  // Quais questões entram (seleção do construtor; default = todas)
  const selectedIds = options.questionIds; // array | undefined
  const questions = allQuestions
    .filter(q => !selectedIds || selectedIds.includes(q.id))
    .map(q => {
      const { data, total: qTotal } = countAnswers(list, q);
      return { id: q.id, text: q.text, type: q.type, data, total: qTotal };
    })
    .filter(q => q.data.length > 0);

  // Cruzamentos (sexo/idade × resposta) para questões de escolha não-demográficas
  const crosstabs = [];
  if (options.includeCrosstabs && (demo.sexo || demo.idade)) {
    for (const q of allQuestions) {
      if (!isChoice(q.type)) continue;
      if (q.id === demo.sexo?.id || q.id === demo.idade?.id) continue;
      if (selectedIds && !selectedIds.includes(q.id)) continue;
      const { data } = countAnswers(list, q);
      if (!data.length) continue;
      const topCols = data.map(d => d.name);
      const byVar = {};
      if (demo.sexo) { const c = crosstab(list, q, demo.sexo, topCols); if (c) byVar.sexo = c; }
      if (demo.idade) { const c = crosstab(list, q, demo.idade, topCols); if (c) byVar.idade = c; }
      if (Object.keys(byVar).length) crosstabs.push({ questionText: q.text, byVar });
    }
  }

  return {
    title: surveyObj?.title || "Pesquisa",
    description: surveyObj?.description || "",
    total, interviewers, withGeo, withAudio, marginError,
    periodStart, periodEnd, coords, questions, crosstabs,
    hasDemographics: !!(demo.sexo || demo.idade),
  };
}
