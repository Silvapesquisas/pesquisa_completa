// Ordem de exibição das alternativas na coleta.
//
// Quando a questão tem `randomize_options`, a ordem é sorteada para reduzir o
// viés de ordem (primacy/recency) — prática padrão em questionários. O sorteio
// é DETERMINÍSTICO a partir de uma semente (id da entrevista + id da questão):
// assim a ordem não muda a cada toque na tela nem ao retomar um rascunho, mas
// varia de entrevistado para entrevistado.

// Itens que devem permanecer ancorados no fim, mesmo com randomização.
const ANCHORED = /^(n[ãa]o sei|n[ãa]o respondeu|nenhuma|nenhum|prefiro n[ãa]o responder|outr[oa]s?|ns\/nr|n\/a)\b/i;

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// PRNG determinístico (mulberry32).
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Devolve as opções na ordem de exibição. Sem randomização, mantém a original.
export function displayOptions(options, { randomize, seed } = {}) {
  const list = options || [];
  if (!randomize || list.length < 2) return list;

  const anchored = list.filter(o => ANCHORED.test(String(o).trim()));
  const shufflable = list.filter(o => !ANCHORED.test(String(o).trim()));

  const rand = rng(hashString(String(seed || "")));
  const a = [...shufflable];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return [...a, ...anchored];
}
