import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MapPin, Mic, MicOff, CheckCircle2, ChevronRight, ChevronLeft, Loader2, Save, List, KeyRound, LogOut, BookOpen, Target, BarChart2, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import FieldNotifications from "@/components/fieldapp/FieldNotifications";
import { useOfflineSync } from "@/components/fieldapp/useOfflineSync";
import SyncStatusBar from "@/components/fieldapp/SyncStatusBar";
import SyncErrorBanner from "@/components/fieldapp/SyncErrorBanner";
import DraftsList from "@/components/fieldapp/DraftsList";
import OfflineSurveys from "@/components/fieldapp/OfflineSurveys";
import QuestionIndex from "@/components/fieldapp/QuestionIndex";
import QuotaPanel from "@/components/fieldapp/QuotaPanel";
import InstallApp from "@/components/fieldapp/InstallApp";
import { quotaProgress, quotasExceededBy } from "@/lib/sampling";
import OnboardingTutorial from "@/components/fieldapp/OnboardingTutorial";
import { displayOptions } from "@/lib/optionOrder";

const FIELD_USER_KEY = "fieldapp_user";
// Último progresso de cotas recebido do servidor, para o painel continuar
// útil offline (somado às entrevistas concluídas ainda não sincronizadas).
const QUOTAS_KEY = "fieldapp_quotas";

const OTHER_LABEL = "Outra";
// Reconhece a opção "Outra/Outro/Outros" que o usuário tenha digitado na lista,
// para não duplicar com a opção especial gerada pelo allow_other.
const isOtherOption = (opt) => /^outr[oa]s?$/i.test((opt || "").trim());

// Formato da gravação. Cada plataforma grava num formato diferente: Android/Chrome
// em WebM/Opus, iPhone em MP4/AAC. Antes o app rotulava tudo como WebM, e o áudio
// do iPhone chegava ao painel com o tipo errado. Escolhe o primeiro suportado;
// o tipo que vale no fim é o que o gravador informar.
const AUDIO_MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus", "audio/aac"];
function pickAudioMime() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return "";
  return AUDIO_MIME_CANDIDATES.find((t) => { try { return MediaRecorder.isTypeSupported(t); } catch { return false; } }) || "";
}

// Id do rascunho definido já no início da entrevista: todos os salvamentos
// (autosave, segundo plano, conclusão) gravam no MESMO registro, sem duplicar.
const newFieldDraftId = () => `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

function QuestionField({ question, value, onChange, orderSeed }) {
  const type = question.type;
  // Ordem das alternativas: sorteada quando a questão pede randomização.
  // useMemo antes de qualquer retorno condicional (regra dos hooks) e semeada
  // por entrevista+questão, para não remexer a lista a cada toque.
  const ordered = useMemo(
    () => displayOptions(question.options, {
      randomize: question.randomize_options,
      seed: `${orderSeed || ""}:${question.id}`,
    }),
    [question.options, question.randomize_options, question.id, orderSeed],
  );
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
    const presets = ordered.filter(o => !allowOther || !isOtherOption(o));
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
    const presets = ordered.filter(o => !allowOther || !isOtherOption(o));
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
    // Códigos novos têm 12 dígitos; os antigos, 8 — ambos válidos.
    if (code.length < 8 || code.length > 12) { setError("O código deve ter entre 8 e 12 dígitos."); return; }
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
      } else if (e?.code === "device_missing") {
        setError(e.message || "Não foi possível identificar este aparelho. Feche o app e abra de novo.");
      } else if (e?.code === "device_blocked" || e?.status === 409) {
        setError("Este código já está sendo usado em outro celular. Peça ao gestor para desvincular o aparelho anterior em Entrevistadores.");
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
            onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 12))}
            placeholder="000000000000"
            className="text-center text-xl tracking-[0.2em] font-mono font-bold h-14"
            maxLength={12}
            inputMode="numeric"
            onKeyDown={e => e.key === "Enter" && handleLogin()}
          />
          {error && <p className="text-sm text-red-500 text-center">{error}</p>}
          <Button
            className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-base"
            onClick={handleLogin}
            disabled={loading || code.length < 8}
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Entrar"}
          </Button>
        </div>
        <p className="text-xs text-gray-400 text-center">
          Não sabe seu código? Solicite ao seu supervisor ou gestor da pesquisa.
        </p>
        <InstallApp />
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
  // Cotas por estrato: { surveyId: { questionId: { resposta: quantidade } } }
  const [quotaCounts, setQuotaCounts] = useState(() => {
    try { return JSON.parse(localStorage.getItem(QUOTAS_KEY) || "{}"); } catch { return {}; }
  });
  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);
  const startTime = useRef(null);
  const autoSaveTimer = useRef(null);
  const locationWatch = useRef(null);

  const {
    isOnline, drafts, syncing, lastSynced, syncLogs,
    saveDraft, removeDraft, syncDrafts, sendDraft, retryDraft, loadDraftAudio, clearLogs,
    offlineSurveys, downloadSurvey, removeSurveyOffline, totalStorageBytes,
    storageError, saveError, retryHydrate,
  } = useOfflineSync();

  // Resultado da última entrevista concluída, para a tela final dizer a verdade:
  // "enviada", "salva no celular, será enviada" ou "NÃO salva — não feche o app".
  const [doneInfo, setDoneInfo] = useState(null);
  // Enquanto a conclusão está em andamento, o autosave não pode regravar a
  // entrevista como "em andamento" (isso a tiraria da fila de envio).
  const submittingRef = useRef(false);
  const stepRef = useRef("select");
  // Se o áudio salvo não pôde ser lido ao reabrir o rascunho, o autosave deve
  // MANTER o que está no aparelho em vez de gravar "sem áudio" por cima.
  const keepStoredAudioRef = useRef(false);
  const persistTimer = useRef(null);
  const recordingInterruptedRef = useRef(false);

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
      if (res.quotas) {
        setQuotaCounts(res.quotas);
        try { localStorage.setItem(QUOTAS_KEY, JSON.stringify(res.quotas)); } catch { /* cota de storage cheia */ }
      }
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

  // Entrevistas concluídas ainda não sincronizadas também contam nas cotas,
  // senão o entrevistador offline continuaria vendo o grupo como incompleto.
  const localQuotaCounts = (surveyId) => {
    const out = {};
    drafts.filter(d => d.status === "concluida" && d.survey_id === surveyId).forEach(d => {
      (d.answers || []).forEach(a => {
        const v = a.answer_array?.length ? a.answer_array[0] : a.answer;
        if (!v) return;
        out[a.question_id] = out[a.question_id] || {};
        out[a.question_id][v] = (out[a.question_id][v] || 0) + 1;
      });
    });
    return out;
  };

  // Progresso das cotas de uma pesquisa (servidor + concluídas locais).
  const quotaFor = (survey) => {
    if (!survey) return null;
    const server = quotaCounts[survey.id] || {};
    const local = localQuotaCounts(survey.id);
    const merged = { ...server };
    for (const [qid, byAnswer] of Object.entries(local)) {
      merged[qid] = { ...(merged[qid] || {}) };
      for (const [ans, qty] of Object.entries(byAnswer)) merged[qid][ans] = (merged[qid][ans] || 0) + qty;
    }
    return quotaProgress({ survey, counts: merged });
  };

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

  // Limite do áudio guardado/enviado. Agora os rascunhos ficam no IndexedDB
  // (cota grande), então o limite acompanha o do servidor (~15 MB de áudio,
  // ~20 MB como data URL base64). Suficiente para entrevistas longas de auditoria.
  const MAX_OFFLINE_AUDIO_BYTES = 20 * 1024 * 1024;

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
    const mimeType = pickAudioMime();
    try {
      mediaRecorder.current = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      mediaRecorder.current = new MediaRecorder(stream);
    }
    audioChunks.current = [];
    startTime.current = Date.now();
    mediaRecorder.current.ondataavailable = e => { if (e.data && e.data.size > 0) audioChunks.current.push(e.data); };
    mediaRecorder.current.onstop = async () => {
      // O tipo real vem do gravador (ou do próprio trecho gravado), nunca fixo.
      const recordedType = (mediaRecorder.current?.mimeType || audioChunks.current[0]?.type || mimeType || "audio/webm").split(";")[0];
      const blob = new Blob(audioChunks.current, { type: recordedType });
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
        keepStoredAudioRef.current = false;
        // Grava o áudio no aparelho imediatamente: se o app for encerrado logo
        // depois (comum no iPhone), a gravação não se perde.
        persistNow({ audio: dataUrl });
      } else {
        setAudioBase64(null);
        alert("Áudio gravado, mas é muito longo para ser salvo com a entrevista. Grave trechos mais curtos.");
      }
    };
    // Fatias de 1 s: o áudio é coletado aos poucos em vez de só no fim.
    mediaRecorder.current.start(1000);
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

  // Em pesquisas com áudio obrigatório, não avança enquanto a gravação não for
  // iniciada (ou já capturada).
  const audioBlocksAdvance = () => {
    if (selectedSurvey?.require_audio && !recording && !audioBase64) {
      alert('Esta pesquisa exige áudio. Toque em "Gravar áudio" para iniciar a gravação antes de avançar.');
      return true;
    }
    return false;
  };

  const goNext = () => {
    if (audioBlocksAdvance()) return;
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
    if (audioBlocksAdvance()) return;
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

  // Áudio a gravar junto com a entrevista: o atual; ou, se o áudio salvo não pôde
  // ser lido ao reabrir, "manter o que já está no aparelho" (undefined).
  const audioForSave = () => (audioBase64 ? audioBase64 : (keepStoredAudioRef.current ? undefined : null));

  const saveAsDraft = async (andExit = false) => {
    const data = buildInterviewData();
    try {
      const draftId = await saveDraft({ ...data, _draftId: currentDraftId, _audioBase64: audioForSave(), status: "em_andamento" });
      setCurrentDraftId(draftId);
      if (andExit) resetInterview(); else alert("Rascunho salvo no celular.");
    } catch (e) {
      alert(`${e.message}${andExit ? "\n\nA entrevista continua aberta." : ""}`);
    }
  };

  const submit = async () => {
    // Pesquisa auditável: não conclui sem áudio.
    if (selectedSurvey?.require_audio && !audioBase64) {
      alert("Esta pesquisa exige a gravação de áudio para auditoria. Grave o áudio antes de concluir a entrevista.");
      return;
    }
    // Cotas: avisa (sem bloquear) quando o entrevistado cai em um grupo já
    // completo. A entrevista já foi feita — descartá-la seria pior do que
    // registrar um excedente, que a ponderação do relatório corrige.
    const full = quotasExceededBy(quotaFor(selectedSurvey), answers);
    if (full.length > 0) {
      const lista = full.map(f => `• ${f.stratum}: ${f.group} (${f.done}/${f.quota})`).join("\n");
      if (!confirm(
        `A cota destes grupos já está completa:\n\n${lista}\n\n`
        + "Registrar mais entrevistas aqui desequilibra a amostra e aumenta a margem de erro. "
        + "Deseja concluir mesmo assim?"
      )) return;
    }
    setSaving(true);
    submittingRef.current = true;
    if (persistTimer.current) { clearTimeout(persistTimer.current); persistTimer.current = null; }
    const interviewData = buildInterviewData();

    // 1) SALVA NO APARELHO PRIMEIRO, já como concluída. Só depois tenta enviar.
    //    Assim, se o sinal cair, a requisição travar ou o app for fechado no meio
    //    do envio, a entrevista continua no celular e entra na fila de envio.
    let draftId = currentDraftId || newFieldDraftId();
    let savedLocally = true;
    try {
      draftId = await saveDraft({ ...interviewData, _draftId: draftId, _audioBase64: audioForSave(), status: "concluida" });
    } catch (e) {
      savedLocally = false;
      draftId = e.draftId || draftId;
    }
    setCurrentDraftId(draftId);

    // 2) Tenta enviar. A tela espera no máximo 25 s; se demorar mais, o envio
    //    continua em segundo plano e, se falhar, a fila tenta de novo depois.
    let outcome = savedLocally ? "queued" : "unsaved";
    let errorMessage = null;
    let audioFailed = false;
    if (navigator.onLine) {
      const sending = sendDraft(draftId);
      sending.catch(() => { /* permanece na fila; a sincronização tenta de novo */ });
      try {
        const res = await Promise.race([
          sending,
          new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error("ui-timeout"), { uiTimeout: true })), 25_000)),
        ]);
        outcome = "sent";
        audioFailed = !!res?.audio_failed;
      } catch (e) {
        if (!e?.uiTimeout && !e?.timeout) errorMessage = e?.message || null;
      }
    }

    setDoneInfo({ outcome, errorMessage, audioFailed });
    setSaving(false);
    setStep("done");
  };

  const loadDraft = async (draft) => {
    const survey = allSurveys.find(s => s.id === draft.survey_id);
    if (!survey) { alert("Pesquisa do rascunho não encontrada. Baixe-a para uso offline."); return; }
    // O áudio é lido do aparelho antes de abrir: se o autosave rodasse sem ele,
    // gravaria "sem áudio" por cima da gravação salva.
    let storedAudio = null;
    keepStoredAudioRef.current = false;
    if (draft._hasAudio) {
      try {
        storedAudio = await loadDraftAudio(draft._draftId);
      } catch {
        if (!confirm("Não foi possível ler o áudio desta entrevista agora. Abrir mesmo assim? O áudio salvo NÃO será apagado.")) return;
        keepStoredAudioRef.current = true;
      }
    }
    submittingRef.current = false;
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
    setAudioBase64(storedAudio);
    setAudioUrl(storedAudio);
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
    ? { data: buildInterviewData(), draftId: currentDraftId, audio: audioForSave() }
    : null;
  stepRef.current = step;

  // Grava o estado atual da entrevista no aparelho como "em andamento".
  // `override.audio` grava um áudio recém-finalizado antes do próximo render.
  const persistNow = useCallback(async (override = {}) => {
    const snap = autoSaveRef.current;
    if (!snap || submittingRef.current) return false;
    if (stepRef.current !== "interview" && stepRef.current !== "review") return false;
    const audio = "audio" in override ? override.audio : snap.audio;
    const hasContent = (snap.data.answers || []).some(a => a.answer) || snap.data.notes || audio;
    if (!hasContent) return false;
    let draftId = snap.draftId;
    if (!draftId) {
      draftId = newFieldDraftId();
      snap.draftId = draftId;
      setCurrentDraftId(draftId);
    }
    try {
      await saveDraft({ ...snap.data, _draftId: draftId, _audioBase64: audio, status: "em_andamento" });
      return true;
    } catch {
      return false; // o aviso aparece pelo saveError do hook
    }
  }, [saveDraft]);

  // 1) A cada mudança (resposta, observação, localização): grava 1,5 s depois
  //    da última alteração. Vale também na tela de revisão.
  useEffect(() => {
    if (step !== "interview" && step !== "review") return;
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => { persistTimer.current = null; persistNow(); }, 1500);
    return () => { if (persistTimer.current) clearTimeout(persistTimer.current); };
  }, [answers, notes, location, step, persistNow]);

  // 2) Rede de segurança: a cada 30 s em entrevista e revisão.
  useEffect(() => {
    if (step !== "interview" && step !== "review") return;
    const timer = setInterval(async () => {
      if (await persistNow()) {
        setAutoSaveMsg("Salvo automaticamente");
        setTimeout(() => setAutoSaveMsg(""), 2000);
      }
    }, 30000);
    autoSaveTimer.current = timer;
    return () => clearInterval(timer);
  }, [step, persistNow]);

  // 3) App indo para segundo plano (ligação, WhatsApp, câmera, tela bloqueada)
  //    ou sendo fechado: grava NA HORA. O iPhone encerra apps em segundo plano
  //    sem aviso, e o Android faz o mesmo quando falta memória.
  useEffect(() => {
    const onHide = () => {
      if (stepRef.current !== "interview" && stepRef.current !== "review") return;
      // Gravação em curso: finaliza para não perder o áudio (o iPhone corta o
      // microfone em segundo plano). O onstop grava o trecho no aparelho.
      if (mediaRecorder.current && mediaRecorder.current.state === "recording") {
        recordingInterruptedRef.current = true;
        try { mediaRecorder.current.stop(); } catch { /* já parado */ }
        setRecording(false);
      }
      persistNow();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        onHide();
      } else if (recordingInterruptedRef.current) {
        recordingInterruptedRef.current = false;
        alert("A gravação de áudio foi encerrada quando o app saiu da tela. O trecho gravado foi salvo; se precisar, grave o restante.");
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
    };
  }, [persistNow]);

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
    submittingRef.current = false;
    keepStoredAudioRef.current = false;
    setDoneInfo(null);
    if (autoSaveTimer.current) clearInterval(autoSaveTimer.current);
    if (persistTimer.current) { clearTimeout(persistTimer.current); persistTimer.current = null; }
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
    const outcome = doneInfo?.outcome || "queued";
    const view = {
      sent: {
        bg: "from-green-50 to-emerald-50", icon: <CheckCircle2 className="w-16 h-16 text-green-500" />,
        title: "Entrevista Enviada!",
        text: doneInfo?.audioFailed
          ? "Registrada no servidor, mas o áudio não pôde ser salvo (conexão ou tamanho da gravação)."
          : "Registrada com sucesso no servidor.",
      },
      queued: {
        bg: "from-blue-50 to-indigo-50", icon: <CheckCircle2 className="w-16 h-16 text-blue-500" />,
        title: "Salva no celular",
        text: doneInfo?.errorMessage
          ? `Ainda não foi enviada: ${doneInfo.errorMessage}. Ela está guardada no celular e aparece em "Rascunhos Salvos".`
          : "Ainda não foi enviada (sem conexão ou conexão lenta). Está guardada no celular e será enviada automaticamente quando houver internet — com o app aberto.",
      },
      unsaved: {
        bg: "from-red-50 to-orange-50", icon: <AlertCircle className="w-16 h-16 text-red-500" />,
        title: "ATENÇÃO: não foi salva no celular",
        text: "O celular não permitiu gravar esta entrevista e ela ainda não foi enviada. NÃO feche o app: conecte-se à internet e toque em Sincronizar. Se o problema continuar, libere espaço no celular.",
      },
    }[outcome];
    return (
      <div className={`min-h-screen bg-gradient-to-br ${view.bg} flex flex-col items-center justify-center p-6 gap-4`}>
        {view.icon}
        <h2 className={`text-2xl font-bold text-center ${outcome === "unsaved" ? "text-red-700" : "text-gray-900"}`}>{view.title}</h2>
        <p className={`text-center text-sm max-w-sm ${outcome === "unsaved" ? "text-red-700 font-medium" : "text-gray-500"}`}>
          {view.text}
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
    const quotaWarnings = quotasExceededBy(quotaFor(selectedSurvey), answers);
    return (
      <div className="min-h-screen bg-gray-50 p-4 space-y-4 pb-36">
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-1">Revisão Final</h2>
          <p className="text-sm text-gray-500">{selectedSurvey?.title}</p>
        </div>

        {saveError && (
          <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-4 text-sm text-red-800 font-medium flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            O celular não está salvando esta entrevista. Não feche o app; ao concluir, ela será enviada direto se houver internet.
          </div>
        )}

        {/* Avisa antes de concluir: o entrevistado caiu em grupo já completo. */}
        {quotaWarnings.length > 0 && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-amber-900 flex items-center gap-2 mb-1.5">
              <AlertCircle className="w-4 h-4 shrink-0" /> Cota já completa
            </h3>
            <ul className="text-xs text-amber-800 space-y-0.5 mb-2">
              {quotaWarnings.map(w => (
                <li key={`${w.stratum}-${w.group}`}>{w.stratum}: <strong>{w.group}</strong> ({w.done}/{w.quota})</li>
              ))}
            </ul>
            <p className="text-[11px] text-amber-700 leading-snug">
              Você ainda pode concluir, mas registrar excedentes aqui desequilibra a amostra e aumenta a margem de erro
              da pesquisa. Priorize os grupos que ainda faltam.
            </p>
          </div>
        )}
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
          <h3 className="font-semibold text-gray-700 text-sm flex items-center gap-2">
            <Mic className="w-4 h-4 text-purple-500" /> Áudio
            {selectedSurvey?.require_audio && <Badge className="bg-purple-100 text-purple-700 text-[10px]">Obrigatório</Badge>}
          </h3>
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
              <p className={`text-xs rounded-lg px-3 py-2 ${selectedSurvey?.require_audio ? "text-red-700 bg-red-50" : "text-orange-600 bg-orange-50"}`}>
                {selectedSurvey?.require_audio
                  ? "Esta pesquisa exige áudio: grave para poder concluir a entrevista."
                  : "Nenhum áudio gravado. Você pode gravar durante as questões ou aqui."}
              </p>
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
              {/* Áudio opcional: botão compacto no topo. Quando obrigatório, há
                  uma barra de gravação destacada logo abaixo. */}
              {!selectedSurvey?.require_audio && (
                <button
                  onClick={recording ? stopRecording : startRecording}
                  className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full transition-all ${recording ? "bg-red-500 text-white animate-pulse" : "bg-blue-500 text-blue-100 hover:text-white"}`}
                >
                  {recording ? <><MicOff className="w-3 h-3" /> Parar</> : <><Mic className="w-3 h-3" /> {audioUrl ? "Regravando" : "Gravar"}</>}
                </button>
              )}
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
          {selectedSurvey?.require_audio && (
            <button
              onClick={recording ? stopRecording : startRecording}
              className={`mt-3 w-full flex items-center justify-center gap-2 rounded-xl py-3 text-base font-semibold transition-all ${
                recording
                  ? "bg-red-500 text-white animate-pulse"
                  : audioBase64
                    ? "bg-green-500 text-white"
                    : "bg-amber-400 text-amber-950"
              }`}
            >
              {recording
                ? <><MicOff className="w-5 h-5" /> Parar gravação</>
                : audioBase64
                  ? <><Mic className="w-5 h-5" /> Áudio gravado — toque para regravar</>
                  : <><Mic className="w-5 h-5" /> Gravar áudio (obrigatório)</>}
            </button>
          )}
          {saveError && (
            <div className="mt-2 bg-red-600 rounded-lg px-3 py-2 text-xs text-white font-medium flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              O celular não está salvando esta entrevista. Não feche o app.
            </div>
          )}
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
            orderSeed={clientUuidRef.current}
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
        {storageError && (
          <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-4 mt-4">
            <p className="text-sm font-semibold text-red-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" /> Não foi possível ler as entrevistas salvas
            </p>
            <p className="text-xs text-red-700 mt-1 leading-snug">{storageError}</p>
            <div className="flex gap-2 mt-3">
              <Button size="sm" variant="outline" className="border-red-300 text-red-700" onClick={retryHydrate}>Tentar de novo</Button>
              <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={() => window.location.reload()}>Recarregar o app</Button>
            </div>
          </div>
        )}
        {saveError && !storageError && (
          <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-4 mt-4">
            <p className="text-sm font-semibold text-red-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" /> O celular não está salvando
            </p>
            <p className="text-xs text-red-700 mt-1 leading-snug">{saveError} Se continuar, libere espaço no celular.</p>
          </div>
        )}
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

        <InstallApp className="mb-1" pendingCount={drafts.length} />

        <SyncStatusBar
          isOnline={isOnline} syncing={syncing} drafts={drafts}
          lastSynced={lastSynced} onSync={syncDrafts}
          syncLogs={syncLogs} onClearLogs={clearLogs}
        />

        <div id="drafts-section">
          <DraftsList drafts={drafts} onEdit={loadDraft} onDelete={deleteDraft} onRetry={retryDraft} syncing={syncing} />
        </div>

        {/* Cotas: o entrevistador vê, antes de abordar alguém, quais grupos
            ainda faltam na pesquisa. */}
        {allSurveys.map(s => {
          const progress = quotaFor(s);
          if (!progress) return null;
          return (
            <QuotaPanel
              key={`quota-${s.id}`}
              progress={progress}
              title={allSurveys.length > 1 ? s.title : "Cotas da pesquisa"}
              compact={allSurveys.length > 1}
            />
          );
        })}

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
            setCurrentDraftId(newFieldDraftId()); clientUuidRef.current = crypto.randomUUID();
            submittingRef.current = false; keepStoredAudioRef.current = false;
            setStep("interview"); getLocation(true);
          }}
        />
      </div>
    </div>
  );
}