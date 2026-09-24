// Armazenamento local do App de Campo (IndexedDB).
//
// Regras que este módulo garante — cada uma corresponde a uma forma real de
// perder entrevistas que já aconteceu ou pode acontecer em campo:
//
// 1. ERRO NÃO É "VAZIO". Uma leitura que falha lança exceção; nunca devolve
//    undefined como se não houvesse dados. Antes, uma falha transitória na
//    abertura (comum no iPhone: "Connection to Indexed Database server lost")
//    era lida como "sem rascunhos" e a lista vazia era gravada por cima das
//    entrevistas reais.
//
// 2. GRAVAÇÃO CONFIRMADA. As funções de escrita só resolvem quando a transação
//    termina (oncomplete) e lançam exceção se falhar. Quem chama sabe se salvou.
//
// 3. UM REGISTRO POR ENTREVISTA. Cada rascunho fica na própria chave
//    ("draft:<id>") e o áudio em outra ("audio:<id>"). Salvar uma entrevista
//    nunca reescreve as outras — então nenhum erro de leitura consegue apagar
//    o que não foi lido. E o áudio (vários MB) não é regravado a cada autosave.
//
// 4. CONEXÃO QUE CAIU É REABERTA. O iOS derruba a conexão do IndexedDB quando o
//    app fica em segundo plano. A conexão é descartada nesse caso e cada
//    operação tenta de novo uma vez com uma conexão nova.

const DB_NAME = "fieldsurvey";
const STORE = "kv";
const VERSION = 1;

export const DRAFT_PREFIX = "draft:";
export const AUDIO_PREFIX = "audio:";
export const SURVEY_PREFIX = "survey:";

const hasIDB = typeof indexedDB !== "undefined";

let dbPromise = null;

function resetConnection() {
  const p = dbPromise;
  dbPromise = null;
  if (p) p.then((db) => { try { db.close(); } catch { /* já fechada */ } }).catch(() => {});
}

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(DB_NAME, VERSION); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      const db = req.result;
      // Conexão perdida (iOS em segundo plano) ou outra aba atualizando o banco:
      // descarta para a próxima operação abrir uma conexão nova.
      db.onclose = () => { if (dbPromise) dbPromise = null; };
      db.onversionchange = () => { try { db.close(); } catch { /* ignore */ } dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error || new Error("Falha ao abrir o armazenamento do aparelho."));
    req.onblocked = () => reject(new Error("Armazenamento do aparelho bloqueado por outra aba do app."));
  });
  // Uma abertura que falhou não pode ficar em cache — senão todas as operações
  // seguintes falham até recarregar a página.
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

// Executa `work(store)` numa transação e só resolve quando ela é confirmada.
// `work` pode devolver uma IDBRequest (o resultado dela é devolvido) ou nada.
function runOnce(mode, work) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    let tx;
    try {
      // durability "strict": o navegador só confirma depois de gravar em disco.
      tx = mode === "readwrite"
        ? db.transaction(STORE, mode, { durability: "strict" })
        : db.transaction(STORE, mode);
    } catch (e) { reject(e); return; }
    let request;
    try { request = work(tx.objectStore(STORE)); } catch (e) {
      try { tx.abort(); } catch { /* ignore */ }
      reject(e);
      return;
    }
    tx.oncomplete = () => resolve(request && "result" in request ? request.result : undefined);
    tx.onerror = () => reject(tx.error || new Error("Falha na transação do armazenamento."));
    tx.onabort = () => reject(tx.error || new Error("Transação do armazenamento cancelada."));
  }));
}

async function run(mode, work) {
  try {
    return await runOnce(mode, work);
  } catch (first) {
    // Segunda tentativa com conexão nova (cobre a conexão derrubada pelo iOS).
    resetConnection();
    try {
      return await runOnce(mode, work);
    } catch (second) {
      throw second || first;
    }
  }
}

const prefixRange = (prefix) => IDBKeyRange.bound(prefix, `${prefix}￿`);

/* ───────────────────────────── API pública ───────────────────────────── */

/** Lê uma chave. Devolve undefined se não existir; LANÇA se a leitura falhar. */
export async function idbGet(key) {
  if (!hasIDB) {
    const v = localStorage.getItem(key);
    return v == null ? undefined : JSON.parse(v);
  }
  return run("readonly", (s) => s.get(key));
}

/** Grava uma chave. Só resolve depois de confirmada; LANÇA se falhar. */
export async function idbSet(key, value) {
  if (!hasIDB) { localStorage.setItem(key, JSON.stringify(value)); return; }
  await run("readwrite", (s) => s.put(value, key));
}

/** Remove uma chave. LANÇA se falhar. */
export async function idbDelete(key) {
  if (!hasIDB) { localStorage.removeItem(key); return; }
  await run("readwrite", (s) => s.delete(key));
}

/** Todos os valores cujas chaves começam com `prefix`. LANÇA se a leitura falhar. */
export async function idbGetAllByPrefix(prefix) {
  if (!hasIDB) {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) out.push(JSON.parse(localStorage.getItem(k)));
    }
    return out;
  }
  return (await run("readonly", (s) => s.getAll(prefixRange(prefix)))) || [];
}

/**
 * Várias escritas numa única transação: ou todas são gravadas, ou nenhuma.
 * `ops`: [{ put: key, value } | { del: key }]
 */
export async function idbBatch(ops) {
  if (!ops.length) return;
  if (!hasIDB) {
    for (const op of ops) {
      if ("put" in op) localStorage.setItem(op.put, JSON.stringify(op.value));
      else localStorage.removeItem(op.del);
    }
    return;
  }
  await run("readwrite", (s) => {
    for (const op of ops) {
      if ("put" in op) s.put(op.value, op.put);
      else s.delete(op.del);
    }
  });
}

/**
 * Converte o formato antigo (uma lista inteira numa chave só, no IndexedDB ou
 * no localStorage) para um registro por item. Atômico: os itens são gravados e a
 * chave antiga é apagada na MESMA transação — se algo falhar, nada muda e a
 * lista antiga continua intacta para a próxima tentativa.
 *
 * `split(item)` devolve as operações de gravação de um item.
 */
export async function idbMigrateLegacyList(legacyKey, split) {
  // localStorage (versões bem antigas do app)
  let fromLocal = null;
  try {
    const raw = localStorage.getItem(legacyKey);
    if (raw != null) fromLocal = JSON.parse(raw);
  } catch { /* JSON corrompido: ignora a cópia antiga */ }

  if (!hasIDB) {
    if (Array.isArray(fromLocal)) {
      for (const item of fromLocal) for (const op of split(item)) {
        if ("put" in op && localStorage.getItem(op.put) == null) {
          localStorage.setItem(op.put, JSON.stringify(op.value));
        }
      }
      localStorage.removeItem(legacyKey);
    }
    return;
  }

  await run("readwrite", (s) => {
    const req = s.get(legacyKey);
    req.onsuccess = () => {
      const list = [
        ...(Array.isArray(req.result) ? req.result : []),
        ...(Array.isArray(fromLocal) ? fromLocal : []),
      ];
      for (const item of list) {
        for (const op of split(item)) {
          if (!("put" in op)) continue;
          // add() em vez de put(): se o registro já existe no formato novo, ele é
          // mais recente que a cópia antiga e não pode ser sobrescrito. A falha
          // do add é esperada nesse caso e não deve abortar a transação.
          const addReq = s.add(op.value, op.put);
          addReq.onerror = (e) => { e.preventDefault(); e.stopPropagation(); };
        }
      }
      if (req.result !== undefined) s.delete(legacyKey);
    };
  });
  // Só depois de a transação confirmar a cópia é seguro limpar o localStorage.
  if (fromLocal != null) { try { localStorage.removeItem(legacyKey); } catch { /* ignore */ } }
}

/** Pede ao navegador que não apague os dados do app quando faltar espaço. */
export async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}
