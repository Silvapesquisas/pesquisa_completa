import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MapPin, Mic, MicOff, CheckCircle2, ChevronRight, ChevronLeft, Loader2, Save, List, KeyRound, LogOut, BookOpen } from "lucide-react";
import { useOfflineSync } from "@/components/fieldapp/useOfflineSync";
import SyncStatusBar from "@/components/fieldapp/SyncStatusBar";
import SyncErrorBanner from "@/components/fieldapp/SyncErrorBanner";
import DraftsList from "@/components/fieldapp/DraftsList";
import OfflineSurveys from "@/components/fieldapp/OfflineSurveys";
import QuestionIndex from "@/components/fieldapp/QuestionIndex";
import OnboardingTutorial from "@/components/fieldapp/OnboardingTutorial";

const FIELD_USER_KEY = "fieldapp_user";

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
    return (
      <div className="space-y-2">
        {(question.options || []).map(opt => (
          <button key={opt} onClick={() => onChange(opt)}
            className={`w-full text-left py-3 px-4 rounded-xl border-2 text-sm transition-all ${value === opt ? "border-blue-600 bg-blue-50 text-blue-700 font-medium" : "border-gray-200 text-gray-600"}`}>
            {opt}
          </button>
        ))}
      </div>
    );
  }
  if (type === "multipla_escolha") {
    const selected = value ? value.split("|") : [];
    const toggle = (opt) => {
      const updated = selected.includes(opt) ? selected.filter(o => o !== opt) : [...selected, opt];
      onChange(updated.join("|"));
    };
    return (
      <div className="space-y-2">
        {(question.options || []).map(opt => (
          <button key={opt} onClick={() => toggle(opt)}
            className={`w-full text-left py-3 px-4 rounded-xl border-2 text-sm transition-all ${selected.includes(opt) ? "border-blue-600 bg-blue-50 text-blue-700 font-medium" : "border-gray-200 text-gray-600"}`}>
            <span className="mr-2">{selected.includes(opt) ? "☑" : "☐"}</span>{opt}
          </button>
        ))}
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
    const results = await base44.entities.FieldUser.filter({ access_code: code, active: true });
    if (results.length === 0) {
      setError("Código inválido ou entrevistador inativo. Verifique com seu supervisor.");
      setLoading(false);
      return;
    }
    const fieldUser = results[0];
    // Persist in localStorage for offline access
    localStorage.setItem(FIELD_USER_KEY, JSON.stringify(fieldUser));
    onLogin(fieldUser);
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
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState(null);
  const [showIndex, setShowIndex] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [autoSaveMsg, setAutoSaveMsg] = useState("");
  const [showTutorial, setShowTutorial] = useState(false);
  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);
  const startTime = useRef(null);
  const autoSaveTimer = useRef(null);

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

  // Load surveys when user is set and online
  useEffect(() => {
    if (!fieldUser) return;
    if (isOnline) {
      // Load surveys assigned to this field user (or all active if no assignment)
      const assigned = fieldUser.assigned_survey_ids || [];
      if (assigned.length > 0) {
        Promise.all(assigned.map(id => base44.entities.Survey.filter({ id, status: "ativa" })))
          .then(results => setOnlineSurveys(results.flat()))
          .catch(() => {});
      } else {
        base44.entities.Survey.filter({ status: "ativa", company_id: fieldUser.company_id })
          .then(setOnlineSurveys)
          .catch(() => {});
      }
    }
  }, [fieldUser, isOnline]);

  const allSurveys = [
    ...offlineSurveys,
    ...onlineSurveys.filter(s => !offlineSurveys.find(o => o.id === s.id)),
  ];

  const handleLogin = (fu) => setFieldUser(fu);

  const handleLogout = () => {
    localStorage.removeItem(FIELD_USER_KEY);
    setFieldUser(null);
    setStep("select");
    setSelectedSurvey(null);
    setAnswers({});
  };

  const getLocation = (silent = false) => {
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => { setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocationLoading(false); },
      () => {
        setLocationLoading(false);
        if (!silent) alert("Não foi possível obter localização. Verifique as permissões do navegador/dispositivo.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder.current = new MediaRecorder(stream);
    audioChunks.current = [];
    startTime.current = Date.now();
    mediaRecorder.current.ondataavailable = e => audioChunks.current.push(e.data);
    mediaRecorder.current.onstop = async () => {
      const blob = new Blob(audioChunks.current, { type: "audio/webm" });
      const duration = (Date.now() - startTime.current) / 1000;
      setAudioDuration(duration);
      const file = new File([blob], "audio.webm", { type: "audio/webm" });
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setAudioUrl(file_url);
      stream.getTracks().forEach(t => t.stop());
    };
    mediaRecorder.current.start();
    setRecording(true);
  };

  const stopRecording = () => { mediaRecorder.current?.stop(); setRecording(false); };

  const visibleQuestions = (selectedSurvey?.questions || []).filter(q => {
    if (!q.depends_on_question_id) return true;
    const depAnswer = answers[q.depends_on_question_id];
    if (!depAnswer) return false;
    return !q.depends_on_answer || depAnswer === q.depends_on_answer || depAnswer.split("|").includes(q.depends_on_answer);
  });

  const currentQuestion = visibleQuestions[currentIndex];

  const goNext = () => {
    if (currentQuestion?.required && !answers[currentQuestion.id]) { alert("Esta questão é obrigatória."); return; }
    if (currentIndex < visibleQuestions.length - 1) setCurrentIndex(i => i + 1);
    else setStep("review");
  };

  const skipQuestion = () => {
    if (currentQuestion?.required) { alert("Esta questão é obrigatória e não pode ser pulada."); return; }
    if (currentIndex < visibleQuestions.length - 1) setCurrentIndex(i => i + 1);
    else setStep("review");
  };

  const buildInterviewData = () => {
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
      survey_id: selectedSurvey.id,
      survey_title: selectedSurvey.title,
      field_user_id: fieldUser?.id,
      interviewer_name: fieldUser?.name || "Entrevistador",
      company_id: fieldUser?.company_id,
      status: "concluida",
      answers: formattedAnswers,
      latitude: location?.lat || null,
      longitude: location?.lng || null,
      audio_url: audioUrl,
      audio_duration: audioDuration,
      notes,
      completed_at: new Date().toISOString(),
      edit_history: [],
    };
  };

  const saveAsDraft = (andExit = false) => {
    const data = buildInterviewData();
    const draftId = saveDraft({ ...data, _draftId: currentDraftId, status: "em_andamento" });
    setCurrentDraftId(draftId);
    if (andExit) { resetInterview(); } else { alert("Rascunho salvo!"); }
  };

  const submit = async () => {
    setSaving(true);
    const interviewData = buildInterviewData();
    if (!isOnline) {
      saveDraft({ ...interviewData, _draftId: currentDraftId });
      setSaving(false);
      setStep("done");
      return;
    }
    await base44.entities.Interview.create(interviewData);
    if (currentDraftId) removeDraft(currentDraftId);
    setSaving(false);
    setStep("done");
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
    setCurrentDraftId(draft._draftId);
    setCurrentIndex(0);
    setStep("interview");
  };

  const deleteDraft = (draftId) => {
    if (confirm("Excluir este rascunho?")) removeDraft(draftId);
  };

  useEffect(() => {
    if (step !== "interview") {
      if (autoSaveTimer.current) clearInterval(autoSaveTimer.current);
      return;
    }
    autoSaveTimer.current = setInterval(() => {
      if (selectedSurvey) {
        const data = buildInterviewData();
        saveDraft({ ...data, _draftId: currentDraftId, status: "em_andamento" });
        setAutoSaveMsg("Salvo automaticamente");
        setTimeout(() => setAutoSaveMsg(""), 2000);
      }
    }, 30000);
    return () => clearInterval(autoSaveTimer.current);
  }, [step, answers, currentDraftId, selectedSurvey]);

  const resetInterview = () => {
    setStep("select"); setSelectedSurvey(null); setAnswers({});
    setCurrentIndex(0); setLocation(null); setAudioUrl(null);
    setNotes(""); setCurrentDraftId(null); setShowIndex(false);
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
              <p className="text-sm text-green-600 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
              </p>
              <button onClick={() => getLocation()} className="text-xs text-gray-400 hover:text-blue-600 underline">Atualizar</button>
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
          <h3 className="font-semibold text-gray-700 text-sm">Áudio</h3>
          {audioUrl ? <audio controls src={audioUrl} className="w-full" /> : (
            <Button variant="outline" size="sm" onClick={recording ? stopRecording : startRecording} className={`w-full ${recording ? "border-red-300 text-red-600" : ""}`}>
              {recording ? <><MicOff className="w-4 h-4 mr-2" /> Parar Gravação</> : <><Mic className="w-4 h-4 mr-2" /> Gravar Áudio</>}
            </Button>
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
            <Button variant="outline" className="flex-1" onClick={saveAsDraft}>
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
              {autoSaveMsg && <span className="text-xs text-blue-200 animate-pulse">{autoSaveMsg}</span>}
              {currentQuestion.required
                ? <Badge className="bg-blue-800 text-white text-xs">Obrigatória</Badge>
                : <Badge className="bg-blue-400/50 text-white text-xs">Opcional</Badge>}
            </div>
          </div>
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
          <div className="flex items-center gap-3">
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
          onSelect={(s) => { setSelectedSurvey(s); setAnswers({}); setCurrentIndex(0); setLocation(null); setStep("interview"); getLocation(true); }}
        />
      </div>
    </div>
  );
}