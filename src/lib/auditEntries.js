// Leitura do histórico de edições das entrevistas (interviews.edit_history)
// para o Painel de Auditoria.
//
// Formatos gravados:
//  - Edição manual (InterviewEdit):
//      "Pergunta A": "antes" → "depois" | "Pergunta B": "(vazio)" → "novo"
//  - Padronização (standardize_answers):
//      Padronização de resposta: "Alex piatan", "Alex da piatam" → "Alex da Piatã"
//  - Formato antigo: Campo: De 'X' para 'Y'; Campo2: De ...

export const AUDIT_TYPES = {
  edicao: "Edição manual",
  padronizacao: "Padronização de respostas",
};

const STANDARDIZE_RE = /^Padroniza[çc][ãa]o de resposta:\s*(.*)\s*→\s*"(.*)"\s*$/s;

export function entryType(entry) {
  return STANDARDIZE_RE.test(entry?.changes_summary || "") ? "padronizacao" : "edicao";
}

const unquote = (s) => String(s ?? "").trim().replace(/^["'](.*)["']$/s, "$1").trim();
const emptyToDash = (s) => (s === "(vazio)" ? "" : s);

/**
 * Alterações de um registro do histórico: [{ field, from, to }].
 * from/to = null quando o texto não segue nenhum formato conhecido.
 */
export function parseChanges(summary) {
  const text = String(summary || "").trim();
  if (!text || /^Edição sem alterações/i.test(text)) return [];

  const std = STANDARDIZE_RE.exec(text);
  if (std) {
    return [{ field: "Padronização", from: std[1].trim(), to: std[2] }];
  }

  if (text.includes("→")) {
    return text.split(/\s\|\s/).map((part) => {
      // O rótulo vem entre aspas ("Pergunta…") ou como Q1, Q2...; a pergunta
      // pode ter ":" no meio, por isso ele é casado inteiro.
      const m = /^(".*?"|Q\d+):\s*(".*")\s*→\s*(".*")\s*$/s.exec(part.trim());
      if (m) return { field: unquote(m[1]), from: emptyToDash(unquote(m[2])), to: emptyToDash(unquote(m[3])) };
      return part.trim() ? { field: part.trim(), from: null, to: null } : null;
    }).filter(Boolean);
  }

  return text.split(/;\s*/).map((e) => {
    const m = e.match(/^(.+?):\s*De ['"]?(.*?)['"]?\s*para\s*['"]?(.*?)['"]?$/i);
    if (m) return { field: m[1].trim(), from: m[2].trim(), to: m[3].trim() };
    return e.trim() ? { field: e.trim(), from: null, to: null } : null;
  }).filter(Boolean);
}
