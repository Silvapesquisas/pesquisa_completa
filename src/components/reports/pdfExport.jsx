import { jsPDF } from "jspdf";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { renderChart } from "@/components/reports/chartImage";

const TEMPLATES = {
  eleitoral: {
    accent: [15, 40, 100],
    subtitle: "Relatório Descritivo contendo informações técnicas, distribuição territorial dos resultados e representação gráfica",
  },
  populacional: {
    accent: [22, 78, 99],
    subtitle: "Estudo descritivo: contextualização, objetivos, metodologia e análise dos resultados",
  },
  executivo: {
    accent: [30, 41, 59],
    subtitle: "Resumo executivo: principais indicadores e resultados da pesquisa",
  },
};

function header(doc, title, accent) {
  doc.setDrawColor(226, 232, 240);
  doc.line(20, 12, 190, 12);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(150);
  doc.text((title || "").slice(0, 70), 20, 9);
  doc.text(`${format(new Date(), "dd/MM/yyyy")}`, 190, 9, { align: "right" });
  doc.setTextColor(0);
}
function footer(doc, pageNum) {
  doc.setDrawColor(226, 232, 240);
  doc.line(20, 282, 190, 282);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(150);
  doc.text("Relatório gerado pela plataforma Pesquisa Completa", 105, 287, { align: "center" });
  doc.text(`Pág. ${pageNum}`, 190, 287, { align: "right" });
  doc.setTextColor(0);
}
function sectionTitle(doc, text, y, accent) {
  doc.setFillColor(...accent);
  doc.rect(20, y, 170, 9, "F");
  doc.setTextColor(255);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(text, 25, y + 6.5);
  doc.setTextColor(0);
  return y + 16;
}

export async function generatePDF(model, options = {}) {
  const tpl = TEMPLATES[options.template] || TEMPLATES.eleitoral;
  const accent = options.accent || tpl.accent;
  const sections = options.sections || {};
  const chartType = options.chartType || "bar";
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const title = model.title || "Pesquisa";
  let pg = 1;

  const ensureSpace = (y, need) => {
    if (y + need > 280) { doc.addPage(); pg++; header(doc, title, accent); footer(doc, pg); return 18; }
    return y;
  };
  const addChart = (y, data, type) => {
    const img = renderChart({ type, data, width: 520 });
    if (!img) return y;
    const w = 165;
    const h = w * (img.h / img.w);
    y = ensureSpace(y, h + 4);
    doc.addImage(img.dataUrl, "PNG", 22, y, w, h);
    return y + h + 5;
  };

  // ── CAPA ───────────────────────────────────────────────────────────
  doc.setFillColor(...accent);
  doc.rect(0, 0, 210, 70, "F");
  if (options.logoDataUrl) {
    try {
      doc.setFillColor(255); doc.roundedRect(89, 12, 32, 32, 2, 2, "F");
      doc.addImage(options.logoDataUrl, "PNG", 91, 14, 28, 28);
    } catch { /* logo inválida: ignora */ }
  }
  doc.setTextColor(255);
  doc.setFontSize(options.logoDataUrl ? 18 : 24);
  doc.setFont("helvetica", "bold");
  doc.text("Relatório de Pesquisa", 105, options.logoDataUrl ? 54 : 34, { align: "center" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const subt = doc.splitTextToSize(tpl.subtitle, 150);
  doc.text(subt, 105, options.logoDataUrl ? 62 : 48, { align: "center" });

  doc.setTextColor(...accent);
  doc.setFontSize(17);
  doc.setFont("helvetica", "bold");
  const titleLines = doc.splitTextToSize(title, 160);
  doc.text(titleLines, 105, 100, { align: "center" });

  doc.setFillColor(247, 249, 252);
  doc.setDrawColor(210, 220, 235);
  doc.roundedRect(35, 140, 140, 62, 3, 3, "FD");
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 75, 100);
  const info = [
    `Trabalho de campo: ${model.periodStart} a ${model.periodEnd}`,
    `Total de entrevistas: ${model.total}`,
    `Margem de erro: ${model.marginError}% (p/ mais ou p/ menos)`,
    `Intervalo de confiança: 95%`,
    `Entrevistadores: ${model.interviewers.length}`,
    `Entrevistas com GPS: ${model.withGeo}`,
  ];
  info.forEach((l, i) => doc.text(l, 105, 152 + i * 8, { align: "center" }));

  doc.setTextColor(120);
  doc.setFontSize(9);
  doc.text(
    format(new Date(), "MMMM 'de' yyyy", { locale: ptBR }).replace(/^\w/, c => c.toUpperCase()),
    105, 250, { align: "center" }
  );

  // ── RESUMO (executivo) ────────────────────────────────────────────
  let y;
  if (options.template === "executivo") {
    doc.addPage(); pg++; header(doc, title, accent); footer(doc, pg); y = 18;
    y = sectionTitle(doc, "PRINCIPAIS INDICADORES", y, accent);
    const cards = [
      ["Entrevistas", String(model.total)],
      ["Margem de erro", `${model.marginError}%`],
      ["Com GPS", String(model.withGeo)],
      ["Com áudio", String(model.withAudio)],
      ["Entrevistadores", String(model.interviewers.length)],
      ["Período", `${model.periodStart} a ${model.periodEnd}`],
    ];
    let cx = 20, cy = y;
    cards.forEach((c, i) => {
      const col = i % 3; const row = Math.floor(i / 3);
      const x = 20 + col * 57; const yy = cy + row * 26;
      doc.setFillColor(247, 249, 252); doc.roundedRect(x, yy, 53, 22, 2, 2, "F");
      doc.setTextColor(...accent); doc.setFont("helvetica", "bold"); doc.setFontSize(13);
      doc.text(String(c[1]).slice(0, 16), x + 4, yy + 10);
      doc.setTextColor(110); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
      doc.text(c[0], x + 4, yy + 17);
    });
    y = cy + 26 * 2 + 6;
  }

  // ── METODOLOGIA ────────────────────────────────────────────────────
  if (sections.metodologia) {
    doc.addPage(); pg++; header(doc, title, accent); footer(doc, pg); y = 18;
    y = sectionTitle(doc, "METODOLOGIA", y, accent);
    const meth = [
      ["Tipo de Pesquisa:", "Pesquisa quantitativa do tipo Survey, fundamentada na Teoria da Amostragem, com amostras probabilísticas estratificadas."],
      ["Instrumento de Coleta:", "Questionário estruturado digital, com registro automático de geolocalização e opção de gravação de áudio."],
      ["Tamanho da Amostra:", `${model.total} entrevistas presenciais e individuais, realizadas de ${model.periodStart} a ${model.periodEnd}.`],
      ["Margem de Erro:", `${model.marginError}% (p/ mais ou p/ menos), com Intervalo de Confiança de 95%.`],
      ["Georreferenciamento:", `${model.withGeo} entrevistas (${model.total > 0 ? ((model.withGeo / model.total) * 100).toFixed(1) : 0}%) com coordenadas GPS, permitindo controle territorial e verificação dos percursos.`],
      ["Registro de Áudio:", `${model.withAudio} entrevistas (${model.total > 0 ? ((model.withAudio / model.total) * 100).toFixed(1) : 0}%) com áudio para auditoria e conferência de respostas.`],
      ["Equipe de Campo:", `${model.interviewers.length} entrevistador(es): ${model.interviewers.join(", ") || "—"}.`],
      ["Processamento:", "Coleta digital, verificação crítica, checagem de percursos por geolocalização e consolidação na plataforma Pesquisa Completa."],
    ];
    meth.forEach(([label, text]) => {
      y = ensureSpace(y, 18);
      doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...accent);
      doc.text(label, 20, y);
      doc.setFont("helvetica", "normal"); doc.setTextColor(50);
      const lines = doc.splitTextToSize(text, 165);
      doc.text(lines, 20, y + 5);
      y += 6 + lines.length * 4.5 + 4;
    });
  }

  // ── MAPA ───────────────────────────────────────────────────────────
  if (sections.mapa && options.mapDataUrl) {
    doc.addPage(); pg++; header(doc, title, accent); footer(doc, pg); y = 18;
    y = sectionTitle(doc, "DISTRIBUIÇÃO TERRITORIAL DAS ENTREVISTAS", y, accent);
    try {
      const w = 165; const h = options.mapHeight ? w * (options.mapHeight / options.mapWidth) : 110;
      doc.addImage(options.mapDataUrl, "PNG", 22, y, w, h);
      y += h + 4;
    } catch { /* mapa inválido */ }
    doc.setFontSize(8); doc.setTextColor(110);
    doc.text(`${model.withGeo} de ${model.total} entrevistas com geolocalização.`, 20, y + 2);
  }

  // ── RESULTADOS POR QUESTÃO ─────────────────────────────────────────
  if (sections.resultados) {
    for (let qi = 0; qi < model.questions.length; qi++) {
      const q = model.questions[qi];
      doc.addPage(); pg++; header(doc, title, accent); footer(doc, pg); y = 18;
      y = sectionTitle(doc, `QUESTÃO ${qi + 1}`, y, accent);
      doc.setFontSize(10.5); doc.setFont("helvetica", "bold"); doc.setTextColor(20);
      const qLines = doc.splitTextToSize(q.text, 165);
      doc.text(qLines, 20, y); y += qLines.length * 5.5 + 3;
      doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(110);
      doc.text(`${q.total} respostas  ·  Tipo: ${(q.type || "").replace(/_/g, " ")}`, 20, y); y += 7;

      const useType = q.type === "aberta" ? "bar" : chartType;
      y = addChart(y, q.data, useType);

      // tabela
      y = ensureSpace(y, 16);
      doc.setFillColor(...accent); doc.rect(20, y, 165, 7, "F");
      doc.setTextColor(255); doc.setFontSize(8); doc.setFont("helvetica", "bold");
      doc.text("Opção de resposta", 23, y + 5);
      doc.text("Qtd.", 150, y + 5, { align: "right" });
      doc.text("%", 182, y + 5, { align: "right" });
      y += 8;
      const tot = q.data.reduce((s, d) => s + d.value, 0) || 1;
      q.data.slice(0, 12).forEach(({ name, value }, idx) => {
        y = ensureSpace(y, 7);
        if (idx % 2 === 0) { doc.setFillColor(247, 249, 252); doc.rect(20, y - 2, 165, 7, "F"); }
        doc.setFont("helvetica", "normal"); doc.setTextColor(50); doc.setFontSize(8);
        doc.text((name.length > 52 ? name.slice(0, 51) + "…" : name), 23, y + 3.5);
        doc.text(String(value), 150, y + 3.5, { align: "right" });
        doc.text(`${((value / tot) * 100).toFixed(1)}%`, 182, y + 3.5, { align: "right" });
        y += 7;
      });
    }
  }

  // ── CRUZAMENTOS (sexo/idade × resposta) ────────────────────────────
  if (sections.cruzamentos && model.crosstabs.length) {
    for (const ct of model.crosstabs) {
      doc.addPage(); pg++; header(doc, title, accent); footer(doc, pg); y = 18;
      y = sectionTitle(doc, "CRUZAMENTO DE DADOS", y, accent);
      doc.setFontSize(9.5); doc.setFont("helvetica", "bold"); doc.setTextColor(20);
      const tl = doc.splitTextToSize(ct.questionText, 165);
      doc.text(tl, 20, y); y += tl.length * 5 + 3;

      for (const [varName, table] of Object.entries(ct.byVar)) {
        y = ensureSpace(y, 14 + table.rows.length * 7);
        doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...accent);
        doc.text(varName === "sexo" ? "Por sexo" : "Por faixa etária", 20, y); y += 5;
        const cols = table.cols;
        const colW = Math.min(28, 140 / Math.max(cols.length, 1));
        const x0 = 20, labelW = 40;
        doc.setFillColor(...accent); doc.rect(x0, y, labelW + colW * cols.length, 6, "F");
        doc.setTextColor(255); doc.setFontSize(7); doc.setFont("helvetica", "bold");
        cols.forEach((c, i) => doc.text((c.length > 12 ? c.slice(0, 11) + "…" : c), x0 + labelW + i * colW + colW / 2, y + 4, { align: "center" }));
        y += 6;
        table.rows.forEach((r, ri) => {
          if (ri % 2 === 0) { doc.setFillColor(247, 249, 252); doc.rect(x0, y, labelW + colW * cols.length, 6, "F"); }
          doc.setTextColor(50); doc.setFont("helvetica", "normal"); doc.setFontSize(7);
          doc.text(`${(r.label.length > 16 ? r.label.slice(0, 15) + "…" : r.label)}`, x0 + 2, y + 4);
          r.pcts.forEach((p, i) => doc.text(`${p.toFixed(1)}%`, x0 + labelW + i * colW + colW / 2, y + 4, { align: "center" }));
          y += 6;
        });
        y += 4;
      }
    }
  }

  // ── ANÁLISE IA ─────────────────────────────────────────────────────
  if (sections.analise && options.aiText) {
    doc.addPage(); pg++; header(doc, title, accent); footer(doc, pg); y = 18;
    y = sectionTitle(doc, "ANÁLISE QUALITATIVA E CONCLUSÕES", y, accent);
    const cleaned = options.aiText.replace(/\*\*/g, "").replace(/#{1,6}\s*/g, "").trim();
    const paras = cleaned.split(/\n+/).filter(p => p.trim().length > 3);
    doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(50);
    for (const para of paras) {
      const t = para.trim();
      const isHeading = t.endsWith(":") || (t === t.toUpperCase() && t.length < 70 && t.length > 4);
      if (isHeading) {
        y = ensureSpace(y, 10); y += 2;
        doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(...accent);
        doc.text(t, 20, y);
        doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(50); y += 7;
      } else {
        const lines = doc.splitTextToSize(t, 165);
        y = ensureSpace(y, lines.length * 4.8 + 3);
        doc.text(lines, 20, y); y += lines.length * 4.8 + 3;
      }
    }
  }

  // primeira página (capa) não tem header/footer; aplica nas demais já feito.
  doc.save(`relatorio-${title.slice(0, 25).replace(/\s+/g, "-")}-${format(new Date(), "yyyyMMdd")}.pdf`);
}
