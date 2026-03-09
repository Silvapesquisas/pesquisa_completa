import { jsPDF } from "jspdf";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const PALETTE = [
  [59, 130, 246],
  [34, 197, 94],
  [245, 158, 11],
  [239, 68, 68],
  [168, 85, 247],
  [20, 184, 166],
  [249, 115, 22],
  [236, 72, 153],
];

function pageHeader(doc, surveyTitle) {
  doc.setDrawColor(226, 232, 240);
  doc.line(20, 12, 190, 12);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(150);
  doc.text(surveyTitle.slice(0, 70), 20, 9);
  doc.text(`FieldSurvey  ·  ${format(new Date(), "dd/MM/yyyy")}`, 190, 9, { align: "right" });
  doc.setTextColor(0);
}

function pageFooter(doc, pageNum) {
  doc.setDrawColor(226, 232, 240);
  doc.line(20, 282, 190, 282);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(150);
  doc.text("Relatório gerado automaticamente pelo FieldSurvey", 105, 287, { align: "center" });
  doc.text(`Pág. ${pageNum}`, 190, 287, { align: "right" });
  doc.setTextColor(0);
}

function sectionTitle(doc, text, y) {
  doc.setFillColor(30, 58, 138);
  doc.rect(20, y, 170, 9, "F");
  doc.setTextColor(255);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(text, 25, y + 6.5);
  doc.setTextColor(0);
  return y + 16;
}

function drawBars(doc, data, x, startY, barW = 85) {
  const items = data.slice(0, 10);
  const total = items.reduce((s, d) => s + d.value, 0) || 1;
  const maxVal = Math.max(...items.map(d => d.value), 1);
  let y = startY;

  items.forEach(({ name, value }, idx) => {
    const color = PALETTE[idx % PALETTE.length];
    const pct = ((value / total) * 100).toFixed(1);
    const fill = (value / maxVal) * barW;
    const label = name.length > 28 ? name.slice(0, 27) + "…" : name;

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60);
    doc.text(label, x, y + 6);

    doc.setFillColor(235, 240, 250);
    doc.roundedRect(x + 72, y, barW, 8, 1, 1, "F");
    doc.setFillColor(...color);
    if (fill > 0) doc.roundedRect(x + 72, y, Math.max(fill, 1.5), 8, 1, 1, "F");

    doc.setFontSize(7.5);
    doc.setTextColor(60);
    doc.text(`${value}  (${pct}%)`, x + 72 + barW + 3, y + 6);

    y += 13;
  });
  return y + 2;
}

export async function generatePDF({ surveyObj, filtered, questionStats, aiText, dateFrom, dateTo }) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const surveyTitle = surveyObj?.title || "Pesquisa";
  const total = filtered.length;
  const interviewers = [...new Set(filtered.map(i => i.interviewer_name).filter(Boolean))];
  const withGeo = filtered.filter(i => i.latitude && i.longitude).length;
  const withAudio = filtered.filter(i => i.audio_url).length;
  const marginError = total > 0 ? (1.96 * Math.sqrt(0.25 / total) * 100).toFixed(2) : "—";

  const periodStart = dateFrom || "—";
  const periodEnd = dateTo || "—";

  // ── CAPA ────────────────────────────────────────────────────────
  doc.setFillColor(15, 40, 100);
  doc.rect(0, 0, 210, 75, "F");
  doc.setFillColor(30, 58, 138);
  doc.rect(0, 65, 210, 15, "F");

  doc.setTextColor(255);
  doc.setFontSize(26);
  doc.setFont("helvetica", "bold");
  doc.text("Relatório de Pesquisa", 105, 25, { align: "center" });
  doc.text("de Opinião Pública", 105, 38, { align: "center" });

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const subtitleLines = doc.splitTextToSize(
    "(Relatório Descritivo contendo informações técnicas, distribuição territorial dos resultados e representação gráfica)",
    155
  );
  doc.text(subtitleLines, 105, 53, { align: "center" });

  doc.setFillColor(255);
  doc.rect(0, 80, 210, 110, "F");
  doc.setTextColor(15, 40, 100);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  const titleLines = doc.splitTextToSize(surveyTitle, 160);
  doc.text(titleLines, 105, 108, { align: "center" });

  doc.setFillColor(247, 249, 252);
  doc.setDrawColor(210, 220, 235);
  doc.roundedRect(35, 148, 140, 56, 3, 3, "FD");
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 75, 100);
  const infoLines = [
    `Trabalho de campo: ${periodStart} a ${periodEnd}`,
    `Total de entrevistas: ${total} entrevistas presenciais`,
    `Margem de erro: ${marginError}% (para mais ou para menos)`,
    `Intervalo de confiança: 95%`,
    `Entrevistadores participantes: ${interviewers.length}`,
  ];
  infoLines.forEach((line, idx) => doc.text(line, 105, 163 + idx * 8, { align: "center" }));

  doc.setFillColor(15, 40, 100);
  doc.rect(0, 218, 210, 79, "F");
  doc.setTextColor(200, 215, 240);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(
    format(new Date(), "MMMM 'de' yyyy", { locale: ptBR }).replace(/^\w/, c => c.toUpperCase()),
    105, 250, { align: "center" }
  );
  doc.setFontSize(8);
  doc.text("Gerado automaticamente pelo FieldSurvey", 105, 262, { align: "center" });

  // ── METODOLOGIA ─────────────────────────────────────────────────
  doc.addPage();
  let pg = 2;
  pageHeader(doc, surveyTitle);
  pageFooter(doc, pg);

  let y = 18;
  y = sectionTitle(doc, "METODOLOGIA", y);

  const methItems = [
    ["Tipo de Pesquisa:", "Exploratória/Amostral — pesquisa científica quantitativa e qualitativa, do tipo Survey, fundamentada nos princípios da Teoria da Amostragem, por meio de Amostras Probabilísticas Estratificadas."],
    ["Instrumento de Coleta:", "Questionário Estruturado Padronizado digital, com perguntas formuladas para atender aos objetivos da pesquisa, incluindo registro automático de geolocalização e opção de gravação de áudio."],
    ["Tamanho da Amostra:", `${total} entrevistas presenciais, pessoais e individuais realizadas no período de ${periodStart} a ${periodEnd}.`],
    ["Margem de Erro:", `${marginError}% (para mais ou para menos), para o total da amostra, com Intervalo de Confiança de 95% — o que equivale a dizer que a cada 100 pesquisas realizadas com a mesma metodologia, 95 estarão dentro da margem de erro prevista.`],
    ["Georreferenciamento:", `${withGeo} entrevistas (${total > 0 ? ((withGeo / total) * 100).toFixed(1) : 0}% do total) registradas com coordenadas GPS, permitindo controle territorial do trabalho de campo e verificação dos percursos dos entrevistadores.`],
    ["Registro de Áudio:", `${withAudio} entrevistas (${total > 0 ? ((withAudio / total) * 100).toFixed(1) : 0}% do total) com gravação de áudio para controle interno de qualidade e conferência de respostas.`],
    ["Equipe de Campo:", `${interviewers.length} entrevistador(es): ${interviewers.join(", ") || "—"}.`],
    ["Controle de Qualidade:", "Verificação crítica do processamento, checagem dos percursos por geolocalização, validação de cotas por localidade e análise de consistência das respostas antes da consolidação final."],
    ["Processamento:", "Os dados foram coletados digitalmente, processados e consolidados na plataforma FieldSurvey, com análise automática de resultados e geração de relatório técnico-descritivo."],
  ];

  methItems.forEach(([label, text]) => {
    if (y > 255) { doc.addPage(); pg++; pageHeader(doc, surveyTitle); pageFooter(doc, pg); y = 18; }
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 58, 138);
    doc.text(label, 20, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50);
    const lines = doc.splitTextToSize(text, 165);
    doc.text(lines, 20, y + 5);
    y += 6 + lines.length * 4.5 + 4;
  });

  // ── RESULTADOS POR QUESTÃO ──────────────────────────────────────
  const validQs = (questionStats || []).filter(qs => Object.keys(qs.counts).length > 0);

  for (let qi = 0; qi < validQs.length; qi++) {
    const { question, counts, total: qTotal } = validQs[qi];
    doc.addPage();
    pg++;
    pageHeader(doc, surveyTitle);
    pageFooter(doc, pg);
    y = 18;

    y = sectionTitle(doc, `QUESTÃO ${qi + 1}`, y);

    doc.setFontSize(10.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20);
    const qLines = doc.splitTextToSize(question.text, 165);
    doc.text(qLines, 20, y);
    y += qLines.length * 5.5 + 4;

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(110);
    doc.text(`${qTotal} respostas  ·  Tipo: ${question.type?.replace(/_/g, " ")}`, 20, y);
    y += 8;

    const chartData = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, value]) => ({ name, value }));

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(50);
    doc.text("Distribuição das Respostas:", 20, y);
    y += 6;

    y = drawBars(doc, chartData, 20, y, 85);
    y += 4;

    if (y < 240) {
      doc.setFillColor(30, 58, 138);
      doc.rect(20, y, 165, 7, "F");
      doc.setTextColor(255);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text("Opção de resposta", 23, y + 5);
      doc.text("Qtd.", 148, y + 5, { align: "right" });
      doc.text("%", 182, y + 5, { align: "right" });
      y += 8;

      const rowTotal = chartData.reduce((s, d) => s + d.value, 0) || 1;
      chartData.forEach(({ name, value }, idx) => {
        if (y > 262) return;
        if (idx % 2 === 0) { doc.setFillColor(247, 249, 252); doc.rect(20, y - 2, 165, 7, "F"); }
        doc.setFont("helvetica", "normal");
        doc.setTextColor(50);
        const nameStr = name.length > 50 ? name.slice(0, 49) + "…" : name;
        doc.text(nameStr, 23, y + 3.5);
        doc.text(String(value), 148, y + 3.5, { align: "right" });
        doc.text(`${((value / rowTotal) * 100).toFixed(1)}%`, 182, y + 3.5, { align: "right" });
        y += 7;
      });
    }
  }

  // ── ANÁLISE IA E CONCLUSÕES ─────────────────────────────────────
  if (aiText) {
    doc.addPage();
    pg++;
    pageHeader(doc, surveyTitle);
    pageFooter(doc, pg);
    y = 18;

    y = sectionTitle(doc, "ANÁLISE QUALITATIVA E CONCLUSÕES", y);

    const cleaned = aiText.replace(/\*\*/g, "").replace(/#{1,6}\s*/g, "").trim();
    const paragraphs = cleaned.split(/\n+/).filter(p => p.trim().length > 3);

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50);

    for (const para of paragraphs) {
      if (y > 265) {
        doc.addPage();
        pg++;
        pageHeader(doc, surveyTitle);
        pageFooter(doc, pg);
        y = 18;
      }
      const trimmed = para.trim();
      const isHeading = trimmed.endsWith(":") || (trimmed === trimmed.toUpperCase() && trimmed.length < 70 && trimmed.length > 4);
      if (isHeading) {
        y += 2;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(30, 58, 138);
        doc.text(trimmed, 20, y);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(50);
        y += 7;
      } else {
        const lines = doc.splitTextToSize(trimmed, 165);
        doc.text(lines, 20, y);
        y += lines.length * 4.8 + 3;
      }
    }
  }

  doc.save(`relatorio-${surveyTitle.slice(0, 25).replace(/\s+/g, "-")}-${format(new Date(), "yyyyMMdd")}.pdf`);
}