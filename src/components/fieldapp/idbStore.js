// Armazenamento local resiliente para o app de campo.
//
// Por que IndexedDB: rascunhos de entrevistas guardam o áudio em base64, que
// pode ter vários MB. O localStorage tem cota baixa (~5 MB por origem) e estoura
// (QuotaExceededError) com poucas entrevistas offline, podendo perder dados. O
// IndexedDB oferece cota muito maior. Caímos para localStorage só se o IndexedDB
// não existir (navegadores muito antigos / modo restrito).

const DB_NAME = "fieldsurvey";
const STORE = "kv";
const VERSION = 1;

const hasIDB = typeof indexedDB !== "undefined";

let dbPromise = null;
function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function idbGet(key) {
  if (!hasIDB) {
    try { const v = localStorage.getItem(key); return v == null ? undefined : JSON.parse(v); }
    catch { return undefined; }
  }
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const rq = tx.objectStore(STORE).get(key);
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
    });
  } catch {
    return undefined;
  }
}

export async function idbSet(key, value) {
  if (!hasIDB) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.error(`Falha ao salvar ${key}:`, e); }
    return;
  }
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error(`Falha ao salvar ${key} no IndexedDB:`, e);
  }
}

// Migra uma chave do localStorage antigo para o IndexedDB (uma única vez).
// Retorna o valor (do IndexedDB, ou migrado do localStorage), ou undefined.
export async function idbMigrateFromLocalStorage(key) {
  const fromIdb = await idbGet(key);
  if (fromIdb !== undefined) return fromIdb;
  try {
    const ls = localStorage.getItem(key);
    if (ls != null) {
      const v = JSON.parse(ls);
      await idbSet(key, v);
      localStorage.removeItem(key);
      return v;
    }
  } catch { /* ignore */ }
  return undefined;
}
