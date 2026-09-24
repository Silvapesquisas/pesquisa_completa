// Fila offline do App de Campo: rascunhos, entrevistas concluídas aguardando
// envio, pesquisas baixadas e o histórico de sincronização.
//
// Princípios (ver idbStore.js):
//  - Cada entrevista é gravada no aparelho ANTES de qualquer tentativa de envio,
//    e só é removida depois que o servidor confirma o recebimento.
//  - Falha ao ler o armazenamento nunca é tratada como "não há nada": o app
//    avisa, tenta de novo e não grava nada por cima.
//  - Falha ao gravar é informada a quem chamou — a tela não diz "salvo" à toa.
//  - Toda chamada ao servidor tem tempo limite: uma requisição pendurada não
//    pode travar a fila de envio.
import { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import {
  idbGet, idbSet, idbBatch, idbGetAllByPrefix, idbMigrateLegacyList, requestPersistentStorage,
  DRAFT_PREFIX, AUDIO_PREFIX, SURVEY_PREFIX,
} from "@/components/fieldapp/idbStore";

// Chaves do formato antigo (uma lista inteira numa chave só), migradas na abertura.
const LEGACY_DRAFTS_KEY = "fieldsurvey_drafts";
const LEGACY_SURVEYS_KEY = "fieldsurvey_offline_surveys";
const SYNC_LOGS_KEY = "fieldsurvey_sync_logs";
const FIELD_USER_KEY = "fieldapp_user";

// Erros do servidor que não se resolvem tentando de novo sozinho (pesquisa de
// outra empresa, limite atingido, áudio grande...). Saem da fila automática, mas
// continuam no aparelho e podem ser reenviados pelo botão "Tentar de novo".
const PERMANENT_STATUSES = [400, 401, 403, 404, 409, 413, 422];

// Tempo limite do envio: 30 s + tempo para subir o áudio numa conexão móvel lenta
// (~25 kB/s), com teto de 15 min. O limite só libera a fila; o servidor ignora
// reenvios da mesma entrevista, então cancelar e tentar de novo é seguro.
export const sendTimeoutFor = (audioBytes = 0) =>
  Math.min(30_000 + Math.round((audioBytes / 25_000) * 1000), 15 * 60_000);

const newDraftId = () =>
  `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

// Separa uma entrevista do formato antigo em registro + áudio.
const splitLegacyDraft = (d) => {
  if (!d || !d._draftId) return [];
  const { _audioBase64, ...meta } = d;
  const hasAudio = typeof _audioBase64 === "string" && _audioBase64.length > 0;
  const ops = [{ put: DRAFT_PREFIX + d._draftId, value: { ...meta, _hasAudio: hasAudio, _audioBytes: hasAudio ? _audioBase64.length : 0 } }];
  if (hasAudio) ops.push({ put: AUDIO_PREFIX + d._draftId, value: _audioBase64 });
  return ops;
};
const splitLegacySurvey = (s) => (s && s.id ? [{ put: SURVEY_PREFIX + s.id, value: s }] : []);

// Junta a lista lida do disco com o que já está na memória (a memória é mais recente).
const mergeById = (fromDisk, inMemory, idOf) => {
  const map = new Map(fromDisk.map((x) => [idOf(x), x]));
  for (const x of inMemory) map.set(idOf(x), x);
  return [...map.values()];
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { return fallback; }
}

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [drafts, setDrafts] = useState([]);
  const [offlineSurveys, setOfflineSurveys] = useState([]);
  const [syncLogs, setSyncLogs] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  const [storageError, setStorageError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const syncRef = useRef(false);
  const draftsRef = useRef([]);
  // Último áudio gravado por rascunho: evita regravar vários MB a cada autosave.
  const writtenAudio = useRef(new Map());
  // Áudio de rascunhos que NÃO conseguiram ser gravados no aparelho: mantido em
  // memória para ainda poder ser enviado enquanto o app estiver aberto.
  const memoryAudio = useRef(new Map());

  // draftsRef é a fonte da verdade e é atualizado na hora: salvar e enviar em
  // seguida (fluxo "salva primeiro, depois envia") precisa enxergar o rascunho
  // recém-gravado antes de o React renderizar de novo.
  const commitDrafts = useCallback((updater) => {
    const next = typeof updater === "function" ? updater(draftsRef.current) : updater;
    draftsRef.current = next;
    setDrafts(next);
  }, []);

  // ── Online / offline ──
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // ── Histórico ──
  const logSeq = useRef(0);
  const addLog = useCallback((type, message, draftId = null) => {
    setSyncLogs((prev) => [...prev, {
      id: `${Date.now()}_${logSeq.current++}`,
      type, // "success" | "error" | "info"
      message,
      draftId,
      timestamp: new Date().toISOString(),
    }].slice(-50));
  }, []);

  // ── Leitura inicial ──
  // Até 3 tentativas. Se todas falharem, o app AVISA e não grava nada por cima:
  // as entrevistas continuam no aparelho e aparecem quando a leitura funcionar.
  const hydrate = useCallback(async () => {
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await idbMigrateLegacyList(LEGACY_DRAFTS_KEY, splitLegacyDraft);
        await idbMigrateLegacyList(LEGACY_SURVEYS_KEY, splitLegacySurvey);
        const [diskDrafts, diskSurveys] = await Promise.all([
          idbGetAllByPrefix(DRAFT_PREFIX),
          idbGetAllByPrefix(SURVEY_PREFIX),
        ]);
        commitDrafts((prev) => mergeById(diskDrafts, prev, (d) => d._draftId));
        setOfflineSurveys((prev) => mergeById(diskSurveys, prev, (s) => s.id));
        setStorageError(null);
        setHydrated(true);
        return true;
      } catch (e) {
        lastError = e;
        await sleep(400 * (attempt + 1));
      }
    }
    setStorageError(
      "Não foi possível ler as entrevistas guardadas neste celular. Elas NÃO foram apagadas. "
      + "Feche o app completamente e abra de novo antes de continuar."
      + (lastError?.message ? ` (${lastError.message})` : ""),
    );
    setHydrated(true);
    return false;
  }, [commitDrafts]);

  useEffect(() => {
    hydrate();
    // Histórico é descartável: uma falha aqui não afeta entrevistas.
    idbGet(SYNC_LOGS_KEY).then((l) => { if (Array.isArray(l)) setSyncLogs(l); }).catch(() => {});
    // Pede ao navegador para não apagar os dados do app quando faltar espaço.
    requestPersistentStorage();
  }, [hydrate]);

  useEffect(() => {
    if (!hydrated) return;
    idbSet(SYNC_LOGS_KEY, syncLogs.slice(-50)).catch(() => {});
  }, [syncLogs, hydrated]);

  // ── Gravação de rascunhos ──

  /**
   * Grava (ou atualiza) uma entrevista no aparelho e só resolve depois de
   * confirmada. LANÇA se não conseguir gravar — quem chama deve avisar o
   * entrevistador. Devolve o id do rascunho.
   *
   * `_audioBase64`: string = áudio atual; null = sem áudio; undefined = mantém.
   */
  const saveDraft = useCallback(async (interviewData) => {
    const { _audioBase64, ...rest } = interviewData;
    const draftId = rest._draftId || newDraftId();
    const prev = draftsRef.current.find((d) => d._draftId === draftId);

    const ops = [];
    let hasAudio = prev?._hasAudio || false;
    let audioBytes = prev?._audioBytes || 0;
    let wroteAudio = false;
    if (typeof _audioBase64 === "string" && _audioBase64.length > 0) {
      hasAudio = true;
      audioBytes = _audioBase64.length;
      if (writtenAudio.current.get(draftId) !== _audioBase64) {
        ops.push({ put: AUDIO_PREFIX + draftId, value: _audioBase64 });
        wroteAudio = true;
      }
    } else if (_audioBase64 === null && prev?._hasAudio) {
      hasAudio = false;
      audioBytes = 0;
      ops.push({ del: AUDIO_PREFIX + draftId });
    }

    const draft = {
      ...rest,
      _draftId: draftId,
      _savedAt: new Date().toISOString(),
      _syncStatus: "pending",
      _lastError: null,
      _hasAudio: hasAudio,
      _audioBytes: audioBytes,
    };
    ops.unshift({ put: DRAFT_PREFIX + draftId, value: draft });

    try {
      await idbBatch(ops);
      if (wroteAudio) writtenAudio.current.set(draftId, _audioBase64);
      if (hasAudio) memoryAudio.current.delete(draftId);
      if (!hasAudio) writtenAudio.current.delete(draftId);
      commitDrafts((list) => {
        const i = list.findIndex((d) => d._draftId === draftId);
        const clean = { ...draft, _unsaved: false };
        if (i >= 0) { const u = [...list]; u[i] = clean; return u; }
        return [...list, clean];
      });
      setSaveError(null);
      return draftId;
    } catch (e) {
      // Não conseguiu gravar no aparelho: mantém em memória (ainda pode ser
      // enviada com o app aberto) e informa quem chamou.
      if (typeof _audioBase64 === "string") memoryAudio.current.set(draftId, _audioBase64);
      commitDrafts((list) => {
        const i = list.findIndex((d) => d._draftId === draftId);
        const kept = { ...draft, _unsaved: true };
        if (i >= 0) { const u = [...list]; u[i] = kept; return u; }
        return [...list, kept];
      });
      const msg = "Não foi possível salvar no celular. NÃO feche o app: envie com internet assim que possível.";
      setSaveError(msg);
      addLog("error", `${msg} (${e?.message || "erro de armazenamento"})`, draftId);
      const err = new Error(msg);
      err.draftId = draftId;
      err.cause = e;
      throw err;
    }
  }, [addLog, commitDrafts]);

  /** Lê o áudio de um rascunho (null se não houver). LANÇA se a leitura falhar. */
  const loadDraftAudio = useCallback(async (draftId) => {
    if (memoryAudio.current.has(draftId)) return memoryAudio.current.get(draftId);
    const a = await idbGet(AUDIO_PREFIX + draftId);
    if (typeof a === "string") writtenAudio.current.set(draftId, a);
    return typeof a === "string" ? a : null;
  }, []);

  const removeDraft = useCallback(async (draftId) => {
    commitDrafts((list) => list.filter((d) => d._draftId !== draftId));
    writtenAudio.current.delete(draftId);
    memoryAudio.current.delete(draftId);
    try {
      await idbBatch([{ del: DRAFT_PREFIX + draftId }, { del: AUDIO_PREFIX + draftId }]);
    } catch {
      // Se sobrar no aparelho, volta a aparecer e é reenviada; o servidor
      // reconhece a duplicata pelo client_uuid e não grava duas vezes.
    }
  }, [commitDrafts]);

  // Atualiza só o estado de envio de um rascunho (sem mexer no áudio).
  const setDraftStatus = useCallback(async (draftId, patch) => {
    const cur = draftsRef.current.find((d) => d._draftId === draftId);
    if (!cur) return;
    const next = { ...cur, ...patch };
    commitDrafts((list) => list.map((d) => (d._draftId === draftId ? next : d)));
    if (!cur._unsaved) {
      const { _unsaved, ...toDisk } = next;
      try { await idbSet(DRAFT_PREFIX + draftId, toDisk); } catch { /* estado de envio: não crítico */ }
    }
  }, [commitDrafts]);

  // ── Envio ──

  /**
   * Envia UMA entrevista já gravada no aparelho. Remove-a só depois de o
   * servidor confirmar. LANÇA em caso de falha (quem chama decide o estado).
   */
  const sendDraft = useCallback(async (draftId, { timeoutMs } = {}) => {
    const draft = draftsRef.current.find((d) => d._draftId === draftId);
    if (!draft) throw new Error("Entrevista não encontrada no aparelho.");
    const accessCode = loadLocal(FIELD_USER_KEY, null)?.access_code;
    if (!accessCode) {
      const e = new Error("Sessão do entrevistador não encontrada. Entre novamente com o seu código.");
      e.retryable = true;
      throw e;
    }
    const audio = draft._hasAudio ? await loadDraftAudio(draftId) : null;
    const {
      _draftId, _savedAt, _syncStatus, _lastError, _hasAudio, _audioBytes, _unsaved, _audioBase64,
      ...interviewData
    } = draft;
    const res = await base44.functions.invoke(
      "fieldSubmitInterview",
      { code: accessCode, interview: interviewData, audio_base64: audio || undefined },
      { timeoutMs: timeoutMs ?? sendTimeoutFor(audio?.length || 0) },
    );
    await removeDraft(draftId);
    setLastSynced(new Date());
    return res || {};
  }, [loadDraftAudio, removeDraft]);

  // Classifica uma falha de envio: permanente (sai da fila automática) ou não.
  const classifyFailure = (e) => {
    if (e?.timeout || e?.retryable) return "error";
    // Aparelho bloqueado se resolve quando o gestor libera: não é permanente.
    if (e?.code === "device_blocked") return "error";
    return PERMANENT_STATUSES.includes(e?.status) ? "failed_permanent" : "error";
  };

  const syncDrafts = useCallback(async () => {
    if (syncRef.current) return 0;
    const pending = draftsRef.current.filter(
      (d) => d.status === "concluida" && d._syncStatus !== "failed_permanent",
    );
    if (pending.length === 0) return 0;

    syncRef.current = true;
    setSyncing(true);
    let ok = 0;
    try {
      addLog("info", `Enviando ${pending.length} entrevista(s)...`);
      for (const d of pending) {
        const title = d.survey_title || "Entrevista";
        try {
          const res = await sendDraft(d._draftId);
          ok++;
          addLog(res.audio_failed ? "error" : "success",
            res.audio_failed ? `"${title}" enviada, mas o áudio não pôde ser salvo.` : `"${title}" enviada.`,
            d._draftId);
        } catch (e) {
          const status = classifyFailure(e);
          addLog("error",
            `${status === "failed_permanent" ? "Não enviada (precisa de ação)" : "Falha ao enviar, nova tentativa em breve"} "${title}": ${e?.message || "erro desconhecido"}`,
            d._draftId);
          await setDraftStatus(d._draftId, { _syncStatus: status, _lastError: e?.message || "erro" });
          // Sem conexão: não adianta tentar os próximos agora.
          if (e?.timeout || !navigator.onLine) break;
        }
      }
      if (ok === pending.length) addLog("success", `Sincronização concluída: ${ok} enviada(s).`);
      else if (ok > 0) addLog("info", `Sincronização parcial: ${ok}/${pending.length} enviadas.`);
    } finally {
      syncRef.current = false;
      setSyncing(false);
    }
    return ok;
  }, [addLog, sendDraft, setDraftStatus]);

  /** Recoloca uma entrevista recusada na fila e tenta enviar. */
  const retryDraft = useCallback(async (draftId) => {
    await setDraftStatus(draftId, { _syncStatus: "pending", _lastError: null });
    return syncDrafts();
  }, [setDraftStatus, syncDrafts]);

  const hasSyncable = () =>
    draftsRef.current.some((d) => d.status === "concluida" && d._syncStatus !== "failed_permanent");

  // Envia ao reconectar, ao terminar a leitura inicial e ao voltar para o app
  // (no iPhone o evento "online" nem sempre dispara).
  useEffect(() => {
    if (hydrated && isOnline && hasSyncable()) syncDrafts();
  }, [isOnline, hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && navigator.onLine && hasSyncable()) syncDrafts();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [syncDrafts]);

  // A cada 2 minutos, enquanto houver entrevistas concluídas pendentes.
  useEffect(() => {
    if (!isOnline) return;
    const interval = setInterval(() => { if (hasSyncable()) syncDrafts(); }, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isOnline, syncDrafts]);

  // ── Pesquisas baixadas ──
  const downloadSurvey = useCallback(async (survey) => {
    const item = { ...survey, _downloadedAt: new Date().toISOString(), _size: JSON.stringify(survey).length };
    setOfflineSurveys((prev) => mergeById(prev, [item], (s) => s.id));
    try {
      await idbSet(SURVEY_PREFIX + survey.id, item);
      addLog("success", `Pesquisa "${survey.title}" baixada para uso offline.`);
    } catch (e) {
      addLog("error", `Não foi possível guardar "${survey.title}" no celular: ${e?.message || "erro de armazenamento"}`);
    }
  }, [addLog]);

  const removeSurveyOffline = useCallback(async (surveyId) => {
    setOfflineSurveys((prev) => prev.filter((s) => s.id !== surveyId));
    try { await idbBatch([{ del: SURVEY_PREFIX + surveyId }]); } catch { /* reaparece na próxima abertura */ }
  }, []);

  const clearLogs = useCallback(() => setSyncLogs([]), []);

  const totalStorageBytes = drafts.reduce((acc, d) => acc + JSON.stringify(d).length + (d._audioBytes || 0), 0)
    + offlineSurveys.reduce((acc, s) => acc + JSON.stringify(s).length, 0);

  return {
    isOnline, drafts, syncing, lastSynced, syncLogs,
    saveDraft, removeDraft, syncDrafts, sendDraft, retryDraft, loadDraftAudio,
    offlineSurveys, downloadSurvey, removeSurveyOffline,
    totalStorageBytes, clearLogs, addLog,
    hydrated, storageError, saveError, retryHydrate: hydrate,
  };
}
