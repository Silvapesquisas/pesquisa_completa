// Exportação de DADOS BRUTOS em Excel (.xlsx), compartilhada entre as páginas
// Relatórios e Relatório Avançado. Sempre reflete o conjunto de entrevistas já
// filtrado/cruzado que a página passar.
import * as XLSX from "xlsx";
import { format } from "date-fns";

const answerOf = (iv, qid) => {
  const a = (iv.answers || []).find(x => x.question_id === qid);
  if (!a) return "";
  return a.answer_array?.length ? a.answer_array.join("; ") : (a.answer || "");
};

// surveyObj: pesquisa específica (ou null p/ várias); interviews: já filtradas;
// includedQuestionIds: limita as questões (undefined = todas da pesquisa);
// filtersInfo: [{ Campo, Valor }] com os filtros aplicados (rastreabilidade).
export function exportRawXLSX({ surveyObj, interviews, includedQuestionIds, filtersInfo = [], fileLabel }) {
  const includedQs = surveyObj?.questions
    ? surveyObj.questions.filter(q => !includedQuestionIds || includedQuestionIds.includes(q.id))
    : [];

  const rawRows = interviews.map((iv, idx) => {
    const row = {
      "#": idx + 1,
      "Pesquisa": iv.survey_title || "",
      "Entrevistador": iv.interviewer_name || "",
      "Data": iv.completed_at ? format(new Date(iv.completed_at), "dd/MM/yyyy HH:mm") : "",
      "Status": iv.status || "",
      "Latitude": iv.latitude ?? "",
      "Longitude": iv.longitude ?? "",
      "Áudio": iv.audio_url ? "Sim" : "Não",
      "Observações": iv.notes || "",
    };
    if (includedQs.length) {
      includedQs.forEach((q, qi) => { row[`Q${qi + 1}. ${q.text}`] = answerOf(iv, q.id); });
    } else {
      // Sem pesquisa específica: usa o texto da questão gravado em cada resposta
      (iv.answers || []).forEach((a, ai) => {
        row[a.question_text || `Questão ${ai + 1}`] = a.answer_array?.length ? a.answer_array.join("; ") : (a.answer || "");
      });
    }
    return row;
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rawRows), "Dados brutos");

  if (includedQs.length) {
    const summaryRows = [];
    includedQs.forEach((q, qi) => {
      const counts = {};
      let qTotal = 0;
      interviews.forEach(iv => {
        const a = (iv.answers || []).find(x => x.question_id === q.id);
        if (!a) return;
        const vals = (a.answer_array?.length ? a.answer_array : [a.answer]).filter(Boolean);
        if (vals.length) qTotal++;
        vals.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
      });
      Object.entries(counts).sort((x, y) => y[1] - x[1]).forEach(([opt, n]) => {
        summaryRows.push({
          "Questão": `Q${qi + 1}. ${q.text}`,
          "Resposta": opt,
          "Qtd": n,
          "%": qTotal > 0 ? Number(((n / qTotal) * 100).toFixed(1)) : 0,
          "Respondentes": qTotal,
        });
      });
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Somatório por questão");
  }

  const infoRows = [
    ...filtersInfo,
    { "Campo": "Entrevistas exportadas", "Valor": interviews.length },
    { "Campo": "Gerado em", "Valor": format(new Date(), "dd/MM/yyyy HH:mm") },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(infoRows), "Informações");

  const label = (fileLabel || surveyObj?.title || "pesquisas").slice(0, 25).replace(/\s+/g, "-");
  XLSX.writeFile(wb, `dados-brutos-${label}-${format(new Date(), "yyyyMMdd-HHmm")}.xlsx`);
}
