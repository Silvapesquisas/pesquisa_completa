// Agrupa respostas escritas de formas diferentes que querem dizer a mesma coisa:
//   "Alex da Piatã", "alex piatan", "Alex da piatam ", "Ales da piatam"
//   "Não tem", "Nao tem.", "N tem", "Naontem"
//   "Angelo Almeida", "Ângelo Almeida", "Angelo A"
//
// São só SUGESTÕES: o gestor confere cada grupo, desmarca o que não for igual e
// escolhe a grafia padrão antes de qualquer alteração.
import { normalizeText } from "@/lib/surveyAnswers";

// Palavras que não mudam o sentido de um nome ("Alex DA Piatã" = "Alex Piatã").
const STOPWORDS = new Set(["da", "de", "do", "das", "dos", "d", "e"]);

// Aproxima grafias de mesmo som: "piatã/piatam/piatan" -> "piata" (o "ã"
// escrito como "am"/"an" no fim da palavra),
// "Luccas" -> "lucas", "Yuri" -> "iuri", "Phelipe" -> "felipe".
function foldToken(t) {
  let s = t
    .replace(/ph/g, "f")
    .replace(/y/g, "i")
    .replace(/(.)\1+/g, "$1");
  if (s.length > 3) s = s.replace(/a[mn]$/, "a");
  return s;
}

/** Chave de comparação de uma resposta. */
export function answerKey(raw) {
  const base = normalizeText(raw).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  return base.split(" ").filter((t) => t && !STOPWORDS.has(t)).map(foldToken).join(" ");
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

const similarity = (a, b) => 1 - levenshtein(a, b) / Math.max(a.length, b.length, 1);

/**
 * Duas chaves são "a mesma resposta"?
 *  1. Quase iguais letra a letra (erro de digitação, palavras coladas):
 *     "alex napiata" ~ "alex piata", "naontem" ~ "nao tem".
 *  2. Abreviação palavra a palavra, com ao menos uma palavra inteira igual:
 *     "n tem" ~ "nao tem", "alex p" ~ "alex piata", "angelo a" ~ "angelo almeida".
 */
export function sameAnswer(ka, kb) {
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  const ta = ka.split(" "), tb = kb.split(" ");
  // Uma resposta que só tem palavras A MAIS no fim não é "a mesma": "Angelo"
  // pode ser "Angelo Almeida" ou "Ângelo Coronel". Essas o gestor junta à mão.
  const [shortT, longT] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const onlyExtraWords = shortT.length < longT.length && shortT.every((x, i) => x === longT[i]);

  const ca = ka.replace(/ /g, ""), cb = kb.replace(/ /g, "");
  const shortest = Math.min(ca.length, cb.length);
  // Uma palavra só (nome curto) exige mais semelhança: "Angela" ≠ "Angelo".
  const minSim = ta.length === 1 && tb.length === 1 ? 0.85 : 0.8;
  // Abreviações ("Angelo A", "N tem") ficam para a regra palavra a palavra:
  // coladas, "angeloa" pareceria "angela".
  const hasInitial = [...ta, ...tb].some((t) => t.length === 1);
  if (!onlyExtraWords && !hasInitial && shortest >= 5 && similarity(ca, cb) >= minSim) return true;
  if (shortest >= 4 && ca === cb) return true;

  if (ta.length === tb.length && ta.length >= 2) {
    let fullEqual = 0;
    const ok = ta.every((x, i) => {
      const y = tb[i];
      if (x === y) { if (x.length >= 3) fullEqual++; return true; }
      if (x.length >= 3 && y.length >= 3 && similarity(x, y) >= 0.75) { fullEqual++; return true; }
      return y.startsWith(x) || x.startsWith(y); // abreviação: "n" de "nao", "a" de "almeida"
    });
    if (ok && fullEqual >= 1) return true;
  }
  return false;
}

/**
 * Agrupa as respostas.
 * @param values [{ label, count }] — textos exatamente como gravados
 * @returns grupos com 2+ grafias: [{ id, variants: [{label,count}], total, suggested }]
 *          do grupo com mais entrevistas para o com menos
 */
export function clusterAnswers(values) {
  const items = values
    .filter((v) => String(v.label ?? "").trim())
    .map((v) => ({ ...v, key: answerKey(v.label) }))
    .filter((v) => v.key);

  // União de conjuntos: cada par "igual" junta os dois grupos.
  const parent = items.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (sameAnswer(items[i].key, items[j].key)) union(i, j);
    }
  }

  const groups = new Map();
  items.forEach((it, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push({ label: it.label, count: it.count });
  });

  return [...groups.values()]
    .filter((vs) => vs.length > 1)
    .map((vs, k) => {
      vs.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"));
      return { id: `g${k}`, variants: vs, total: vs.reduce((s, v) => s + v.count, 0), suggested: suggestStandard(vs) };
    })
    .sort((a, b) => b.total - a.total);
}

/**
 * Grafia padrão sugerida: entre as MAIS COMPLETAS do grupo (menos abreviadas),
 * a forma mais usada — somando as que só diferem por acento, maiúscula ou
 * espaço — escrita da maneira mais correta (com acento e iniciais maiúsculas).
 * "Nao tem"×35 + "Não tem"×13 -> "Não tem".
 */
export function suggestStandard(variants) {
  const clean = (s) => String(s).replace(/\s+/g, " ").trim().replace(/[.,;]+$/, "");
  const wordCount = (s) => answerKey(s).split(" ").filter((t) => t.length >= 2).length;
  const maxWords = Math.max(...variants.map((v) => wordCount(v.label)));
  const pool = variants.filter((v) => wordCount(v.label) === maxWords);

  const forms = new Map(); // forma sem acento/maiúscula -> { total, writings: Map(texto -> n) }
  for (const v of pool) {
    const text = clean(v.label);
    const k = normalizeText(text);
    const f = forms.get(k) || { total: 0, writings: new Map() };
    f.total += v.count;
    f.writings.set(text, (f.writings.get(text) || 0) + v.count);
    forms.set(k, f);
  }
  const best = [...forms.values()].sort((a, b) => b.total - a.total)[0];
  if (!best) return clean(variants[0].label);

  // A grafia "mais correta" só ganha se for usada de verdade (2+ vezes e 15%+
  // do total): um "Lúciano" digitado uma vez não vira o padrão.
  const accents = (s) => (s.match(/[À-ÿ]/g) || []).length;
  const capitals = (s) => s.split(" ").filter((w) => /^[A-ZÀ-Ý]/.test(w)).length;
  const credible = (n) => n >= 2 && n >= best.total * 0.15;
  const [text] = [...best.writings.entries()].sort((a, b) =>
    (credible(b[1]) - credible(a[1])) || accents(b[0]) - accents(a[0]) || capitals(b[0]) - capitals(a[0]) || b[1] - a[1])[0];
  return text;
}
