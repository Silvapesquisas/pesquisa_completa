// Geração de relatório em DOCX (Word), espelhando as seções do PDF.
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  ImageRun, Table, TableRow, TableCell, WidthType,
} from "docx";
import { format } from "date-fns";
import { renderChart } from "@/components/reports/chartImage";

const SUBTITLE = {
  eleitoral: "Relatório Descritivo contendo informações técnicas, distribuição territorial dos resultados e representação gráfica",
  populacional: "Estudo descritivo: contextualização, objetivos, metodologia e análise dos resultados",
  executivo: "Resumo executivo: principais indicadores e resultados da pesquisa",
};

function bytes(dataUrl) {
  const b64 = (dataUrl.split(",")[1]) || "";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}
const P = (text, opts = {}) => new Paragraph({ children: [new TextRun({ text, ...opts })], spacing: { after: 80 } });
const H = (text, level = HeadingLevel.HEADING_1) => new Paragraph({ text, heading: level, spacing: { before: 200, after: 120 } });
const imgPara = (img, maxW = 560) => {
  const w = Math.min(img.w, maxW);
  const h = w * (img.h / img.w);
  return new Paragraph({ children: [new ImageRun({ data: bytes(img.dataUrl), transformation: { width: w, height: h } })], spacing: { after: 120 } });
};

function statsTable(model) {
  const rows = [
    ["Total de entrevistas", String(model.total)],
    ["Trabalho de campo", `${model.periodStart} a ${model.periodEnd}`],
    ["Margem de erro", `${model.marginError}% (IC 95%)`],
    ["Entrevistas com GPS", `${model.withGeo}`],
    ["Entrevistas com áudio", `${model.withAudio}`],
    ["Entrevistadores", `${model.interviewers.length}`],
  ];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(([k, v]) => new TableRow({
      children: [
        new TableCell({ width: { size: 45, type: WidthType.PERCENTAGE }, children: [P(k, { bold: true })] }),
        new TableCell({ width: { size: 55, type: WidthType.PERCENTAGE }, children: [P(v)] }),
      ],
    })),
  });
}

function answersTable(q) {
  const tot = q.data.reduce((s, d) => s + d.value, 0) || 1;
  const head = new TableRow({
    tableHeader: true,
    children: ["Opção de resposta", "Qtd.", "%"].map((t, i) =>
      new TableCell({ width: { size: i === 0 ? 70 : 15, type: WidthType.PERCENTAGE }, children: [P(t, { bold: true })] })),
  });
  const rows = q.data.slice(0, 15).map(({ name, value }) => new TableRow({
    children: [
      new TableCell({ children: [P(name)] }),
      new TableCell({ children: [P(String(value))] }),
      new TableCell({ children: [P(`${((value / tot) * 100).toFixed(1)}%`)] }),
    ],
  }));
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [head, ...rows] });
}

function crosstabTable(table) {
  const head = new TableRow({
    tableHeader: true,
    children: [new TableCell({ children: [P("", { bold: true })] }),
      ...table.cols.map(c => new TableCell({ children: [P(c, { bold: true })] }))],
  });
  const rows = table.rows.map(r => new TableRow({
    children: [new TableCell({ children: [P(r.label, { bold: true })] }),
      ...r.pcts.map(p => new TableCell({ children: [P(`${p.toFixed(1)}%`)] }))],
  }));
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [head, ...rows] });
}

export async function generateDOCX(model, options = {}) {
  const sections = options.sections || {};
  const chartType = options.chartType || "bar";
  const children = [];

  // Capa
  if (options.logoDataUrl) {
    try { children.push(imgPara({ dataUrl: options.logoDataUrl, w: 120, h: 120 }, 120)); } catch { /* ignore */ }
  }
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: "Relatório de Pesquisa", bold: true, size: 44 })] }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: SUBTITLE[options.template] || SUBTITLE.eleitoral, italics: true, size: 18, color: "555555" })] }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: model.title, bold: true, size: 32, color: "1F3A8A" })] }));
  children.push(statsTable(model));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 160 }, children: [new TextRun({ text: format(new Date(), "MMMM 'de' yyyy"), color: "888888" })] }));

  // Metodologia
  if (sections.metodologia) {
    children.push(H("Metodologia"));
    const meth = [
      ["Tipo de Pesquisa", "Pesquisa quantitativa do tipo Survey, com amostras probabilísticas estratificadas."],
      ["Instrumento de Coleta", "Questionário estruturado digital, com geolocalização automática e opção de gravação de áudio."],
      ["Tamanho da Amostra", `${model.total} entrevistas, de ${model.periodStart} a ${model.periodEnd}.`],
      ["Margem de Erro", `${model.marginError}% (p/ mais ou p/ menos), IC de 95%.`],
      ["Georreferenciamento", `${model.withGeo} entrevistas (${model.total > 0 ? ((model.withGeo / model.total) * 100).toFixed(1) : 0}%) com GPS.`],
      ["Registro de Áudio", `${model.withAudio} entrevistas (${model.total > 0 ? ((model.withAudio / model.total) * 100).toFixed(1) : 0}%) com áudio para auditoria.`],
      ["Equipe de Campo", `${model.interviewers.length} entrevistador(es): ${model.interviewers.join(", ") || "—"}.`],
    ];
    meth.forEach(([k, v]) => children.push(new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: `${k}: `, bold: true }), new TextRun({ text: v })] })));
  }

  // Mapa
  if (sections.mapa && options.mapDataUrl) {
    children.push(H("Distribuição territorial das entrevistas"));
    try { children.push(imgPara({ dataUrl: options.mapDataUrl, w: options.mapWidth || 520, h: options.mapHeight || 360 })); } catch { /* ignore */ }
    children.push(P(`${model.withGeo} de ${model.total} entrevistas com geolocalização.`));
  }

  // Resultados por questão
  if (sections.resultados) {
    children.push(H("Resultados da pesquisa"));
    model.questions.forEach((q, qi) => {
      children.push(H(`Questão ${qi + 1}`, HeadingLevel.HEADING_2));
      children.push(P(q.text, { bold: true }));
      children.push(P(`${q.total} respostas · Tipo: ${(q.type || "").replace(/_/g, " ")}`, { color: "888888", size: 16 }));
      const img = renderChart({ type: q.type === "aberta" ? "bar" : chartType, data: q.data, width: 520 });
      if (img) children.push(imgPara(img));
      children.push(answersTable(q));
    });
  }

  // Cruzamentos
  if (sections.cruzamentos && model.crosstabs.length) {
    children.push(H("Cruzamento de dados"));
    model.crosstabs.forEach(ct => {
      children.push(H(ct.questionText, HeadingLevel.HEADING_2));
      for (const [varName, table] of Object.entries(ct.byVar)) {
        children.push(P(varName === "sexo" ? "Por sexo" : "Por faixa etária", { bold: true }));
        children.push(crosstabTable(table));
        children.push(P(""));
      }
    });
  }

  // Análise IA
  if (sections.analise && options.aiText) {
    children.push(H("Análise qualitativa e conclusões"));
    const cleaned = options.aiText.replace(/\*\*/g, "").replace(/#{1,6}\s*/g, "").trim();
    cleaned.split(/\n+/).filter(p => p.trim().length > 3).forEach(para => {
      const t = para.trim();
      const isHeading = t.endsWith(":") || (t === t.toUpperCase() && t.length < 70 && t.length > 4);
      if (isHeading) children.push(P(t, { bold: true, color: "1F3A8A" }));
      else children.push(P(t));
    });
  }

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `relatorio-${model.title.slice(0, 25).replace(/\s+/g, "-")}-${format(new Date(), "yyyyMMdd")}.docx`;
  a.click();
}
