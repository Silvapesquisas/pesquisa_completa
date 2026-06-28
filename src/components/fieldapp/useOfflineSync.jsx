import { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { idbGet, idbSet, idbMigrateFromLocalStorage } from "@/components/fieldapp/idbStore";

const DRAFTS_KEY = "fieldsurvey_drafts";
const OFFLINE_SURVEYS_KEY = "fieldsurvey_offline_surveys";
const SYNC_LOGS_KEY = "fieldsurvey_sync_logs";
const FIELD_USER_KEY = "fieldapp_user";

// FIELD_USER_KEY continua no localStorage (dado pequeno, lido no boot/login).
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
  const syncRef = useRef(false);
  const draftsRef = useRef([]); // espelho sempre atual (evita closure obsoleta na sincronização)

  // Online/offline detection
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // Carrega do IndexedDB no início (migrando do localStorage antigo, se houver).
  // Áudios em base64 podem ter MBs; o IndexedDB evita o estouro de cota do
  // localStorage que poderia perder entrevistas offline.
  useEffect(() => {
    (async () => {
      const d = (await idbMigrateFromLocalStorage(DRAFTS_KEY)) || [];
      const os = (await idbMigrateFromLocalStorage(OFFLINE_SURVEYS_KEY)) || [];
      const sl = (await idbMigrateFromLocalStorage(SYNC_LOGS_KEY)) || [];
      draftsRef.current = d;
      setDrafts(d); setOfflineSurveys(os); setSyncLogs(sl);
      setHydrated(true);
    })();
  }, []);

  // Persiste no IndexedDB (só após hidratar, para não sobrescrever com o [] inicial)
  useEffect(() => { if (!hydrated) return; draftsRef.current = drafts; idbSet(DRAFTS_KEY, drafts); }, [drafts, hydrated]);
  useEffect(() => { if (!hydrated) return; idbSet(OFFLINE_SURVEYS_KEY, offlineSurveys); }, [offlineSurveys, hydrated]);
  useEffect(() => { if (!hydrated) return; idbSet(SYNC_LOGS_KEY, syncLogs.slice(-50)); }, [syncLogs, hydrated]);

  const logSeq = useRef(0);
  const addLog = useCallback((type, message, draftId = null) => {
    setSyncLogs(prev => [...prev, {
      id: `${Date.now()}_${logSeq.current++}`,
      type, // "success" | "error" | "info"
      message,
      draftId,
      timestamp: new Date().toISOString(),
    }].slice(-50));
  }, []);

  const saveDraft = useCallback((interviewData) => {
    const draftId = interviewData._draftId || `draft_${Date.now()}`;
    const draft = { ...interviewData, _draftId: draftId, _savedAt: new Date().toISOString(), _syncStatus: "pending" };
    setDrafts(prev => {
      const idx = prev.findIndex(d => d._draftId === draftId);
      if (idx >= 0) { const u = [...prev]; u[idx] = draft; return u; }
      return [...prev, draft];
    });
    addLog("info", `Rascunho "${interviewData.survey_title || "sem título"}" salvo localmente.`, draftId);
    return draftId;
  }, [addLog]);

  const removeDraft = useCallback((draftId) => {
    setDrafts(prev => prev.filter(d => d._draftId !== draftId));
  }, []);

  const updateDraft = useCallback((draftId, updates) => {
    setDrafts(prev => prev.map(d => d._draftId === draftId ? { ...d, ...updates, _savedAt: new Date().toISOString() } : d));
  }, []);

  const syncDrafts = useCallback(async () => {
    if (syncRef.current || !isOnline) return 0;
    // Sincroniza apenas entrevistas CONCLUÍDAS. Rascunhos "em_andamento"
    // (auto-save de entrevistas em curso) permanecem locais até serem finalizados.
    const pending = draftsRef.current
      .filter(d => d._syncStatus !== "failed_permanent" && d.status === "concluida");
    if (pending.length === 0) return 0;

    // O envio passa pela função backend "fieldSubmitInterview", que valida o
    // código de acesso e força empresa/entrevistador no servidor
    const accessCode = loadLocal(FIELD_USER_KEY, null)?.access_code;
    if (!accessCode) {
      addLog("error", "Sessão do entrevistador não encontrada. Faça login novamente para sincronizar.");
      return 0;
    }

    syncRef.current = true;
    setSyncing(true);
    addLog("info", `Iniciando sincronização de ${pending.length} rascunho(s)...`);

    let successCount = 0;
    const successIds = [];

    for (const draft of pending) {
      const { _draftId, _savedAt, _syncStatus, _lastError, _audioBase64, ...interviewData } = draft;
      try {
        const res = await base44.functions.invoke("fieldSubmitInterview", {
          code: accessCode,
          interview: interviewData,
          audio_base64: _audioBase64 || undefined,
        });
        successIds.push(_draftId);
        successCount++;
        if (res?.audio_failed) {
          addLog("error", `"${interviewData.survey_title || "Entrevista"}" enviada, mas o áudio não pôde ser salvo.`, _draftId);
        } else {
          addLog("success", `"${interviewData.survey_title || "Entrevista"}" enviada com sucesso.`, _draftId);
        }
      } catch (e) {
        // Erros de negócio (4xx) não se resolvem com novas tentativas — ex.:
        // pesquisa encerrada/não atribuída, limite atingido, áudio grande.
        // Marcamos como permanente para sair da fila e não ficar reenviando
        // para sempre; o rascunho continua visível para editar/excluir.
        const permanent = [400, 401, 403, 404, 409, 413, 422].includes(e?.status);
        const newStatus = permanent ? "failed_permanent" : "error";
        addLog("error", `${permanent ? "Não enviada (precisa de ação)" : "Falha ao enviar"} "${interviewData.survey_title || "Entrevista"}": ${e.message || "erro desconhecido"}`, _draftId);
        setDrafts(prev => prev.map(d => d._draftId === _draftId ? { ...d, _syncStatus: newStatus, _lastError: e.message } : d));
      }
    }

    if (successIds.length > 0) {
      setDrafts(prev => prev.filter(d => !successIds.includes(d._draftId)));
      setLastSynced(new Date());
    }

    if (successCount === pending.length) addLog("success", `Sincronização concluída. ${successCount} rascunho(s) enviado(s).`);
    else if (successCount > 0) addLog("info", `Sincronização parcial: ${successCount}/${pending.length} enviados.`);

    setSyncing(false);
    syncRef.current = false;
    return successCount;
  }, [isOnline, addLog]);

  const hasSyncable = (list) => list.some(d => d.status === "concluida" && d._syncStatus !== "failed_permanent");

  // Auto-sync on reconnect
  useEffect(() => {
    if (isOnline && hasSyncable(drafts)) { syncDrafts(); }
  }, [isOnline]);

  // Periodic auto-sync every 2 minutes when online and has pending completed drafts
  useEffect(() => {
    if (!isOnline) return;
    const interval = setInterval(() => {
      if (hasSyncable(draftsRef.current)) syncDrafts();
    }, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isOnline, syncDrafts]);

  // Offline surveys management
  const downloadSurvey = useCallback((survey) => {
    const size = JSON.stringify(survey).length;
    setOfflineSurveys(prev => {
      const existing = prev.find(s => s.id === survey.id);
      if (existing) return prev.map(s => s.id === survey.id ? { ...survey, _downloadedAt: new Date().toISOString(), _size: size } : s);
      return [...prev, { ...survey, _downloadedAt: new Date().toISOString(), _size: size }];
    });
    addLog("success", `Pesquisa "${survey.title}" baixada para uso offline.`);
  }, [addLog]);

  const removeSurveyOffline = useCallback((surveyId) => {
    setOfflineSurveys(prev => prev.filter(s => s.id !== surveyId));
  }, []);

  const clearLogs = useCallback(() => setSyncLogs([]), []);

  const totalStorageBytes = [...drafts, ...offlineSurveys].reduce((acc, item) => acc + JSON.stringify(item).length, 0);

  return {
    isOnline, drafts, syncing, lastSynced, syncLogs,
    saveDraft, removeDraft, updateDraft, syncDrafts,
    offlineSurveys, downloadSurvey, removeSurveyOffline,
    totalStorageBytes, clearLogs, addLog,
  };
}