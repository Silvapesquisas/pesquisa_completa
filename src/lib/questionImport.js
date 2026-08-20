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
  format: "auto",               // auto | marcadores | linhas
  questionDelimiter: "blank",   // blank | --- | custom
  customQuestionDelimiter: "",
  optionDelimiter: "newline",   // newline | ; | | | , | custom
  customOptionDelimiter: "",
  valueSeparator: "=",          // separa rótulo do valor: "Ótimo = 5"
  parseValues: false,           // ler "valor" dos itens (formato por linhas)
  parseLabels: true,            // ler "etiqueta" (identificador) da questão
  randomizeOptions: false,      // sortear a ordem das alternativas na coleta
  allRequired: false,           // marcar todas como obrigatórias
  defaultType: "unica_escolha", // tipo quando houver alternativas
  markerValues: true,           // usar o nº do marcador "1( )" como valor do item
  spontaneousOther: true,       // questão só com NS/NR vira espontânea (permite "Outra")
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
// FORMATO "QUESTIONÁRIO" — o usado em questionários impressos/Word reais:
// as alternativas vêm na MESMA linha do enunciado, marcadas por "1( )", "( )",
// "2 ( )" ou "[ ]", podendo continuar nas linhas seguintes.
//
//   1) O/a Sr/a. Vota em Aquidabã? 1( ) Sim ( ) Não
//   Sexo:   1( ) Masculino   2( ) Feminino
//   Escolaridade: 1( ) ANALFABETO(A) 2( ) FUNDAMENTAL INCOMPLETO
//   4( ) MÉDIO INCOMPLETO   5( ) MÉDIO COMPLETO
//
// Cuidado: "(a)", "(1º Cenário)" e "(PL)" NÃO são marcadores — só contam
// parênteses/colchetes vazios.
const MARKER = /(\d{1,3})?\s*[([]\s*[)\]]/g;
const STARTS_WITH_MARKER = /^\s*(?:\d{1,3})?\s*[([]\s*[)\]]/;
// Numeração do enunciado: "1)", "01)", "1.2)", "1 -", "Q3."
const QUESTION_NUMBER = /^\s*([A-Za-z]?\d{1,3}(?:\.\d{1,2})?)\s*[).\-–]\s*/;
// Alternativas de fuga (não são resposta de conteúdo)
const ESCAPE_OPTION = /^(ns\/nr|ns|nr|n[ãa]o sei|n[ãa]o respondeu|n[ãa]o soube|branco ou nulo|branco|nulo|nenhum[ao]?|prefiro n[ãa]o responder)$/i;

const cleanText = (s) => String(s || "")
  .replace(/[_\t]+/g, " ")          // linhas para preencher e tabulações
  .replace(/\s{2,}/g, " ")
  .trim()
  .replace(/[\s:.\-–]+$/, "")       // pontuação solta no fim
  .trim();

// Separa "enunciado + alternativas" de uma linha usando os marcadores.
function splitLineByMarkers(line) {
  MARKER.lastIndex = 0;
  const hits = [];
  let m;
  while ((m = MARKER.exec(line)) !== null) {
    hits.push({ start: m.index, end: m.index + m[0].length, num: m[1] || null });
  }
  if (hits.length === 0) return { head: line, options: [] };

  const head = line.slice(0, hits[0].start);
  const options = hits.map((h, i) => ({
    label: line.slice(h.end, i + 1 < hits.length ? hits[i + 1].start : line.length),
    num: h.num,
  }));
  return { head, options };
}

function parseQuestionnaireText(text, opts) {
  const lines = String(text).split(/\r?\n/);
  const out = [];
  let cur = null;

  const flush = () => {
    if (!cur) return;
    const label = cur.label;
    let head = cur.textParts.join(" ");

    // "Idade 11( ) 16 A 24 ANOS": o marcador engole o dígito final do
    // enunciado. Se o nº do 1º marcador começa com o dígito que sobrou no
    // texto e é mais longo, o excedente pertence ao texto — devolve-o.
    const trailing = head.match(/(\d{1,2})\s*$/);
    const first = cur.options[0];
    if (trailing && first?.num && first.num.startsWith(trailing[1]) && first.num.length > trailing[1].length) {
      head = head.slice(0, trailing.index);
      first.num = first.num.slice(trailing[1].length);
    }

    const qText = cleanText(head);
    if (qText) {
      const opts_ = cur.options
        .map(o => ({ label: cleanText(o.label), value: o.num }))
        .filter(o => o.label);

      // "Idade 11( )": o marcador absorveu o dígito final do enunciado e virou
      // "11". Se do 2º item em diante a numeração é 2,3,…,N, o 1º só pode ser 1.
      if (opts_.length >= 3 && opts_[0].value !== "1") {
        const sequential = opts_.slice(1).every((o, i) => o.value === String(i + 2));
        if (sequential) opts_[0].value = "1";
      }

      out.push({ text: qText, label, options: opts_ });
    }
    cur = null;
  };

  const startQuestion = (line) => {
    flush();
    let rest = line;
    let label = "";
    const num = rest.match(QUESTION_NUMBER);
    if (num) { label = num[1]; rest = rest.slice(num[0].length); }
    const { head, options } = splitLineByMarkers(rest);
    cur = { label, textParts: [head], options: [...options] };
  };

  for (const raw of lines) {
    const line = raw.replace(/ /g, " ");
    if (!line.trim()) continue;

    // 1) linha que começa com marcador -> alternativas da questão atual
    if (STARTS_WITH_MARKER.test(line)) {
      if (!cur) continue;                       // marcador solto sem questão
      cur.options.push(...splitLineByMarkers(line).options);
      continue;
    }
    // 2) linha numerada -> nova questão
    if (QUESTION_NUMBER.test(line)) { startQuestion(line); continue; }
    // 3) linha com marcador no meio (ex.: "Sexo: 1( ) ...") -> nova questão
    if (MARKER.test(line)) { MARKER.lastIndex = 0; startQuestion(line); continue; }
    MARKER.lastIndex = 0;
    // 4) continuação do enunciado quebrado em várias linhas
    if (cur && cur.options.length === 0 && !/[?:.]\s*$/.test(cur.textParts.join(" ").trim())) {
      cur.textParts.push(line);
      continue;
    }
    // 5) linha "solta" que parece enunciado (termina com ? ou :)
    if (/[?:]\s*$/.test(line.trim())) { startQuestion(line); continue; }
    // 6) resto (cabeçalho, "Entrevistador", rodapé) é ignorado
  }
  flush();

  return out.map(q => {
    const isEscape = (o) => ESCAPE_OPTION.test(o.label.trim());
    // Espontânea: só tem alternativas de fuga (NS/NR, Branco ou Nulo) — o
    // entrevistador precisa poder registrar a resposta livre.
    const onlyEscapes = q.options.length > 0 && q.options.every(isEscape);
    const type = detectType(q.options, false, opts.defaultType);
    const hasOptions = ["multipla_escolha", "unica_escolha"].includes(type);

    const built = buildQuestion({
      text: q.text,
      label: opts.parseLabels ? q.label : "",
      required: opts.allRequired,
      type,
      options: hasOptions ? q.options.map(o => ({
        label: o.label,
        value: opts.markerValues ? o.value : null,
      })) : [],
      randomize: opts.randomizeOptions && hasOptions && !onlyEscapes,
      parseValues: opts.markerValues,
    });
    if (onlyEscapes && opts.spontaneousOther && hasOptions) built.allow_other = true;
    return built;
  });
}

// ---------------------------------------------------------------------------
// Texto -> questões
export function parseQuestionsFromText(text, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  if (!text || !text.trim()) return [];

  // Detecção de formato: se há marcadores "( )" pelo texto, é questionário.
  MARKER.lastIndex = 0;
  const looksLikeQuestionnaire = (String(text).match(/[([]\s*[)\]]/g) || []).length >= 2;
  const useMarkers = opts.format === "marcadores"
    || (opts.format === "auto" && looksLikeQuestionnaire);
  if (useMarkers) return parseQuestionnaireText(text, opts);

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
