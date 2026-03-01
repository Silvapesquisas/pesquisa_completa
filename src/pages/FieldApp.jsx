import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MapPin, Mic, MicOff, CheckCircle2, ChevronRight, ChevronLeft, Loader2, Save, List } from "lucide-react";
import { useOfflineSync } from "@/components/fieldapp/useOfflineSync";
import SyncStatusBar from "@/components/fieldapp/SyncStatusBar";
import SyncErrorBanner from "@/components/fieldapp/SyncErrorBanner";
import DraftsList from "@/components/fieldapp/DraftsList";
import OfflineSurveys from "@/components/fieldapp/OfflineSurveys";
import QuestionIndex from "@/components/fieldapp/QuestionIndex";

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

export default function FieldApp() {
  const [user, setUser] = useState(null);
  const [onlineSurveys, setOnlineSurveys] = useState([]);
  const [selectedSurvey, setSelectedSurvey] = useState(null);
  const [answers, setAnswers] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [step, setStep] = useState("select"); // select | interview | review | done
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
  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);
  const startTime = useRef(null);

  const {
    isOnline, drafts, syncing, lastSynced, syncLogs,
    saveDraft, removeDraft, syncDrafts, clearLogs,
    offlineSurveys, downloadSurvey, removeSurveyOffline, totalStorageBytes,
  } = useOfflineSync();

  // Merged survey list: offline-downloaded first, then online
  const allSurveys = [
    ...offlineSurveys,
    ...onlineSurveys.filter(s => !offlineSurveys.find(o => o.id === s.id)),
  ];

  useEffect(() => {
    base44.auth.me().then(u => setUser(u)).catch(() => {});
    if (isOnline) {
      base44.entities.Survey.filter({ status: "ativa" }).then(setOnlineSurveys).catch(() => {});
    }
  }, [isOnline]);

  const getLocation = () => {
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => { setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocationLoading(false); },
      () => { alert("Não foi possível obter localização."); setLocationLoading(false); }
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
      interviewer_id: user?.id,
      interviewer_name: user?.full_name || user?.email,
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
    // Rebuild answers map from formatted answers
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

  const resetInterview = () => {
    setStep("select"); setSelectedSurvey(null); setAnswers({});
    setCurrentIndex(0); setLocation(null); setAudioUrl(null);
    setNotes(""); setCurrentDraftId(null); setShowIndex(false);
  };

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
        <div className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
          <h3 className="font-semibold text-gray-700 text-sm">Localização</h3>
          {location ? (
            <p className="text-sm text-green-600 flex items-center gap-2"><MapPin className="w-4 h-4" /> {location.lat.toFixed(5)}, {location.lng.toFixed(5)}</p>
          ) : (
            <Button variant="outline" size="sm" onClick={getLocation} disabled={locationLoading} className="w-full">
              {locationLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MapPin className="w-4 h-4 mr-2" />}
              Capturar Localização
            </Button>
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
            {currentQuestion.required && <Badge className="bg-blue-800 text-white text-xs">Obrigatória</Badge>}
          </div>
          <div className="w-full bg-blue-500 rounded-full h-1.5 mt-3">
            <div className="bg-white h-1.5 rounded-full transition-all" style={{ width: `${((currentIndex + 1) / visibleQuestions.length) * 100}%` }} />
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
          <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={goNext}>
            {currentIndex < visibleQuestions.length - 1 ? <><ChevronRight className="w-4 h-4 mr-1" /> Próxima</> : "Revisar e Enviar"}
          </Button>
        </div>
      </div>
    );
  }

  // ── SELECT ──
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-5 space-y-5 pb-10">
      <div className="pt-6">
        <h1 className="text-2xl font-bold text-gray-900">Pesquisas de Campo</h1>
        <p className="text-gray-500 text-sm mt-1">Olá, {user?.full_name || user?.email || "entrevistador"}</p>
      </div>

      <SyncStatusBar
        isOnline={isOnline} syncing={syncing} drafts={drafts}
        lastSynced={lastSynced} onSync={syncDrafts}
        syncLogs={syncLogs} onClearLogs={clearLogs}
      />

      <DraftsList
        drafts={drafts}
        onEdit={loadDraft}
        onDelete={deleteDraft}
      />

      <OfflineSurveys
        surveys={allSurveys}
        offlineSurveys={offlineSurveys}
        onDownload={downloadSurvey}
        onRemove={removeSurveyOffline}
        totalStorageBytes={totalStorageBytes}
        isOnline={isOnline}
        onSelect={(s) => { setSelectedSurvey(s); setAnswers({}); setCurrentIndex(0); setStep("interview"); }}
      />
    </div>
  );
}