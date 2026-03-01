import { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";

const DRAFTS_KEY = "fieldsurvey_drafts";

function loadDrafts() {
  try {
    return JSON.parse(localStorage.getItem(DRAFTS_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveDraftsToStorage(drafts) {
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
}

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [drafts, setDrafts] = useState(loadDrafts);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);
  const syncRef = useRef(false);

  // Monitor online/offline
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // Persist drafts to localStorage
  useEffect(() => {
    saveDraftsToStorage(drafts);
  }, [drafts]);

  const saveDraft = useCallback((interviewData) => {
    const draft = {
      ...interviewData,
      _draftId: interviewData._draftId || `draft_${Date.now()}`,
      _savedAt: new Date().toISOString(),
    };
    setDrafts(prev => {
      const existing = prev.findIndex(d => d._draftId === draft._draftId);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = draft;
        return updated;
      }
      return [...prev, draft];
    });
    return draft._draftId;
  }, []);

  const removeDraft = useCallback((draftId) => {
    setDrafts(prev => prev.filter(d => d._draftId !== draftId));
  }, []);

  const syncDrafts = useCallback(async () => {
    if (syncRef.current || !isOnline) return;
    const pending = loadDrafts();
    if (pending.length === 0) return;

    syncRef.current = true;
    setSyncing(true);
    const successIds = [];

    for (const draft of pending) {
      try {
        const { _draftId, _savedAt, ...interviewData } = draft;
        await base44.entities.Interview.create(interviewData);
        successIds.push(_draftId);
      } catch (e) {
        // keep in drafts, will retry next sync
      }
    }

    if (successIds.length > 0) {
      setDrafts(prev => prev.filter(d => !successIds.includes(d._draftId)));
      setLastSynced(new Date());
    }

    setSyncing(false);
    syncRef.current = false;
    return successIds.length;
  }, [isOnline]);

  // Auto-sync when going online
  useEffect(() => {
    if (isOnline && drafts.length > 0) {
      syncDrafts();
    }
  }, [isOnline]);

  return { isOnline, drafts, syncing, lastSynced, saveDraft, removeDraft, syncDrafts };
}