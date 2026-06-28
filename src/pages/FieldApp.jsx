import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MapPin, Mic, MicOff, CheckCircle2, ChevronRight, ChevronLeft, Loader2, Save, List, KeyRound, LogOut, BookOpen, Target, BarChart2 } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import FieldNotifications from "@/components/fieldapp/FieldNotifications";
import { useOfflineSync } from "@/components/fieldapp/useOfflineSync";
import SyncStatusBar from "@/components/fieldapp/SyncStatusBar";
import SyncErrorBanner from "@/components/fieldapp/SyncErrorBanner";
import DraftsList from "@/components/fieldapp/DraftsList";
import OfflineSurveys from "@/components/fieldapp/OfflineSurveys";
import QuestionIndex from "@/components/fieldapp/QuestionIndex";
import OnboardingTutorial from "@/components/fieldapp/OnboardingTutorial";

const FIELD_USER_KEY = "fieldapp_user";

const OTHER_LABEL = "Outra";
// Reconhece a opção "Outra/Outro/Outros" que o usuário tenha digitado na lista,
// para não duplicar com a opção especial gerada pelo allow_other.
const isOtherOption = (opt) => /^outr[oa]s?$/i.test((opt || "").trim());

function QuestionField({ question, value, onChange }) {
  const type = question.type;
  if (type === "aberta") {
    return <Textarea value={value || ""} onChange={e => onChange(e.target.value)} placeholder="Sua resposta..." rows={3} className="text-base" />;
  }
  if (type === "sim_nao") {
    return (
      <div className="grid grid-cols-2 gap-3">
        {["Sim", "Não"].map(opt => (
          <button key={opt} onClick={() => onChange(opt)}
            className={`py-4 rounded-xl border-2 text-sm font-semibold transition-all ${value === opt ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600"}`}>
            {opt}
          </button>
        ))}
      </div>
    );
  }
  if (type === "escala") {
    return (
      <div className="grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} onClick={() => onChange(String(n))}
            className={`py-4 rounded-xl border-2 text-lg font-bold transition-all ${value === String(n) ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500"}`}>
            {n}
          </button>
        ))}
      </div>
    );
  }
  if (type === "unica_escolha") {
    const allowOther = !!question.allow_other;
    const presets = (question.options || []).filter(o => !allowOther || !isOtherOption(o));
    const otherPrefix = `${OTHER_LABEL}: `;
    const isOther = allowOther && (value === OTHER_LABEL || (value || "").startsWith(otherPrefix));
    const otherText = (value || "").startsWith(otherPrefix) ? value.slice(otherPrefix.length) : "";
    return (
      <div className="space-y-2">
        {presets.map(opt => (
          <button key={opt} onClick={() => onChange(opt)}
            className={`w-full text-left py-3 px-4 rounded-xl border-2 text-sm transition-all ${value === opt ? "border-blue-600 bg-blue-50 text-blue-700 font-medium" : "border-gray-200 text-gray-600"}`}>
            {opt}
          </button>
        ))}
        {allowOther && (
          <button onClick={() => onChange(otherText ? otherPrefix + otherText : OTHER_LABEL)}
            className={`w-full text-left py-3 px-4 rounded-xl border-2 text-sm transition-all ${isOther ? "border-blue-600 bg-blue-50 text-blue-700 font-medium" : "border-gray-200 text-gray-600"}`}>
            {OTHER_LABEL}
          </button>
        )}
        {isOther && (
          <Input autoFocus value={otherText} placeholder="Especifique..."
            onChange={e => onChange(e.target.value ? otherPrefix + e.target.value : OTHER_LABEL)}
            className="text-base mt-1" />
        )}
      </div>
    );
  }
  if (type === "multipla_escolha") {
    const allowOther = !!question.allow_other;
    const selected = value ? value.split("|") : [];
    const presets = (question.options || []).filter(o => !allowOther || !isOtherOption(o));
    const otherPrefix = `${OTHER_LABEL}: `;
    const otherEntry = selected.find(s => s === OTHER_LABEL || s.startsWith(otherPrefix));
    const isOther = allowOther && otherEntry !== undefined;
    const otherText = otherEntry && otherEntry.startsWith(otherPrefix) ? otherEntry.slice(otherPrefix.length) : "";
    const emit = (arr) => onChange(arr.join("|"));
    const togglePreset = (opt) => {
      const updated = selected.includes(opt) ? selected.filter(o => o !== opt) : [...selected, opt];
      emit(updated);
    };
    const toggleOther = () => {
      if (isOther) emit(selected.filter(s => s !== otherEntry));
      else emit([...selected, OTHER_LABEL]);
    };
    const setOtherText = (t) => {
      const base = selected.filter(s => s !== otherEntry);
      emit([...base, t ? otherPrefix + t : OTHER_LABEL]);
    };
    return (
      <div className="space-y-2">
        {presets.map(opt => (
          <button key={opt} onClick={() => togglePreset(opt)}
            className={`w-full text-left py-3 px-4 rounded-xl border-2 text-sm transition-all ${selected.includes(opt) ? "border-blue-600 bg-blue-50 text-blue-700 font-medium" : "border-gray-200 text-gray-600"}`}>
            <span className="mr-2">{selected.includes(opt) ? "☑" : "☐"}</span>{opt}
          </button>
        ))}
        {allowOther && (
          <button onClick={toggleOther}
            className={`w-full text-left py-3 px-4 rounded-xl border-2 text-sm transition-all ${isOther ? "border-blue-600 bg-blue-50 text-blue-700 font-medium" : "border-gray-200 text-gray-600"}`}>
            <span className="mr-2">{isOther ? "☑" : "☐"}</span>{OTHER_LABEL}
          </button>
        )}
        {isOther && (
          <Input value={otherText} placeholder="Especifique..."
            onChange={e => setOtherText(e.target.value)}
            className="text-base mt-1" />
        )}
      </div>
    );
  }
  return <Input value={value || ""} onChange={e => onChange(e.target.value)} placeholder="Resposta..." className="text-base" />;
}

// ── LOGIN BY CODE ──
function CodeLogin({ onLogin }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    if (code.length !== 8) { setError("O código deve ter 8 dígitos."); return; }
    setLoading(true);
    setError("");
    try {
      // Login validado no servidor (função backend) — as entidades são
      // protegidas por RLS e não podem ser consultadas anonimamente
      const res = await base44.functions.invoke("fieldLogin", { code });
      const fieldUser = res.fieldUser;
      // Persist in localStorage for offline access
      localStorage.setItem(FIELD_USER_KEY, JSON.stringify(fieldUser));
      onLogin(fieldUser);
    } catch (e) {
      if (!navigator.onLine) {
        setError("Sem conexão. O primeiro acesso precisa de internet; depois o app funciona offline.");
      } else if (e?.status === 401 || e?.status === 400) {
        setError("Código inválido ou entrevistador inativo. Verifique com seu supervisor.");
      } else if (e?.status === 404) {
        setError("Função de login não publicada no servidor (404). O administrador precisa publicar as funções do app de campo.");
      } else {
        setError(`Erro ao verificar o código${e?.status ? ` (${e.status})` : ""}. ${e?.message || "Tente novamente."}`);
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-indigo-700 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8 space-y-6">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <KeyRound className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">App de Campo</h1>
          <p className="text-sm text-gray-500 mt-1">Digite seu código de acesso</p>
        </div>
        <div className="space-y-3">
          <Input
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
            placeholder="00000000"
            className="text-center text-2xl tracking-[0.5em] font-mono font-bold h-14"
            maxLength={8}
            inputMode="numeric"
            onKeyDown={e => e.key === "Enter" && handleLogin()}
          />
          {error && <p className="text-sm text-red-500 text-center">{error}</p>}
          <Button
            className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-base"
            onClick={handleLogin}
            disabled={loading || code.length !== 8}
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Entrar"}
          </Button>
        </div>
        <p className="text-xs text-gray-400 text-center">
          Não sabe seu código? Solicite ao seu supervisor ou gestor da pesquisa.
        </p>
      </div>
    </div>
  );
}

export default function FieldApp() {
  const [fieldUser, setFieldUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [onlineSurveys, setOnlineSurveys] = useState([]);
  const [selectedSurvey, setSelectedSurvey] = useState(null);
  const [answers, setAnswers] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [step, setStep] = useState("select");
  const [location, setLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null); // URL para reprodução (data URL local ou URL remota de rascunho antigo)
  const [audioBase64, setAudioBase64] = useState(null); // áudio aguardando envio (o upload é feito pelo servidor no envio da entrevista)
  const [audioDuration, setAudioDuration] = useState(0);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState(null);
  const [showIndex, setShowIndex] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [autoSaveMsg, setAutoSaveMsg] = useState("");
  // Id estável por entrevista, enviado ao servidor para deduplicar reenvios
  // (evita entrevista duplicada quando a resposta do envio se perde).
  const clientUuidRef = useRef(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [loadingSurveys, setLoadingSurveys] = useState(false);
  const [myInterviewCounts, setMyInterviewCounts] = useState({}); // surveyId -> count
  const [companyMonthly, setCompanyMonthly] = useState(null); // { limit, used } cota mensal da empresa
  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);
  const startTime = useRef(null);
  const autoSaveTimer = useRef(null);
  const locationWatch = useRef(null);

  const {
    isOnline, drafts, syncing, lastSynced, syncLogs,
    saveDraft, removeDraft, syncDrafts, clearLogs,
    offlineSurveys, downloadSurvey, removeSurveyOffline, totalStorageBytes,
  } = useOfflineSync();

  // Try to restore session from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(FIELD_USER_KEY);
    if (stored) {
      try {
        setFieldUser(JSON.parse(stored));
      } catch {}
    }
    setLoadingUser(false);
  }, []);

  const loadSurveys = async (user) => {
    if (!user || !isOnline) return;
    setLoadingSurveys(true);
    try {
      // Tudo vem da função backend, já validado e restrito à empresa do
      // entrevistador: dados atualizados do FieldUser, pesquisas ativas
      // atribuídas e contagem de entrevistas concluídas por pesquisa
      const res = await base44.functions.invoke("fieldLogin", { code: user.access_code });
      localStorage.setItem(FIELD_USER_KEY, JSON.stringify(res.fieldUser));
      setFieldUser(res.fieldUser);
      setOnlineSurveys(res.surveys || []);
      setMyInterviewCounts(res.counts || {});
      setCompanyMonthly(res.companyMonthly || null);
    } catch {
      // silently fail
    }
    setLoadingSurveys(false);
  };

  // Load surveys when user is set and online.
  // A dependência é o access_code (não o objeto fieldUser): loadSurveys grava
  // um objeto novo em fieldUser e usar o objeto como dependência causava um
  // loop infinito de requisições.
  useEffect(() => {
    if (fieldUser && isOnline) loadSurveys(fieldUser);
  }, [fieldUser?.access_code, isOnline]); // eslint-disable-line react-hooks/exhaustive-deps

  const allSurveys = [
    ...offlineSurveys,
    ...onlineSurveys.filter(s => !offlineSurveys.find(o => o.id === s.id)),
  ];

  // Entrevistas concluídas offline (aguardando sincronização) também contam para o limite
  const effectiveCounts = { ...myInterviewCounts };
  drafts.filter(d => d.status === "concluida").forEach(d => {
    effectiveCounts[d.survey_id] = (effectiveCounts[d.survey_id] || 0) + 1;
  });

  // Retorna o limite efetivo: personalizado do entrevistador ou padrão da pesquisa
  const getEffectiveLimit = (survey) => {
    const personalLimit = fieldUser?.survey_interview_limits?.[survey.id];
    if (personalLimit !== undefined && personalLimit !== null && personalLimit !== "") return Number(personalLimit);
    return survey.max_interviews_per_interviewer || null;
  };

  const handleLogin = (fu) => setFieldUser(fu);

  const handleLogout = () => {
    localStorage.removeItem(FIELD_USER_KEY);
    setFieldUser(null);
    setStep("select");
    setSelectedSurvey(null);
    setAnswers({});
  };

  // Precisão alvo do GPS em metros: ao atingi-la a captura é encerrada;
  // até lá, leituras vão sendo refinadas (a primeira leitura costuma ser imprecisa).
  const GPS_TARGET_ACCURACY_M = 20;
  const GPS_CAPTURE_TIMEOUT_MS = 25000;

  const stopLocationCapture = () => {
    if (!locationWatch.current) return;
    navigator.geolocation.clearWatch(locationWatch.current.watchId);
    clearTimeout(locationWatch.current.timer);
    locationWatch.current = null;
    setLocationLoading(false);
  };

  useEffect(() => () => stopLocationCapture(), []);  

  const getLocation = (silent = false) => {
    if (!("geolocation" in navigator)) {
      if (!silent) alert("Este dispositivo/navegador não suporta geolocalização.");
      return;
    }
    stopLocationCapture();
    setLocationLoading(true);
    let best = null;

    const watchId = navigator.geolocation.watchPosition(
      pos => {
        const fix = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        if (!best || fix.accuracy < best.accuracy) {
          best = fix;
          setLocation(fix);
        }
        if (fix.accuracy <= GPS_TARGET_ACCURACY_M) stopLocationCapture();
      },
      err => {
        if (best) return; // já temos uma posição válida, ignora erros posteriores
        stopLocationCapture();
        if (silent) return;
        const messages = {
          1: "Permissão de localização negada. Habilite o acesso à localização nas configurações do navegador/dispositivo.",
          2: "Localização indisponível. Verifique se o GPS está ativado.",
          3: "Tempo esgotado ao obter localização. Tente novamente em área aberta.",
        };
        alert(messages[err.code] || "Não foi possível obter localização. Verifique as permissões do navegador/dispositivo.");
      },
      { enableHighAccuracy: true, timeout: GPS_CAPTURE_TIMEOUT_MS, maximumAge: 0 }
    );
    const timer = setTimeout(() => {
      stopLocationCapture();
      if (!best && !silent) alert("Tempo esgotado ao obter localização. Tente novamente em área aberta.");
    }, GPS_CAPTURE_TIMEOUT_MS);
    locationWatch.current = { watchId, timer };
  };

  const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  // Limite para manter áudio offline no localStorage (~5MB total disponível)
  const MAX_OFFLINE_AUDIO_BYTES = 2.5 * 1024 * 1024;

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      alert("Este dispositivo/navegador não suporta gravação de áudio.");
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      alert("Não foi possível acessar o microfone. Verifique as permissões do navegador/dispositivo.");
      return;
    }
    mediaRecorder.current = new MediaRecorder(stream);
    audioChunks.current = [];
    startTime.current = Date.now();
    mediaRecorder.current.ondataavailable = e => audioChunks.current.push(e.data);
    mediaRecorder.current.onstop = async () => {
      const blob = new Blob(audioChunks.current, { type: "audio/webm" });
      const duration = (Date.now() - startTime.current) / 1000;
      setAudioDuration(duration);
      stream.getTracks().forEach(t => t.stop());
      // O áudio fica local (data URL) e é enviado ao servidor junto com a
      // entrevista, pela função backend — o cliente anônimo não tem acesso
      // direto ao upload de arquivos.
      const dataUrl = await blobToDataUrl(blob);
      setAudioUrl(dataUrl);
      if (dataUrl.length <= MAX_OFFLINE_AUDIO_BYTES) {
        setAudioBase64(dataUrl);
      } else {
        setAudioBase64(null);
        alert("Áudio gravado, mas é muito longo para ser salvo com a entrevista. Grave trechos mais curtos.");
      }
    };
    mediaRecorder.current.start();
    setRecording(true);
  };

  const stopRecording = () => { mediaRecorder.current?.stop(); setRecording(false); };

  // 1) Filtra por dependência condicional (depends_on)
  const baseVisible = (selectedSurvey?.questions || []).filter(q => {
    if (!q.depends_on_question_id) return true;
    const depAnswer = answers[q.depends_on_question_id];
    if (!depAnswer) return false;
    return !q.depends_on_answer || depAnswer === q.depends_on_answer || depAnswer.split("|").includes(q.depends_on_answer);
  });

  // 2) Aplica o "pular para" (skip_logic): segue as regras de salto a partir da
  // primeira questão, montando o caminho efetivo conforme as respostas dadas.
  // Saltos são sempre para frente, então não há risco de loop.
  const visibleQuestions = (() => {
    if (baseVisible.length === 0) return [];
    const indexById = {};
    baseVisible.forEach((q, i) => { indexById[q.id] = i; });
    const path = [];
    let i = 0;
    while (i >= 0 && i < baseVisible.length) {
      const q = baseVisible[i];
      path.push(q);
      const ans = answers[q.id];
      let next = i + 1;
      if (ans && Array.isArray(q.skip_logic) && q.skip_logic.length > 0) {
        const selected = typeof ans === "string" ? ans.split("|") : [ans];
        const rule = q.skip_logic.find(r => selected.includes(r.answer));
        if (rule) {
          if (rule.target === "__end__") next = baseVisible.length;
          else if (indexById[rule.target] != null && indexById[rule.target] > i) next = indexById[rule.target];
        }
      }
      i = next;
    }
    return path;
  })();

  const currentQuestion = visibleQuestions[currentIndex];

  const goNext = () => {
    if (currentQuestion?.required && !answers[currentQuestion.id]) { alert("Esta questão é obrigatória."); return; }
    if (currentQuestion?.required && currentQuestion?.allow_other) {
      const v = answers[currentQuestion.id] || "";
      const parts = currentQuestion.type === "multipla_escolha" ? v.split("|") : [v];
      if (parts.includes(OTHER_LABEL)) { alert("Especifique a opção \"Outra\"."); return; }
    }
    if (currentIndex < visibleQuestions.length - 1) setCurrentIndex(i => i + 1);
    else setStep("review");
  };

  const skipQuestion = () => {
    if (currentQuestion?.required) { alert("Esta questão é obrigatória e não pode ser pulada."); return; }
    if (currentIndex < visibleQuestions.length - 1) setCurrentIndex(i => i + 1);
    else setStep("review");
  };

  const buildInterviewData = () => {
    if (!clientUuidRef.current) clientUuidRef.current = crypto.randomUUID();
    const formattedAnswers = visibleQuestions.map(q => {
      const raw = answers[q.id] || "";
      const isMulti = q.type === "multipla_escolha";
      return {
        question_id: q.id, question_text: q.text, question_type: q.type,
        answer: isMulti ? raw.split("|").join(", ") : raw,
        answer_array: isMulti ? raw.split("|").filter(Boolean) : [],
      };
    });
    return {
      client_uuid: clientUuidRef.current,
      survey_id: selectedSurvey.id,
      survey_title: selectedSurvey.title,
      field_user_id: fieldUser?.id,
      interviewer_name: fieldUser?.name || "Entrevistador",
      company_id: fieldUser?.company_id,
      status: "concluida",
      answers: formattedAnswers,
      latitude: location?.lat || null,
      longitude: location?.lng || null,
      location_accuracy: location?.accuracy || null,
      audio_url: null, // definido pelo servidor após o upload do áudio
      audio_duration: audioDuration,
      notes,
      completed_at: new Date().toISOString(),
      edit_history: [],
    };
  };

  const saveAsDraft = (andExit = false) => {
    const data = buildInterviewData();
    const draftId = saveDraft({ ...data, _draftId: currentDraftId, _audioBase64: audioBase64, status: "em_andamento" });
    setCurrentDraftId(draftId);
    if (andExit) { resetInterview(); } else { alert("Rascunho salvo!"); }
  };

  const submit = async () => {
    setSaving(true);
    const interviewData = buildInterviewData();
    if (!isOnline) {
      saveDraft({ ...interviewData, _draftId: currentDraftId, _audioBase64: audioBase64 });
      setSaving(false);
      setStep("done");
      return;
    }
    try {
      // O envio passa pela função backend, que valida o código de acesso e
      // força empresa/entrevistador no servidor (entidades trancadas por RLS)
      await base44.functions.invoke("fieldSubmitInterview", {
        code: fieldUser.access_code,
        interview: interviewData,
        audio_base64: audioBase64 || undefined,
      });
      if (currentDraftId) removeDraft(currentDraftId);
      setStep("done");
    } catch (e) {
      // Falha no envio (conexão instável, etc.): preserva como rascunho para sincronizar depois
      saveDraft({ ...interviewData, _draftId: currentDraftId, _audioBase64: audioBase64 });
      alert(`Falha ao enviar a entrevista${e?.message ? `: ${e.message}` : ""}. Ela foi salva como rascunho e será sincronizada automaticamente.`);
      setStep("done");
    }
    setSaving(false);
  };

  const loadDraft = (draft) => {
    const survey = allSurveys.find(s => s.id === draft.survey_id);
    if (!survey) { alert("Pesquisa do rascunho não encontrada. Baixe-a para uso offline."); return; }
    const answersMap = {};
    (draft.answers || []).forEach(a => {
      answersMap[a.question_id] = a.answer_array?.length > 0 ? a.answer_array.join("|") : a.answer;
    });
    setSelectedSurvey(survey);
    setAnswers(answersMap);
    setNotes(draft.notes || "");
    setLocation(draft.latitude && draft.longitude
      ? { lat: draft.latitude, lng: draft.longitude, accuracy: draft.location_accuracy || null }
      : null);
    setAudioBase64(draft._audioBase64 || null);
    setAudioUrl(draft.audio_url || draft._audioBase64 || null);
    setAudioDuration(draft.audio_duration || 0);
    setCurrentDraftId(draft._draftId);
    clientUuidRef.current = draft.client_uuid || draft._draftId || crypto.randomUUID();
    setCurrentIndex(0);
    setStep("interview");
  };

  const deleteDraft = (draftId) => {
    if (confirm("Excluir este rascunho?")) removeDraft(draftId);
  };

  // Ref com o snapshot do auto-save: evita closures obsoletas (notes/localização)
  // e reiniciar o intervalo a cada tecla digitada.
  const autoSaveRef = useRef(null);
  autoSaveRef.current = selectedSurvey
    ? { data: buildInterviewData(), draftId: currentDraftId, audioBase64 }
    : null;

  useEffect(() => {
    if (step !== "interview") {
      if (autoSaveTimer.current) clearInterval(autoSaveTimer.current);
      return;
    }
    autoSaveTimer.current = setInterval(() => {
      const snapshot = autoSaveRef.current;
      if (!snapshot) return;
      const draftId = saveDraft({ ...snapshot.data, _draftId: snapshot.draftId, _audioBase64: snapshot.audioBase64, status: "em_andamento" });
      // Mantém o mesmo rascunho nos próximos auto-saves em vez de criar duplicados
      if (!snapshot.draftId) setCurrentDraftId(draftId);
      setAutoSaveMsg("Salvo automaticamente");
      setTimeout(() => setAutoSaveMsg(""), 2000);
    }, 30000);
    return () => clearInterval(autoSaveTimer.current);
  }, [step, saveDraft]);

  // Se uma regra de salto encurtar o caminho abaixo do índice atual
  // (ex.: voltar e mudar a resposta), mantém o índice dentro dos limites.
  useEffect(() => {
    if (step === "interview" && visibleQuestions.length > 0 && currentIndex > visibleQuestions.length - 1) {
      setCurrentIndex(visibleQuestions.length - 1);
    }
  }, [step, currentIndex, visibleQuestions.length]);

  const resetInterview = () => {
    stopLocationCapture();
    setStep("select"); setSelectedSurvey(null); setAnswers({});
    setCurrentIndex(0); setLocation(null); setAudioUrl(null);
    setAudioBase64(null); setAudioDuration(0);
    setNotes(""); setCurrentDraftId(null); setShowIndex(false);
    clientUuidRef.current = null;
    if (autoSaveTimer.current) clearInterval(autoSaveTimer.current);
  };

  // Loading state
  if (loadingUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // Not logged in — show code login screen
  if (!fieldUser) {
    return <CodeLogin onLogin={handleLogin} />;
  }

  // ── DONE ──
  if (step === "done") {
    const savedOffline = !isOnline;
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex flex-col items-center justify-center p-6 gap-4">
        <CheckCircle2 className="w-16 h-16 text-green-500" />
        <h2 className="text-2xl font-bold text-gray-900">{savedOffline ? "Rascunho Salvo!" : "Entrevista Enviada!"}</h2>
        <p className="text-gray-500 text-center text-sm">
          {savedOffline ? "Sem conexão. Dados salvos localmente e sincronizados automaticamente ao voltar online." : "Registrado com sucesso."}
        </p>
        <div className="w-full max-w-sm">
          <SyncStatusBar isOnline={isOnline} syncing={syncing} drafts={drafts} lastSynced={lastSynced} onSync={syncDrafts} syncLogs={syncLogs} onClearLogs={clearLogs} />
        </div>
        <Button onClick={resetInterview} className="bg-green-600 hover:bg-green-700">Nova Entrevista</Button>
      </div>
    );
  }

  // ── REVIEW ──
  if (step === "review") {
    return (
      <div className="min-h-screen bg-gray-50 p-4 space-y-4 pb-36">
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-1">Revisão Final</h2>
          <p className="text-sm text-gray-500">{selectedSurvey?.title}</p>
        </div>
        <div className={`rounded-2xl p-5 shadow-sm space-y-3 border-2 ${location ? "bg-white border-green-200" : "bg-orange-50 border-orange-300"}`}>
          <h3 className="font-semibold text-gray-700 text-sm flex items-center gap-2">
            <MapPin className={`w-4 h-4 ${location ? "text-green-600" : "text-orange-500"}`} />
            Localização {!location && <span className="text-xs font-normal text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">Recomendado</span>}
          </h3>
          {location ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                </p>
                {location.accuracy != null && (
                  <p className={`text-xs mt-0.5 ${location.accuracy <= GPS_TARGET_ACCURACY_M ? "text-green-500" : "text-orange-500"}`}>
                    Precisão: ±{Math.round(location.accuracy)}m
                    {location.accuracy > GPS_TARGET_ACCURACY_M && " — tente atualizar em área aberta para melhorar"}
                  </p>
                )}
              </div>
              <button onClick={() => getLocation()} disabled={locationLoading} className="text-xs text-gray-400 hover:text-blue-600 underline shrink-0">
                {locationLoading ? "Obtendo..." : "Atualizar"}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-orange-700">A localização não foi capturada ainda. Clique abaixo para tentar novamente.</p>
              <Button size="sm" onClick={() => getLocation()} disabled={locationLoading} className="w-full bg-orange-500 hover:bg-orange-600 text-white">
                {locationLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MapPin className="w-4 h-4 mr-2" />}
                {locationLoading ? "Obtendo localização..." : "Capturar Localização"}
              </Button>
            </div>
          )}
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
          <h3 className="font-semibold text-gray-700 text-sm flex items-center gap-2"><Mic className="w-4 h-4 text-purple-500" /> Áudio</h3>
          {audioUrl ? (
            <div className="space-y-2">
              <audio controls src={audioUrl} className="w-full" />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={recording ? stopRecording : startRecording}>
                  {recording ? <><MicOff className="w-3.5 h-3.5 mr-1" /> Parar</> : <><Mic className="w-3.5 h-3.5 mr-1" /> Regravar</>}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-2">Nenhum áudio gravado. Você pode gravar durante as questões ou aqui.</p>
              <Button variant="outline" size="sm" onClick={recording ? stopRecording : startRecording} className={`w-full ${recording ? "border-red-300 text-red-600 animate-pulse" : ""}`}>
                {recording ? <><MicOff className="w-4 h-4 mr-2" /> Parar Gravação</> : <><Mic className="w-4 h-4 mr-2" /> Gravar Áudio</>}
              </Button>
            </div>
          )}
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="font-semibold text-gray-700 text-sm mb-2">Observações</h3>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observações adicionais..." rows={3} />
        </div>
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 space-y-2">
          <SyncStatusBar isOnline={isOnline} syncing={syncing} drafts={drafts} lastSynced={lastSynced} onSync={syncDrafts} syncLogs={syncLogs} onClearLogs={clearLogs} />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setStep("interview"); setCurrentIndex(visibleQuestions.length - 1); }}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => saveAsDraft(false)}>
              <Save className="w-4 h-4 mr-1" /> Rascunho
            </Button>
            <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={submit} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              {saving ? "Enviando..." : isOnline ? "Enviar" : "Salvar Offline"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── INTERVIEW ──
  if (step === "interview" && currentQuestion) {
    const myCount = effectiveCounts[selectedSurvey?.id] || 0;
    const limit = selectedSurvey ? getEffectiveLimit(selectedSurvey) : null;
    const limitReached = limit && myCount >= limit;

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {showIndex && (
          <QuestionIndex
            questions={visibleQuestions}
            currentIndex={currentIndex}
            answers={answers}
            onSelect={setCurrentIndex}
            onClose={() => setShowIndex(false)}
          />
        )}
        <div className="bg-blue-600 text-white p-5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs opacity-75 truncate flex-1 mr-2">{selectedSurvey?.title}</p>
            <div className="flex items-center gap-3 shrink-0">
              {/* Audio recording at the top */}
              <button
                onClick={recording ? stopRecording : startRecording}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full transition-all ${recording ? "bg-red-500 text-white animate-pulse" : "bg-blue-500 text-blue-100 hover:text-white"}`}
              >
                {recording ? <><MicOff className="w-3 h-3" /> Parar</> : <><Mic className="w-3 h-3" /> {audioUrl ? "Regravando" : "Gravar"}</>}
              </button>
              <button onClick={() => setShowIndex(true)} className="text-xs text-blue-200 hover:text-white flex items-center gap-1">
                <List className="w-3 h-3" /> Índice
              </button>
              <button onClick={() => saveAsDraft(false)} className="text-xs text-blue-200 hover:text-white flex items-center gap-1">
                <Save className="w-3 h-3" /> Salvar
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-sm font-medium">Questão {currentIndex + 1} de {visibleQuestions.length}</span>
            <div className="flex items-center gap-2">
              {audioUrl && <span className="text-xs text-green-300 flex items-center gap-0.5"><Mic className="w-3 h-3" /> Áudio capturado</span>}
              {autoSaveMsg && <span className="text-xs text-blue-200 animate-pulse">{autoSaveMsg}</span>}
              {currentQuestion.required
                ? <Badge className="bg-blue-800 text-white text-xs">Obrigatória</Badge>
                : <Badge className="bg-blue-400/50 text-white text-xs">Opcional</Badge>}
            </div>
          </div>
          {limitReached && (
            <div className="mt-2 bg-orange-500 rounded-lg px-3 py-2 text-xs text-white flex items-center gap-2">
              <Target className="w-3.5 h-3.5 shrink-0" />
              Você atingiu o limite de {limit} entrevistas para esta pesquisa.
            </div>
          )}
          <div className="mt-3">
            <div className="flex justify-between text-xs text-blue-200 mb-1">
              <span>{Math.round(((currentIndex + 1) / visibleQuestions.length) * 100)}% concluído</span>
              <span>{visibleQuestions.length - currentIndex - 1} restantes</span>
            </div>
            <div className="w-full bg-blue-500 rounded-full h-2">
              <div className="bg-white h-2 rounded-full transition-all" style={{ width: `${((currentIndex + 1) / visibleQuestions.length) * 100}%` }} />
            </div>
          </div>
        </div>
        <div className="flex-1 p-5 space-y-5 pb-32">
          <p className="text-lg font-semibold text-gray-900 leading-snug">{currentQuestion.text}</p>
          <QuestionField
            question={currentQuestion}
            value={answers[currentQuestion.id]}
            onChange={val => setAnswers(a => ({ ...a, [currentQuestion.id]: val }))}
          />
        </div>
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 flex gap-2">
          {currentIndex > 0 ? (
            <Button variant="outline" className="shrink-0" onClick={() => setCurrentIndex(i => i - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
          ) : (
            <Button variant="outline" className="shrink-0" onClick={resetInterview}>Sair</Button>
          )}
          <Button variant="outline" className="shrink-0" onClick={() => saveAsDraft(true)}>
            <Save className="w-4 h-4 mr-1" /> Sair
          </Button>
          {!currentQuestion?.required && (
            <Button variant="ghost" className="shrink-0 text-gray-400 text-xs" onClick={skipQuestion}>
              Pular
            </Button>
          )}
          <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={goNext}>
            {currentIndex < visibleQuestions.length - 1 ? <><ChevronRight className="w-4 h-4 mr-1" /> Próxima</> : "Revisar e Enviar"}
          </Button>
        </div>
      </div>
    );
  }

  // ── SELECT ──
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 pb-10">
      {!bannerDismissed && (
        <SyncErrorBanner
          drafts={drafts}
          onGoToDrafts={() => { setBannerDismissed(false); document.getElementById("drafts-section")?.scrollIntoView({ behavior: "smooth" }); }}
          onDismiss={() => setBannerDismissed(true)}
        />
      )}
      <div className="p-5 space-y-5">
        {showTutorial && <OnboardingTutorial onClose={() => setShowTutorial(false)} />}
        <div className="pt-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Pesquisas de Campo</h1>
            <p className="text-gray-500 text-sm mt-1">
              Olá, <span className="font-medium text-gray-700">{fieldUser.name}</span>
              <Badge variant="outline" className="ml-2 text-xs capitalize">{fieldUser.role}</Badge>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <FieldNotifications fieldUser={fieldUser} />
            <Link
              to={createPageUrl("InterviewerDashboard")}
              className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors bg-indigo-50 px-2.5 py-1.5 rounded-lg"
            >
              <BarChart2 className="w-3.5 h-3.5" /> Meu Painel
            </Link>
            <button
              onClick={() => setShowTutorial(true)}
              className="flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-700 font-medium transition-colors bg-blue-50 px-2.5 py-1.5 rounded-lg"
            >
              <BookOpen className="w-3.5 h-3.5" /> Tutorial
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              <LogOut className="w-4 h-4" /> Sair
            </button>
          </div>
        </div>

        <SyncStatusBar
          isOnline={isOnline} syncing={syncing} drafts={drafts}
          lastSynced={lastSynced} onSync={syncDrafts}
          syncLogs={syncLogs} onClearLogs={clearLogs}
        />

        {companyMonthly && (
          <div className={`rounded-xl px-4 py-2.5 text-sm border ${
            companyMonthly.used >= companyMonthly.limit
              ? "bg-red-50 border-red-200 text-red-700"
              : "bg-blue-50 border-blue-100 text-blue-700"
          }`}>
            {companyMonthly.used >= companyMonthly.limit
              ? `Cota mensal da empresa atingida (${companyMonthly.used}/${companyMonthly.limit}). Novas entrevistas só no próximo mês ou após o administrador aumentar o limite.`
              : `Entrevistas da empresa neste mês: ${companyMonthly.used}/${companyMonthly.limit}.`}
          </div>
        )}

        <div id="drafts-section">
          <DraftsList drafts={drafts} onEdit={loadDraft} onDelete={deleteDraft} />
        </div>

        <OfflineSurveys
          surveys={allSurveys}
          offlineSurveys={offlineSurveys}
          onDownload={downloadSurvey}
          onRemove={removeSurveyOffline}
          totalStorageBytes={totalStorageBytes}
          isOnline={isOnline}
          loadingSurveys={loadingSurveys}
          onRefresh={() => loadSurveys(fieldUser)}
          myInterviewCounts={effectiveCounts}
          getEffectiveLimit={getEffectiveLimit}
          onSelect={(s) => {
            const limit = getEffectiveLimit(s);
            const myCount = effectiveCounts[s.id] || 0;
            if (limit && myCount >= limit) {
              alert(`Você atingiu o limite de ${limit} entrevistas para esta pesquisa.`);
              return;
            }
            setSelectedSurvey(s); setAnswers({}); setCurrentIndex(0); setLocation(null);
            setAudioUrl(null); setAudioBase64(null); setAudioDuration(0); setRecording(false);
            setCurrentDraftId(null); clientUuidRef.current = crypto.randomUUID();
            setStep("interview"); getLocation(true);
          }}
        />
      </div>
    </div>
  );
}