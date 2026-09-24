// Compara duas versões do questionário para avisar o gestor, antes de salvar,
// o que a alteração faz com entrevistas já coletadas.
//
// As respostas ficam ligadas ao IDENTIFICADOR da pergunta e ao TEXTO da opção
// escolhida. Por isso:
//  - incluir pergunta ou opção é seguro;
//  - corrigir o texto do enunciado é seguro (o id continua o mesmo);
//  - remover pergunta, remover/renomear opção ou trocar o tipo quebra a
//    comparação com o que já foi respondido.

const CHOICE_TYPES = new Set(["unica_escolha", "multipla_escolha", "escala"]);

const optionsOf = (q) => (Array.isArray(q?.options) ? q.options.map((o) => String(o).trim()).filter(Boolean) : []);

export function diffQuestionnaire(before = [], after = []) {
  const oldById = new Map((before || []).map((q) => [q.id, q]));
  const newById = new Map((after || []).map((q) => [q.id, q]));
  const added = [];
  const removed = [];
  const textChanged = [];
  const typeChanged = [];
  const optionsRemoved = []; // { question, options: [...] }
  const optionsAdded = [];

  for (const q of after || []) {
    const old = oldById.get(q.id);
    if (!old) { added.push(q); continue; }
    if ((old.text || "").trim() !== (q.text || "").trim()) textChanged.push(q);
    if (old.type !== q.type) { typeChanged.push({ question: q, from: old.type, to: q.type }); continue; }
    if (CHOICE_TYPES.has(q.type)) {
      const now = new Set(optionsOf(q));
      const was = new Set(optionsOf(old));
      const gone = [...was].filter((o) => !now.has(o));
      const fresh = [...now].filter((o) => !was.has(o));
      if (gone.length) optionsRemoved.push({ question: q, options: gone });
      if (fresh.length) optionsAdded.push({ question: q, options: fresh });
    }
  }
  for (const q of before || []) if (!newById.has(q.id)) removed.push(q);

  const orderChanged = (before || []).map((q) => q.id).filter((id) => newById.has(id)).join()
    !== (after || []).map((q) => q.id).filter((id) => oldById.has(id)).join();

  const breaking = removed.length + typeChanged.length + optionsRemoved.length;
  const any = breaking + added.length + textChanged.length + optionsAdded.length + (orderChanged ? 1 : 0);
  return { added, removed, textChanged, typeChanged, optionsRemoved, optionsAdded, orderChanged, breaking, changed: any > 0 };
}

// Texto curto de uma pergunta para listas de aviso.
export const questionLabel = (q, max = 60) => {
  const t = (q?.text || "").trim() || "(sem enunciado)";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};
