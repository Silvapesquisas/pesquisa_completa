import { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";

const DRAFTS_KEY = "fieldsurvey_drafts";
const OFFLINE_SURVEYS_KEY = "fieldsurvey_offline_surveys";
const SYNC_LOGS_KEY = "fieldsurvey_sync_logs";

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { return fallback; }
}

// Pode falhar por falta de espaço (QuotaExceededError) — não derruba o app
function persist(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (e) { console.error(`Falha ao salvar ${key} no localStorage:`, e); }
}

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [drafts, setDrafts] = useState(() => loadJSON(DRAFTS_KEY, []));
  const [offlineSurveys, setOfflineSurveys] = useState(() => loadJSON(OFFLINE_SURVEYS_KEY, []));
  const [syncLogs, setSyncLogs] = useState(() => loadJSON(SYNC_LOGS_KEY, []));
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);
  const syncRef = useRef(false);

  // Online/offline detection
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // Persist to localStorage
  useEffect(() => { persist(DRAFTS_KEY, drafts); }, [drafts]);
  useEffect(() => { persist(OFFLINE_SURVEYS_KEY, offlineSurveys); }, [offlineSurveys]);
  useEffect(() => { persist(SYNC_LOGS_KEY, syncLogs.slice(-50)); }, [syncLogs]);

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
    const pending = loadJSON(DRAFTS_KEY, [])
      .filter(d => d._syncStatus !== "failed_permanent" && d.status === "concluida");
    if (pending.length === 0) return 0;

    syncRef.current = true;
    setSyncing(true);
    addLog("info", `Iniciando sincronização de ${pending.length} rascunho(s)...`);

    let successCount = 0;
    const successIds = [];

    for (const draft of pending) {
      const { _draftId, _savedAt, _syncStatus, _lastError, _audioBase64, ...interviewData } = draft;
      try {
        // Áudio gravado offline: envia o arquivo antes de criar a entrevista
        if (_audioBase64 && !interviewData.audio_url) {
          const blob = await (await fetch(_audioBase64)).blob();
          const file = new File([blob], "audio.webm", { type: blob.type || "audio/webm" });
          const { file_url } = await base44.integrations.Core.UploadFile({ file });
          interviewData.audio_url = file_url;
        }
        await base44.entities.Interview.create(interviewData);
        successIds.push(_draftId);
        successCount++;
        addLog("success", `"${interviewData.survey_title || "Entrevista"}" enviada com sucesso.`, _draftId);
      } catch (e) {
        addLog("error", `Falha ao enviar "${interviewData.survey_title || "Entrevista"}": ${e.message || "erro desconhecido"}`, _draftId);
        setDrafts(prev => prev.map(d => d._draftId === _draftId ? { ...d, _syncStatus: "error", _lastError: e.message } : d));
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

  // Auto-sync on reconnect
  useEffect(() => {
    if (isOnline && drafts.some(d => d.status === "concluida")) { syncDrafts(); }
  }, [isOnline]);  

  // Periodic auto-sync every 2 minutes when online and has pending completed drafts
  useEffect(() => {
    if (!isOnline) return;
    const interval = setInterval(() => {
      const current = loadJSON(DRAFTS_KEY, []);
      if (current.some(d => d.status === "concluida")) syncDrafts();
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