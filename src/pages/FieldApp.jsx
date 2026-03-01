import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Mic, MicOff, CheckCircle2, ChevronRight, ChevronLeft, ClipboardList, Loader2 } from "lucide-react";
import { v4 as uuidv4 } from "https://cdn.jsdelivr.net/npm/uuid@9/+esm";

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
  const [surveys, setSurveys] = useState([]);
  const [selectedSurvey, setSelectedSurvey] = useState(null);
  const [answers, setAnswers] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [step, setStep] = useState("select"); // select | interview | done
  const [location, setLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);
  const startTime = useRef(null);

  useEffect(() => {
    base44.auth.me().then(u => setUser(u));
    base44.entities.Survey.filter({ status: "ativa" }).then(setSurveys);
  }, []);

  const getLocation = () => {
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationLoading(false);
      },
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

  const stopRecording = () => {
    mediaRecorder.current?.stop();
    setRecording(false);
  };

  const visibleQuestions = (selectedSurvey?.questions || []).filter(q => {
    if (!q.depends_on_question_id) return true;
    const depAnswer = answers[q.depends_on_question_id];
    if (!depAnswer) return false;
    return !q.depends_on_answer || depAnswer === q.depends_on_answer || depAnswer.split("|").includes(q.depends_on_answer);
  });

  const currentQuestion = visibleQuestions[currentIndex];

  const goNext = () => {
    if (currentQuestion?.required && !answers[currentQuestion.id]) {
      alert("Esta questão é obrigatória.");
      return;
    }
    if (currentIndex < visibleQuestions.length - 1) setCurrentIndex(i => i + 1);
    else setStep("review");
  };

  const submit = async () => {
    setSaving(true);
    const formattedAnswers = visibleQuestions.map(q => {
      const raw = answers[q.id] || "";
      const isMulti = q.type === "multipla_escolha";
      return {
        question_id: q.id,
        question_text: q.text,
        question_type: q.type,
        answer: isMulti ? raw.split("|").join(", ") : raw,
        answer_array: isMulti ? raw.split("|").filter(Boolean) : [],
      };
    });

    await base44.entities.Interview.create({
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
    });
    setSaving(false);
    setStep("done");
  };

  if (step === "done") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center p-6">
        <div className="text-center">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Entrevista Enviada!</h2>
          <p className="text-gray-500 mb-6">Os dados foram registrados com sucesso.</p>
          <Button onClick={() => { setStep("select"); setSelectedSurvey(null); setAnswers({}); setCurrentIndex(0); setLocation(null); setAudioUrl(null); setNotes(""); }}
            className="bg-green-600 hover:bg-green-700">
            Nova Entrevista
          </Button>
        </div>
      </div>
    );
  }

  if (step === "review") {
    return (
      <div className="min-h-screen bg-gray-50 p-4 space-y-4 pb-24">
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
          {audioUrl ? (
            <audio controls src={audioUrl} className="w-full" />
          ) : (
            <Button variant="outline" size="sm" onClick={recording ? stopRecording : startRecording} className={`w-full ${recording ? "border-red-300 text-red-600" : ""}`}>
              {recording ? <><MicOff className="w-4 h-4 mr-2" /> Parar Gravação</> : <><Mic className="w-4 h-4 mr-2" /> Gravar Áudio</>}
            </Button>
          )}
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="font-semibold text-gray-700 text-sm mb-2">Observações</h3>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observações adicionais..." rows={3} />
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => { setStep("interview"); setCurrentIndex(visibleQuestions.length - 1); }}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
          <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            {saving ? "Enviando..." : "Enviar Entrevista"}
          </Button>
        </div>
      </div>
    );
  }

  if (step === "interview" && currentQuestion) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <div className="bg-blue-600 text-white p-5">
          <p className="text-xs opacity-75">{selectedSurvey?.title}</p>
          <div className="flex items-center justify-between mt-2">
            <span className="text-sm font-medium">Questão {currentIndex + 1} de {visibleQuestions.length}</span>
            {currentQuestion.required && <Badge className="bg-blue-800 text-white text-xs">Obrigatória</Badge>}
          </div>
          <div className="w-full bg-blue-500 rounded-full h-1.5 mt-3">
            <div className="bg-white h-1.5 rounded-full transition-all" style={{ width: `${((currentIndex + 1) / visibleQuestions.length) * 100}%` }} />
          </div>
        </div>

        <div className="flex-1 p-5 space-y-5">
          <p className="text-lg font-semibold text-gray-900 leading-snug">{currentQuestion.text}</p>
          <QuestionField
            question={currentQuestion}
            value={answers[currentQuestion.id]}
            onChange={val => setAnswers(a => ({ ...a, [currentQuestion.id]: val }))}
          />
        </div>

        <div className="bg-white border-t p-4 flex gap-3">
          {currentIndex > 0 && (
            <Button variant="outline" className="flex-1" onClick={() => setCurrentIndex(i => i - 1)}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
            </Button>
          )}
          <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={goNext}>
            {currentIndex < visibleQuestions.length - 1 ? <><ChevronRight className="w-4 h-4 mr-1" /> Próxima</> : "Revisar e Enviar"}
          </Button>
        </div>
      </div>
    );
  }

  // Select survey screen
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-5 space-y-5">
      <div className="pt-6">
        <h1 className="text-2xl font-bold text-gray-900">Pesquisas de Campo</h1>
        <p className="text-gray-500 text-sm mt-1">Olá, {user?.full_name || user?.email || "entrevistador"}</p>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Pesquisas Disponíveis</h2>
        {surveys.length === 0 && (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-8 text-center text-gray-400">
              <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhuma pesquisa ativa disponível.</p>
            </CardContent>
          </Card>
        )}
        {surveys.map(s => (
          <Card key={s.id} className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => { setSelectedSurvey(s); setAnswers({}); setCurrentIndex(0); setStep("interview"); }}>
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">{s.title}</h3>
                <p className="text-xs text-gray-400 mt-1 capitalize">{s.category} · {s.questions?.length || 0} questões</p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}