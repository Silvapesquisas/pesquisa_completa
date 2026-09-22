// Exportação do instrumento de pesquisa (questionário) em PDF e DOCX.
// Documento voltado ao cliente/solicitante: cabeçalho com os dados e a logo da
// empresa responsável, ficha técnica (incluindo a quantidade de entrevistas
// previstas) e o questionário completo, em um layout enxuto e organizado.
import { jsPDF } from "jspdf";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Document, Packer, Paragraph, TextRun, AlignmentType, ImageRun,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  Header, Footer, PageNumber,
} from "docx";
import { buildSamplePlan, fmtPct } from "@/lib/sampling";

/** @type {[number, number, number]} */
const ACCENT = [29, 78, 216];        // blue-700
const ACCENT_HEX = "1D4ED8";
const GRAY_HEX = "6B7280";
/** @type {[number, number, number]} */
const TEXT = [55, 65, 81];      // slate-700
/** @type {[number, number, number]} */
const HEADING = [30, 41, 59];   // slate-800

const CATEGORY_LABEL = {
  urbano: "Urbano", rural: "Rural", ambiental: "Ambiental", social: "Social",
  mercado: "Mercado", eleitoral: "Eleitoral", outro: "Outro",
};
const STATUS_LABEL = {
  rascunho: "Rascunho", ativa: "Ativa", pausada: "Pausada", encerrada: "Encerrada",
};
const TYPE_LABEL = {
  aberta: "Resposta aberta", multipla_escolha: "Múltipla escolha",
  unica_escolha: "Única escolha", escala: "Escala (1 a 5)", sim_nao: "Sim / Não",
};
const LETTERS = "abcdefghijklmnopqrstuvwxyz";

const fmtDate = (value) => {
  if (!value) return null;
  try {
    const d = typeof value === "string" && value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
    return Number.isNaN(d.getTime()) ? null : format(d, "dd/MM/yyyy", { locale: ptBR });
  } catch { return null; }
};

const optionsOf = (q) => {
  if (q.type === "sim_nao") return ["Sim", "Não"];
  if (q.type === "escala") return ["1", "2", "3", "4", "5"];
  if (q.type === "aberta") return [];
  return (q.options || []).filter(o => String(o || "").trim() !== "");
};

// Explicita a base do cálculo da margem de erro — é a primeira coisa que um
// solicitante técnico pergunta.
function methodologyNote(plan) {
  const parts = [`amostra aleatória${plan.hasStrata ? " estratificada" : ""} de ${plan.n} entrevistas`];
  if (plan.N) parts.push(`universo de ${plan.N.toLocaleString("pt-BR")} (com correção de população finita)`);
  else parts.push("população tratada como infinita");
  parts.push("proporção de 50% (pior caso)");
  if (plan.deff > 1) parts.push(`efeito de desenho de ${String(plan.deff).replace(".", ",")}`);
  return parts.join("; ") + ".";
}

/**
 * Monta o modelo, independente de formato, usado pelo PDF e pelo DOCX.
 */
export function buildSurveyExportModel(survey, company) {
  const questions = [...(survey?.questions || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const numberOf = (id) => {
    const i = questions.findIndex(q => q.id === id);
    return i >= 0 ? i + 1 : null;
  };

  const target = Number(survey?.target_interviews) || 0;
  const start = fmtDate(survey?.start_date);
  const end = fmtDate(survey?.end_date);
  const logo = typeof company?.logo_url === "string" && company.logo_url.startsWith("data:image")
    ? company.logo_url
    : null;

  const plan = buildSamplePlan(survey);

  const fichaTecnica = [
    ["Entrevistas previstas", target > 0 ? `${target} entrevista(s)` : "A definir"],
  ];
  if (plan.N) fichaTecnica.push(["Universo (público-alvo)", `${plan.N.toLocaleString("pt-BR")} pessoas`]);
  fichaTecnica.push(
    ["Período de campo", start && end ? `${start} a ${end}` : (start ? `A partir de ${start}` : (end ? `Até ${end}` : "A definir"))],
    ["Questões do instrumento", `${questions.length}`],
    ["Tipo de pesquisa", CATEGORY_LABEL[survey?.category] || survey?.category || "—"],
    ["Situação", STATUS_LABEL[survey?.status] || survey?.status || "—"],
  );
  if (Number(survey?.max_interviews_per_interviewer) > 0) {
    fichaTecnica.push(["Máximo por entrevistador", `${Number(survey.max_interviews_per_interviewer)} entrevista(s)`]);
  }
  if (plan.margin != null) {
    fichaTecnica.push(["Margem de erro estimada", `± ${fmtPct(plan.margin)} (IC ${plan.confidence}%)`]);
    fichaTecnica.push(["Base do cálculo", methodologyNote(plan)]);
  }
  if (plan.deff > 1) fichaTecnica.push(["Efeito de desenho", String(plan.deff).replace(".", ",")]);
  fichaTecnica.push(["Registro de áudio", survey?.require_audio ? "Obrigatório em todas as entrevistas" : "Não obrigatório"]);
  fichaTecnica.push(["Coleta", plan.hasStrata
    ? "Aplicação presencial com questionário digital, cotas por estrato e registro de geolocalização"
    : "Aplicação presencial com questionário digital e registro de geolocalização"]);

  return {
    company: {
      name: company?.name || "",
      cnpj: company?.cnpj || "",
      phone: company?.phone || "",
      email: company?.owner_email || "",
      logo,
    },
    title: survey?.title || "Pesquisa",
    description: (survey?.description || "").trim(),
    targetInterviews: target,
    plan,
    fichaTecnica,
    emittedAt: format(new Date(), "dd/MM/yyyy", { locale: ptBR }),
    questions: questions.map((q, i) => {
      const depNumber = q.depends_on_question_id ? numberOf(q.depends_on_question_id) : null;
      const skips = (q.skip_logic || [])
        .map(r => {
          if (r.target === "__end__") return { answer: r.answer, to: "encerrar a entrevista" };
          const n = numberOf(r.target);
          return n ? { answer: r.answer, to: `ir para a questão ${n}` } : null;
        })
        .filter(Boolean);
      return {
        number: i + 1,
        text: (q.text || "").trim() || "(questão sem enunciado)",
        typeLabel: TYPE_LABEL[q.type] || q.type || "—",
        required: !!q.required,
        options: optionsOf(q),
        openAnswer: q.type === "aberta",
        scale: q.type === "escala",
        condition: depNumber && q.depends_on_answer
          ? `Somente se a questão ${depNumber} for respondida como "${q.depends_on_answer}".`
          : (depNumber ? `Condicionada à resposta da questão ${depNumber}.` : null),
        skips,
      };
    }),
  };
}

const safeFileName = (title) =>
  `questionario-${(title || "pesquisa").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40).replace(/-[^-]*$/, "").toLowerCase() || "pesquisa"}-${format(new Date(), "yyyyMMdd")}`;

const download = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};

// Lê as dimensões reais da imagem para preservar a proporção da logo.
function imageSize(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}
const fitBox = (size, maxW, maxH) => {
  if (!size) return null;
  const ratio = Math.min(maxW / size.w, maxH / size.h);
  return { w: size.w * ratio, h: size.h * ratio };
};

/* ──────────────────────────────── PDF ──────────────────────────────── */

const M = { left: 18, right: 192, top: 38, bottom: 276 }; // margens úteis (mm)
const CONTENT_W = M.right - M.left;

export async function buildSurveyPDF(survey, company) {
  const model = buildSurveyExportModel(survey, company);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const logoBox = model.company.logo ? fitBox(await imageSize(model.company.logo), 24, 16) : null;

  const drawHeader = () => {
    let textX = M.left;
    if (logoBox) {
      try {
        doc.addImage(model.company.logo, "PNG", M.left, 11, logoBox.w, logoBox.h);
        textX = M.left + logoBox.w + 5;
      } catch { /* logo inválida: segue sem ela */ }
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.setTextColor(30, 41, 59);
    doc.text((model.company.name || "Empresa responsável").slice(0, 45), textX, 16);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(120, 128, 140);
    const line1 = [model.company.cnpj && `CNPJ ${model.company.cnpj}`, model.company.phone].filter(Boolean).join("  ·  ");
    if (line1) doc.text(line1.slice(0, 60), textX, 20.5);
    if (model.company.email) doc.text(model.company.email.slice(0, 60), textX, 24.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...ACCENT);
    doc.text("INSTRUMENTO DE PESQUISA", M.right, 16, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 128, 140);
    doc.text(`Emitido em ${model.emittedAt}`, M.right, 20.5, { align: "right" });

    doc.setDrawColor(...ACCENT);
    doc.setLineWidth(0.7);
    doc.line(M.left, 29, M.right, 29);
    doc.setLineWidth(0.2);
    doc.setTextColor(0);
  };

  drawHeader();
  let y = M.top;

  const ensure = (need) => {
    if (y + need > M.bottom) {
      doc.addPage();
      drawHeader();
      y = M.top;
    }
  };
  const paragraph = (text, { size = 9.5, style = "normal", color = TEXT, indent = 0, gap = 4, lineH = 4.6 } = {}) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, CONTENT_W - indent);
    lines.forEach((ln) => {
      ensure(lineH);
      doc.text(ln, M.left + indent, y);
      y += lineH;
    });
    y += gap;
  };
  const sectionTitle = (text) => {
    // Reserva espaço para o título e o começo do conteúdo, para o cabeçalho
    // da seção não ficar sozinho no pé da página.
    ensure(32);
    doc.setFillColor(...ACCENT);
    doc.rect(M.left, y, CONTENT_W, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(255);
    doc.text(text.toUpperCase(), M.left + 4, y + 5.6);
    doc.setTextColor(0);
    y += 14;
  };

  // ── Identificação da pesquisa ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(...ACCENT);
  const titleLines = doc.splitTextToSize(model.title, CONTENT_W);
  titleLines.forEach((ln) => { ensure(8); doc.text(ln, M.left, y); y += 7.5; });
  y += 2;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120, 128, 140);
  const meta = [
    CATEGORY_LABEL[survey?.category] || survey?.category,
    `${model.questions.length} questões`,
    model.targetInterviews > 0 ? `${model.targetInterviews} entrevistas previstas` : null,
  ].filter(Boolean).join("   ·   ");
  ensure(6);
  doc.text(meta, M.left, y);
  y += 8;

  if (model.description) {
    paragraph("Objetivo da pesquisa", { size: 9, style: "bold", color: HEADING, gap: 1.5 });
    paragraph(model.description, { gap: 6 });
  }

  // ── Destaque: quantidade de entrevistas ──
  if (model.targetInterviews > 0) {
    ensure(20);
    doc.setFillColor(239, 246, 255);
    doc.setDrawColor(191, 219, 254);
    doc.roundedRect(M.left, y, CONTENT_W, 17, 2, 2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...ACCENT);
    doc.text(String(model.targetInterviews), M.left + 6, y + 11);
    const numW = doc.getTextWidth(String(model.targetInterviews));
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    doc.text("entrevistas previstas", M.left + 10 + numW, y + 8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(120, 128, 140);
    doc.text(`Margem de erro estimada de ± ${fmtPct(model.plan.margin)} para um intervalo de confiança de ${model.plan.confidence}%.`,
      M.left + 10 + numW, y + 12.5);
    y += 23;
  }

  // ── Ficha técnica ──
  sectionTitle("Ficha técnica");
  doc.setDrawColor(226, 232, 240);
  model.fichaTecnica.forEach(([k, v], i) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const valueLines = doc.splitTextToSize(String(v), CONTENT_W - 65);
    const rowH = Math.max(7, valueLines.length * 4.4 + 2.6);
    ensure(rowH);
    if (i % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(M.left, y - 4.5, CONTENT_W, rowH, "F");
    }
    doc.setFont("helvetica", "bold");
    doc.setTextColor(71, 85, 105);
    doc.text(k, M.left + 3, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 41, 59);
    valueLines.forEach((ln, li) => doc.text(ln, M.left + 62, y + li * 4.4));
    y += rowH;
  });
  y += 8;

  // ── Plano amostral (cotas por estrato) ──
  if (model.plan.hasStrata && model.plan.n) {
    sectionTitle("Plano amostral — distribuição das entrevistas");
    paragraph(
      `As ${model.plan.n} entrevistas são distribuídas proporcionalmente à participação de cada grupo no universo, `
      + "de modo que a amostra reproduza a composição da população pesquisada.",
      { size: 8.5, gap: 5 },
    );

    const COLS = [{ w: 74, align: "left" }, { w: 30, align: "right" }, { w: 30, align: "right" }, { w: 40, align: "right" }];
    /** @type {[number, number, number]} */
    const ZEBRA = [250, 251, 253];
    /** @type {[number, number, number]} */
    const HEAD_FILL = [241, 245, 249];
    /** @type {[number, number, number]} */
    const HEAD_TEXT = [71, 85, 105];
    const drawRow = (cells, { bold = false, fill = null, color = TEXT } = {}) => {
      ensure(7);
      if (fill) { doc.setFillColor(fill[0], fill[1], fill[2]); doc.rect(M.left, y - 4.5, CONTENT_W, 7, "F"); }
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...color);
      let x = M.left + 3;
      cells.forEach((c, i) => {
        const col = COLS[i];
        if (col.align === "right") doc.text(String(c), x + col.w - 6, y, { align: "right" });
        else doc.text(doc.splitTextToSize(String(c), col.w - 6)[0], x, y);
        x += col.w;
      });
      y += 7;
    };

    model.plan.strata.forEach((st) => {
      // Mantém o quadro do estrato inteiro na mesma página sempre que couber.
      ensure(Math.min(10 + 7 * (st.groups.length + 2), 120));
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...HEADING);
      doc.text(st.label, M.left, y);
      y += 6;
      drawRow(["Grupo", "% do universo", "Entrevistas", "Margem do grupo"],
        { bold: true, fill: HEAD_FILL, color: HEAD_TEXT });
      st.groups.forEach((g, gi) => drawRow(
        [g.label, fmtPct(g.normalizedShare), String(g.quota), `± ${fmtPct(g.margin)}`],
        { fill: gi % 2 === 0 ? ZEBRA : null },
      ));
      drawRow(["Total", "100,0%", String(st.groups.reduce((a, g) => a + g.quota, 0)), `± ${fmtPct(model.plan.margin)}`],
        { bold: true, color: HEADING });
      if (!st.shareOk) {
        paragraph(`Atenção: as participações informadas para "${st.label}" somam ${fmtPct(st.shareSum)} e foram renormalizadas para 100%.`,
          { size: 7.5, style: "italic", color: [180, 83, 9], gap: 1 });
      }
      y += 5;
    });

    paragraph(
      "A margem de erro por grupo é sempre maior que a do total, porque cada recorte tem menos entrevistas. "
      + "Leituras por estrato devem considerar a margem da própria linha.",
      { size: 7.5, style: "italic", color: [140, 148, 160], gap: 6 },
    );
  }

  // ── Questionário ──
  sectionTitle("Questionário");
  model.questions.forEach((q, idx) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    const textLines = doc.splitTextToSize(q.text, CONTENT_W - 9);
    // Mantém o enunciado junto das primeiras alternativas (evita questão órfã
    // no fim da página). Limita a 70mm para questões muito longas.
    const answersH = q.openAnswer ? 13 : (q.scale ? 8 : Math.min(q.options.length, 4) * 5.2);
    ensure(Math.min(textLines.length * 5 + 11 + answersH, 70));

    if (idx > 0 && y > M.top) {
      doc.setDrawColor(235, 239, 245);
      doc.line(M.left, y - 5, M.right, y - 5);
    }
    // Enunciado com recuo pendente para o número da questão.
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...ACCENT);
    doc.text(`${q.number}.`, M.left, y);
    doc.setTextColor(30, 41, 59);
    textLines.forEach((ln, li) => {
      if (li > 0) ensure(5);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(30, 41, 59);
      doc.text(ln, M.left + 9, y);
      y += 5;
    });
    y += 0.5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(140, 148, 160);
    ensure(5);
    doc.text(`${q.typeLabel}${q.required ? "  ·  Obrigatória" : "  ·  Opcional"}`, M.left + 9, y);
    y += 5;

    if (q.condition) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7.5);
      doc.setTextColor(180, 83, 9);
      doc.splitTextToSize(q.condition, CONTENT_W - 9).forEach((ln) => {
        ensure(4.4);
        doc.text(ln, M.left + 9, y);
        y += 4.4;
      });
      y += 1;
    }

    if (q.openAnswer) {
      ensure(12);
      doc.setDrawColor(214, 221, 231);
      doc.line(M.left + 9, y + 2, M.right, y + 2);
      doc.line(M.left + 9, y + 8, M.right, y + 8);
      y += 13;
    } else if (q.scale) {
      // Escala: caixas numeradas em uma única linha, mais enxuto que uma lista.
      ensure(10);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(55, 65, 81);
      q.options.forEach((opt, oi) => {
        const x = M.left + 9 + oi * 18;
        doc.setDrawColor(160, 174, 192);
        doc.rect(x, y - 2.8, 3.4, 3.4);
        doc.text(opt, x + 5, y);
      });
      y += 8;
    } else {
      q.options.forEach((opt, oi) => {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        const label = `${LETTERS[oi] ? `${LETTERS[oi]})` : "•"} ${opt}`;
        const lines = doc.splitTextToSize(label, CONTENT_W - 18);
        ensure(lines.length * 4.6 + 1);
        doc.setDrawColor(160, 174, 192);
        doc.rect(M.left + 9, y - 2.8, 3, 3);
        doc.setTextColor(55, 65, 81);
        lines.forEach((ln, li) => {
          doc.text(ln, M.left + 15, y + li * 4.6);
        });
        y += lines.length * 4.6 + 0.6;
      });
      y += 1;
    }

    if (q.skips.length) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7.5);
      doc.setTextColor(140, 148, 160);
      q.skips.forEach((s) => {
        ensure(4.2);
        doc.text(`Se "${s.answer}": ${s.to}.`, M.left + 15, y);
        y += 4.2;
      });
      y += 1;
    }
    y += 4;
  });

  // ── Rodapé com paginação (após conhecer o total de páginas) ──
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(M.left, 283, M.right, 283);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(150, 158, 170);
    doc.text(`${model.company.name || "Empresa responsável"}  ·  ${model.title}`.slice(0, 95), M.left, 288);
    doc.text(`Página ${p} de ${total}`, M.right, 288, { align: "right" });
  }

  return { doc, fileName: `${safeFileName(model.title)}.pdf` };
}

export async function exportSurveyPDF(survey, company) {
  const { doc, fileName } = await buildSurveyPDF(survey, company);
  doc.save(fileName);
}

/* ─────────────────────────────── DOCX ─────────────────────────────── */

const bytesFromDataUrl = (dataUrl) => {
  const b64 = dataUrl.split(",")[1] || "";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
};

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const cell = (children, size, shaded) => new TableCell({
  width: { size, type: WidthType.PERCENTAGE },
  shading: shaded ? { fill: "F8FAFC" } : undefined,
  margins: { top: 80, bottom: 80, left: 120, right: 120 },
  borders: { top: NO_BORDER, bottom: { style: BorderStyle.SINGLE, size: 2, color: "E2E8F0" }, left: NO_BORDER, right: NO_BORDER },
  children,
});
const P = (text, opts = {}) => {
  const { spacingAfter = 80, indent, alignment, ...run } = opts;
  return new Paragraph({
    alignment,
    indent: indent ? { left: indent } : undefined,
    spacing: { after: spacingAfter },
    children: [new TextRun({ text, ...run })],
  });
};

export async function buildSurveyDOCX(survey, company) {
  const model = buildSurveyExportModel(survey, company);
  const logoBox = model.company.logo ? fitBox(await imageSize(model.company.logo), 90, 54) : null;

  // ── Cabeçalho (repete em todas as páginas) ──
  const headerCells = [];
  if (logoBox) {
    try {
      headerCells.push(new TableCell({
        width: { size: 18, type: WidthType.PERCENTAGE },
        borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
        children: [new Paragraph({
          children: [new ImageRun({
            data: bytesFromDataUrl(model.company.logo),
            transformation: { width: Math.round(logoBox.w), height: Math.round(logoBox.h) },
          })],
        })],
      }));
    } catch { /* logo inválida: segue sem ela */ }
  }
  const contactLine = [model.company.cnpj && `CNPJ ${model.company.cnpj}`, model.company.phone, model.company.email]
    .filter(Boolean).join("  ·  ");
  headerCells.push(new TableCell({
    width: { size: logoBox ? 52 : 70, type: WidthType.PERCENTAGE },
    borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
    children: [
      P(model.company.name || "Empresa responsável", { bold: true, size: 23, color: "1E293B", spacingAfter: 20 }),
      P(contactLine, { size: 14, color: GRAY_HEX, spacingAfter: 0 }),
    ],
  }));
  headerCells.push(new TableCell({
    width: { size: 30, type: WidthType.PERCENTAGE },
    borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
    children: [
      P("INSTRUMENTO DE PESQUISA", { bold: true, size: 15, color: ACCENT_HEX, alignment: AlignmentType.RIGHT, spacingAfter: 20 }),
      P(`Emitido em ${model.emittedAt}`, { size: 14, color: GRAY_HEX, alignment: AlignmentType.RIGHT, spacingAfter: 0 }),
    ],
  }));

  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: NO_BORDER, left: NO_BORDER, right: NO_BORDER,
      bottom: { style: BorderStyle.SINGLE, size: 8, color: ACCENT_HEX },
      insideHorizontal: NO_BORDER, insideVertical: NO_BORDER,
    },
    rows: [new TableRow({ children: headerCells })],
  });

  const children = [];

  // ── Identificação da pesquisa ──
  children.push(P(model.title, { bold: true, size: 34, color: ACCENT_HEX, spacingAfter: 60 }));
  const meta = [
    CATEGORY_LABEL[survey?.category] || survey?.category,
    `${model.questions.length} questões`,
    model.targetInterviews > 0 ? `${model.targetInterviews} entrevistas previstas` : null,
  ].filter(Boolean).join("   ·   ");
  children.push(P(meta, { size: 17, color: GRAY_HEX, spacingAfter: 200 }));

  if (model.description) {
    children.push(P("Objetivo da pesquisa", { bold: true, size: 19, color: "1E293B", spacingAfter: 40 }));
    children.push(P(model.description, { size: 19, color: "374151", spacingAfter: 200 }));
  }

  if (model.targetInterviews > 0) {
    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 4, color: "BFDBFE" },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: "BFDBFE" },
        left: { style: BorderStyle.SINGLE, size: 4, color: "BFDBFE" },
        right: { style: BorderStyle.SINGLE, size: 4, color: "BFDBFE" },
        insideHorizontal: NO_BORDER, insideVertical: NO_BORDER,
      },
      rows: [new TableRow({
        children: [new TableCell({
          shading: { fill: "EFF6FF" },
          margins: { top: 160, bottom: 160, left: 200, right: 200 },
          children: [
            new Paragraph({
              spacing: { after: 20 },
              children: [
                new TextRun({ text: `${model.targetInterviews} `, bold: true, size: 32, color: ACCENT_HEX }),
                new TextRun({ text: "entrevistas previstas", bold: true, size: 19, color: "1E293B" }),
              ],
            }),
            P(`Margem de erro estimada de ± ${fmtPct(model.plan.margin)} para um intervalo de confiança de ${model.plan.confidence}%.`,
              { size: 15, color: GRAY_HEX, spacingAfter: 0 }),
          ],
        })],
      })],
    }));
    children.push(P("", { spacingAfter: 200 }));
  }

  // ── Ficha técnica ──
  const sectionTitle = (text) => new Paragraph({
    spacing: { before: 120, after: 140 },
    shading: { fill: ACCENT_HEX },
    children: [new TextRun({ text: `  ${text.toUpperCase()}`, bold: true, size: 19, color: "FFFFFF" })],
  });

  children.push(sectionTitle("Ficha técnica"));
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
    rows: model.fichaTecnica.map(([k, v], i) => new TableRow({
      children: [
        cell([P(k, { bold: true, size: 17, color: "475569", spacingAfter: 0 })], 35, i % 2 === 0),
        cell([P(String(v), { size: 17, color: "1E293B", spacingAfter: 0 })], 65, i % 2 === 0),
      ],
    })),
  }));
  children.push(P("", { spacingAfter: 200 }));

  // ── Plano amostral (cotas por estrato) ──
  if (model.plan.hasStrata && model.plan.n) {
    children.push(sectionTitle("Plano amostral — distribuição das entrevistas"));
    children.push(P(
      `As ${model.plan.n} entrevistas são distribuídas proporcionalmente à participação de cada grupo no universo, `
      + "de modo que a amostra reproduza a composição da população pesquisada.",
      { size: 17, color: "374151", spacingAfter: 140 },
    ));

    const headCell = (text, size, align) => new TableCell({
      width: { size, type: WidthType.PERCENTAGE },
      shading: { fill: "F1F5F9" },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      borders: { top: NO_BORDER, bottom: { style: BorderStyle.SINGLE, size: 2, color: "E2E8F0" }, left: NO_BORDER, right: NO_BORDER },
      children: [P(text, { bold: true, size: 15, color: "475569", alignment: align, spacingAfter: 0 })],
    });
    const dataCell = (text, size, align, { bold = false, shaded = false } = {}) =>
      cell([P(text, { size: 16, color: bold ? "1E293B" : "374151", bold, alignment: align, spacingAfter: 0 })], size, shaded);

    const R = AlignmentType.RIGHT;
    model.plan.strata.forEach((st) => {
      children.push(P(st.label, { bold: true, size: 19, color: "1E293B", spacingAfter: 60 }));
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
        rows: [
          new TableRow({
            tableHeader: true,
            children: [headCell("Grupo", 43), headCell("% do universo", 18, R), headCell("Entrevistas", 16, R), headCell("Margem do grupo", 23, R)],
          }),
          ...st.groups.map((g, gi) => new TableRow({
            children: [
              dataCell(g.label, 43, undefined, { shaded: gi % 2 === 0 }),
              dataCell(fmtPct(g.normalizedShare), 18, R, { shaded: gi % 2 === 0 }),
              dataCell(String(g.quota), 16, R, { shaded: gi % 2 === 0 }),
              dataCell(`± ${fmtPct(g.margin)}`, 23, R, { shaded: gi % 2 === 0 }),
            ],
          })),
          new TableRow({
            children: [
              dataCell("Total", 43, undefined, { bold: true }),
              dataCell("100,0%", 18, R, { bold: true }),
              dataCell(String(st.groups.reduce((a, g) => a + g.quota, 0)), 16, R, { bold: true }),
              dataCell(`± ${fmtPct(model.plan.margin)}`, 23, R, { bold: true }),
            ],
          }),
        ],
      }));
      if (!st.shareOk) {
        children.push(P(`Atenção: as participações informadas para "${st.label}" somam ${fmtPct(st.shareSum)} e foram renormalizadas para 100%.`,
          { size: 15, italics: true, color: "B45309", spacingAfter: 60 }));
      }
      children.push(P("", { spacingAfter: 120 }));
    });

    children.push(P(
      "A margem de erro por grupo é sempre maior que a do total, porque cada recorte tem menos entrevistas. "
      + "Leituras por estrato devem considerar a margem da própria linha.",
      { size: 15, italics: true, color: "8C94A0", spacingAfter: 200 },
    ));
  }

  // ── Questionário ──
  children.push(sectionTitle("Questionário"));
  model.questions.forEach((q) => {
    children.push(new Paragraph({
      spacing: { before: 200, after: 30 },
      children: [
        new TextRun({ text: `${q.number}. `, bold: true, size: 20, color: ACCENT_HEX }),
        new TextRun({ text: q.text, bold: true, size: 20, color: "1E293B" }),
      ],
    }));
    children.push(P(`${q.typeLabel}${q.required ? "  ·  Obrigatória" : "  ·  Opcional"}`,
      { size: 15, color: "8C94A0", indent: 280, spacingAfter: 60 }));

    if (q.condition) {
      children.push(P(q.condition, { size: 15, italics: true, color: "B45309", indent: 280, spacingAfter: 60 }));
    }
    if (q.openAnswer) {
      children.push(P("_".repeat(78), { size: 17, color: "D6DDE7", indent: 280, spacingAfter: 40 }));
      children.push(P("_".repeat(78), { size: 17, color: "D6DDE7", indent: 280, spacingAfter: 60 }));
    } else if (q.scale) {
      children.push(P(q.options.map(o => `☐ ${o}`).join("      "),
        { size: 18, color: "374151", indent: 280, spacingAfter: 40 }));
    } else {
      q.options.forEach((opt, oi) => {
        children.push(P(`☐  ${LETTERS[oi] ? `${LETTERS[oi]})` : "•"} ${opt}`,
          { size: 18, color: "374151", indent: 280, spacingAfter: 30 }));
      });
    }
    q.skips.forEach((s) => {
      children.push(P(`Se "${s.answer}": ${s.to}.`, { size: 15, italics: true, color: "8C94A0", indent: 560, spacingAfter: 30 }));
    });
  });

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 900, bottom: 900, left: 1000, right: 1000 } } },
      headers: { default: new Header({ children: [headerTable, new Paragraph({ spacing: { after: 120 }, children: [] })] }) },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            border: { top: { style: BorderStyle.SINGLE, size: 2, color: "E2E8F0" } },
            children: [
              new TextRun({ text: `${model.company.name || "Empresa responsável"}  ·  ${model.title}  ·  Página `, size: 14, color: "969EAA" }),
              new TextRun({ children: [PageNumber.CURRENT], size: 14, color: "969EAA" }),
              new TextRun({ text: " de ", size: 14, color: "969EAA" }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 14, color: "969EAA" }),
            ],
          })],
        }),
      },
      children,
    }],
  });

  return { doc, fileName: `${safeFileName(model.title)}.docx` };
}

export async function exportSurveyDOCX(survey, company) {
  const { doc, fileName } = await buildSurveyDOCX(survey, company);
  download(await Packer.toBlob(doc), fileName);
}
