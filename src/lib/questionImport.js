// Importação de questões a partir de texto colado, .xlsx ou .docx.
//
// Formato de texto (padrão): um bloco por questão, separado por linha em
// branco. A 1ª linha é o enunciado; as demais são as alternativas.
//
//   Qual seu grau de satisfação?
//   Ótimo
//   Bom
//   Ruim
//
// Marcadores OPCIONAIS no enunciado (todos dispensáveis):
//   [id]      etiqueta/identificador da questão   -> "P1. Qual...?" ou "[satisf] Qual...?"
//   *         questão obrigatória                 -> "Qual sua idade? *"
//   [multi]   múltipla escolha                    -> "[multi] Quais meios usa?"
//
// Nas alternativas, o valor pode vir junto usando o separador de valor
// (padrão "="):  "Ótimo = 5". A etiqueta do item usa o mesmo separador de
// campos quando o mapeamento estiver ativo.

import * as XLSX from "xlsx";

// Nativo do navegador (contexto seguro/HTTPS) — evita depender de CDN.
const uuidv4 = () => crypto.randomUUID();

export const DEFAULTS = {
  questionDelimiter: "blank",   // blank | --- | custom
  customQuestionDelimiter: "",
  optionDelimiter: "newline",   // newline | ; | | | , | custom
  customOptionDelimiter: "",
  valueSeparator: "=",          // separa rótulo do valor: "Ótimo = 5"
  parseValues: false,           // ler "valor" dos itens
  parseLabels: false,           // ler "etiqueta" (identificador) da questão
  randomizeOptions: false,      // sortear a ordem das alternativas na coleta
  allRequired: false,           // marcar todas como obrigatórias
  defaultType: "unica_escolha", // tipo quando houver alternativas
};

const SIM_NAO = ["sim", "não", "nao"];

function splitBy(text, mode, custom) {
  if (mode === "blank") return text.split(/\n\s*\n+/);
  if (mode === "---") return text.split(/^\s*-{3,}\s*$/m);
  if (mode === "newline") return text.split(/\r?\n/);
  const sep = custom || ";";
  return text.split(sep);
}

// Detecta o tipo pela cara das alternativas (boas práticas: Sim/Não e escalas
// viram tipos nativos, que já têm tratamento próprio em relatórios).
function detectType(options, forcedMulti, defaultType) {
  if (options.length === 0) return "aberta";
  if (forcedMulti) return "multipla_escolha";
  const lower = options.map(o => o.label.trim().toLowerCase());
  if (lower.length === 2 && lower.every(o => SIM_NAO.includes(o))) return "sim_nao";
  const nums = lower.map(o => Number(o)).filter(n => !Number.isNaN(n));
  if (nums.length === 5 && nums.join(",") === "1,2,3,4,5") return "escala";
  return defaultType;
}

// Extrai marcadores opcionais do enunciado.
function parseHeadline(raw, opts) {
  let text = raw.trim();
  let label = "";
  let required = false;
  let forcedMulti = false;

  const multi = text.match(/^\s*\[(multi|multipla|múltipla)\]\s*/i);
  if (multi) { forcedMulti = true; text = text.slice(multi[0].length); }

  const tag = text.match(/^\s*\[([^\]]+)\]\s*/);
  if (tag) { label = tag[1].trim(); text = text.slice(tag[0].length); }

  // "P1." / "1)" / "Q3 -" no início vira etiqueta quando o mapeamento está ativo
  if (!label && opts.parseLabels) {
    const num = text.match(/^\s*([A-Za-z]?\d+[A-Za-z]?)\s*[.)\-–]\s+/);
    if (num) { label = num[1]; text = text.slice(num[0].length); }
  }

  if (/\*\s*$/.test(text)) { required = true; text = text.replace(/\*\s*$/, "").trim(); }

  return { text: text.trim(), label, required, forcedMulti };
}

// Extrai rótulo/valor de uma alternativa.
function parseOption(raw, opts) {
  let label = String(raw).trim();
  let value = null;
  // remove marcadores de lista: "- ", "• ", "a) ", "1. "
  label = label.replace(/^\s*(?:[-•*]\s+|[a-zA-Z]\s*[.)]\s+|\d+\s*[.)]\s+)/, "").trim();
  if (opts.parseValues && opts.valueSeparator) {
    const idx = label.lastIndexOf(opts.valueSeparator);
    if (idx > 0) {
      const maybe = label.slice(idx + opts.valueSeparator.length).trim();
      if (maybe !== "") { value = maybe; label = label.slice(0, idx).trim(); }
    }
  }
  return { label, value };
}

// ---------------------------------------------------------------------------
// Texto -> questões
export function parseQuestionsFromText(text, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  if (!text || !text.trim()) return [];

  const blocks = splitBy(text, opts.questionDelimiter, opts.customQuestionDelimiter)
    .map(b => b.trim())
    .filter(Boolean);

  const questions = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    const head = parseHeadline(lines[0], opts);
    if (!head.text) continue;

    // Alternativas: linhas seguintes, ou split da 1ª linha quando o
    // delimitador de opções não é quebra de linha.
    let rawOptions = [];
    if (opts.optionDelimiter === "newline") {
      rawOptions = lines.slice(1);
    } else {
      rawOptions = lines.slice(1).flatMap(l => splitBy(l, opts.optionDelimiter, opts.customOptionDelimiter));
    }

    const parsed = rawOptions.map(o => parseOption(o, opts)).filter(o => o.label);
    const type = detectType(parsed, head.forcedMulti, opts.defaultType);
    const hasOptions = ["multipla_escolha", "unica_escolha"].includes(type);

    questions.push(buildQuestion({
      text: head.text,
      label: head.label,
      required: head.required || opts.allRequired,
      type,
      options: hasOptions ? parsed : [],
      randomize: opts.randomizeOptions && hasOptions,
      parseValues: opts.parseValues,
    }));
  }
  return questions;
}

function buildQuestion({ text, label, required, type, options, randomize, parseValues }) {
  const q = {
    id: uuidv4(),
    text,
    type,
    required: !!required,
    options: options.map(o => o.label),
  };
  if (label) q.label = label;
  if (randomize) q.randomize_options = true;
  if (parseValues && options.some(o => o.value !== null && o.value !== "")) {
    // array paralelo a `options` (mesma posição). Mantém compatibilidade:
    // as respostas continuam gravando o RÓTULO.
    q.option_values = options.map(o => (o.value ?? ""));
  }
  return q;
}

// ---------------------------------------------------------------------------
// XLSX -> questões
// Aceita duas disposições:
//  (a) LONGA: uma linha por alternativa, com colunas
//      Questão | Tipo | Etiqueta | Opção | Valor
//  (b) LARGA: uma linha por questão, alternativas em colunas seguintes
//      Questão | Opção1 | Opção2 | ...
const COL = {
  question: ["questão", "questao", "pergunta", "question", "enunciado"],
  type: ["tipo", "type"],
  label: ["etiqueta", "identificador", "id", "codigo", "código", "label"],
  option: ["opção", "opcao", "alternativa", "option", "resposta"],
  value: ["valor", "value", "peso", "score"],
  required: ["obrigatória", "obrigatoria", "required"],
};

const norm = (s) => String(s || "").trim().toLowerCase();
const findCol = (headers, names) => headers.findIndex(h => names.includes(norm(h)));

export async function parseQuestionsFromXlsx(file, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
  if (rows.length === 0) return [];

  const headers = (rows[0] || []).map(norm);
  const qi = findCol(headers, COL.question);
  const oi = findCol(headers, COL.option);

  // Sem cabeçalho reconhecível: trata como disposição LARGA sem cabeçalho.
  const hasHeader = qi >= 0;
  const body = hasHeader ? rows.slice(1) : rows;

  const map = new Map(); // texto da questão -> acumulador
  const push = (qText, meta, optLabel, optValue) => {
    const key = qText.trim();
    if (!key) return;
    if (!map.has(key)) map.set(key, { text: key, ...meta, options: [] });
    const acc = map.get(key);
    if (optLabel && String(optLabel).trim()) {
      acc.options.push({ label: String(optLabel).trim(), value: optValue == null ? null : String(optValue).trim() });
    }
  };

  if (hasHeader && oi >= 0) {
    // (a) disposição LONGA
    const ti = findCol(headers, COL.type);
    const li = findCol(headers, COL.label);
    const vi = findCol(headers, COL.value);
    const ri = findCol(headers, COL.required);
    for (const r of body) {
      const meta = {
        rawType: ti >= 0 ? norm(r[ti]) : "",
        label: li >= 0 ? String(r[li] || "").trim() : "",
        required: ri >= 0 ? /^(sim|s|true|1|x)$/i.test(String(r[ri] || "")) : false,
      };
      push(String(r[qi] || ""), meta, r[oi], vi >= 0 ? r[vi] : null);
    }
  } else {
    // (b) disposição LARGA
    const startCol = hasHeader ? qi : 0;
    for (const r of body) {
      const qText = String(r[startCol] || "");
      push(qText, { rawType: "", label: "", required: false }, null, null);
      const acc = map.get(qText.trim());
      if (!acc) continue;
      for (let c = startCol + 1; c < r.length; c++) {
        const cell = r[c];
        if (cell == null || String(cell).trim() === "") continue;
        const p = parseOption(cell, opts);
        acc.options.push({ label: p.label, value: p.value });
      }
    }
  }

  return [...map.values()].map(acc => {
    const type = normalizeType(acc.rawType) || detectType(acc.options, false, opts.defaultType);
    const hasOptions = ["multipla_escolha", "unica_escolha"].includes(type);
    return buildQuestion({
      text: acc.text,
      label: acc.label,
      required: acc.required || opts.allRequired,
      type,
      options: hasOptions ? acc.options : [],
      randomize: opts.randomizeOptions && hasOptions,
      parseValues: true,
    });
  });
}

function normalizeType(raw) {
  const t = norm(raw);
  if (!t) return null;
  if (/mult/.test(t)) return "multipla_escolha";
  if (/única|unica|single|radio/.test(t)) return "unica_escolha";
  if (/escala|scale|likert/.test(t)) return "escala";
  if (/sim|bool|dicot/.test(t)) return "sim_nao";
  if (/aberta|texto|open|livre/.test(t)) return "aberta";
  return null;
}

// ---------------------------------------------------------------------------
// DOCX -> questões (extrai o texto e reaproveita o parser de texto)
export async function parseQuestionsFromDocx(file, options = {}) {
  // Carregado sob demanda: só pesa no bundle de quem importa .docx.
  const mammoth = (await import("mammoth")).default;
  const buf = await file.arrayBuffer();
  const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
  return parseQuestionsFromText(value, options);
}
