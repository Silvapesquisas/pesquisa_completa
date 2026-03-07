import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, GripVertical, ChevronDown, ChevronUp, ArrowLeft, Save, Link as LinkIcon, BookMarked } from "lucide-react";
import { createPageUrl } from "@/utils";
import { useNavigate } from "react-router-dom";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { v4 as uuidv4 } from "https://cdn.jsdelivr.net/npm/uuid@9/+esm";
import QuestionBank from "@/components/surveys/QuestionBank";

const QUESTION_TYPES = [
  { value: "aberta", label: "Resposta Aberta" },
  { value: "multipla_escolha", label: "Múltipla Escolha" },
  { value: "unica_escolha", label: "Única Escolha" },
  { value: "escala", label: "Escala (1-5)" },
  { value: "sim_nao", label: "Sim / Não" },
];

function QuestionCard({ question, allQuestions, onChange, onDelete, onMoveUp, onMoveDown, index, total, dragHandleProps }) {
  const [expanded, setExpanded] = useState(true);
  const hasOptions = ["multipla_escolha", "unica_escolha"].includes(question.type);

  const addOption = () => onChange({ ...question, options: [...(question.options || []), ""] });
  const updateOption = (i, val) => {
    const opts = [...(question.options || [])];
    opts[i] = val;
    onChange({ ...question, options: opts });
  };
  const removeOption = (i) => onChange({ ...question, options: question.options.filter((_, idx) => idx !== i) });

  return (
    <Card className="border border-gray-200 shadow-sm">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center gap-2">
          <span {...dragHandleProps} className="cursor-grab active:cursor-grabbing"><GripVertical className="w-4 h-4 text-gray-300 shrink-0" /></span>
          <span className="text-xs font-medium text-gray-400 bg-gray-100 rounded px-2 py-0.5 shrink-0">Q{index + 1}</span>
          <span className="text-sm font-medium text-gray-700 flex-1 truncate">{question.text || "Nova questão"}</span>
          <div className="flex gap-1 shrink-0">
            <Button size="sm" variant="ghost" onClick={onMoveUp} disabled={index === 0}><ChevronUp className="w-3 h-3" /></Button>
            <Button size="sm" variant="ghost" onClick={onMoveDown} disabled={index === total - 1}><ChevronDown className="w-3 h-3" /></Button>
            <Button size="sm" variant="ghost" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
            <Button size="sm" variant="ghost" onClick={onDelete}><Trash2 className="w-4 h-4 text-red-400" /></Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="p-4 pt-2 space-y-4">
          <div>
            <Label className="text-xs text-gray-500 mb-1 block">Texto da questão</Label>
            <Input value={question.text || ""} onChange={e => onChange({ ...question, text: e.target.value })} placeholder="Digite a questão..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Tipo</Label>
              <Select value={question.type} onValueChange={val => onChange({ ...question, type: val, options: [] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {QUESTION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex items-center gap-2 mt-5">
                <Switch checked={question.required || false} onCheckedChange={val => onChange({ ...question, required: val })} />
                <Label className="text-xs text-gray-500">Obrigatória</Label>
              </div>
            </div>
          </div>

          {hasOptions && (
            <div>
              <Label className="text-xs text-gray-500 mb-2 block">Opções de resposta</Label>
              <div className="space-y-2">
                {(question.options || []).map((opt, i) => (
                  <div key={i} className="flex gap-2">
                    <Input value={opt} onChange={e => updateOption(i, e.target.value)} placeholder={`Opção ${i + 1}`} className="text-sm" />
                    <Button size="sm" variant="ghost" onClick={() => removeOption(i)}><Trash2 className="w-3 h-3 text-red-400" /></Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={addOption} className="w-full text-xs">
                  <Plus className="w-3 h-3 mr-1" /> Adicionar Opção
                </Button>
              </div>
            </div>
          )}

          {allQuestions.length > 1 && (
            <div>
              <Label className="text-xs text-gray-500 mb-1 flex items-center gap-1"><LinkIcon className="w-3 h-3" /> Condicional (depende de)</Label>
              <Select
                value={question.depends_on_question_id || "none"}
                onValueChange={val => onChange({ ...question, depends_on_question_id: val === "none" ? "" : val, depends_on_answer: "" })}
              >
                <SelectTrigger className="text-sm"><SelectValue placeholder="Nenhuma dependência" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem dependência</SelectItem>
                  {allQuestions.filter(q => q.id !== question.id && ["multipla_escolha", "unica_escolha", "sim_nao"].includes(q.type)).map(q => (
                    <SelectItem key={q.id} value={q.id}>{q.text || "Sem texto"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {question.depends_on_question_id && (() => {
                const dep = allQuestions.find(q => q.id === question.depends_on_question_id);
                const depOpts = dep?.type === "sim_nao" ? ["Sim", "Não"] : dep?.options || [];
                return depOpts.length > 0 ? (
                  <Select value={question.depends_on_answer || ""} onValueChange={val => onChange({ ...question, depends_on_answer: val })} className="mt-2">
                    <SelectTrigger className="text-sm mt-2"><SelectValue placeholder="Quando a resposta for..." /></SelectTrigger>
                    <SelectContent>
                      {depOpts.map((o, i) => <SelectItem key={i} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : null;
              })()}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default function SurveyBuilder() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const editId = params.get("id");

  const [survey, setSurvey] = useState({
    title: "", description: "", category: "urbano", status: "rascunho",
    questions: [], target_interviews: "", start_date: "", end_date: ""
  });
  const [saving, setSaving] = useState(false);
  const [showBank, setShowBank] = useState(false);

  useEffect(() => {
    if (editId) {
      base44.entities.Survey.list().then(list => {
        const found = list.find(s => s.id === editId);
        if (found) setSurvey({ ...found, questions: found.questions || [] });
      });
    }
  }, [editId]);

  const addQuestion = () => {
    const q = { id: uuidv4(), order: survey.questions.length, type: "aberta", text: "", required: false, options: [] };
    setSurvey(s => ({ ...s, questions: [...s.questions, q] }));
  };

  const updateQuestion = (id, updated) => {
    setSurvey(s => ({ ...s, questions: s.questions.map(q => q.id === id ? updated : q) }));
  };

  const deleteQuestion = (id) => {
    setSurvey(s => ({ ...s, questions: s.questions.filter(q => q.id !== id) }));
  };

  const moveQuestion = (index, dir) => {
    const qs = [...survey.questions];
    const target = index + dir;
    if (target < 0 || target >= qs.length) return;
    [qs[index], qs[target]] = [qs[target], qs[index]];
    setSurvey(s => ({ ...s, questions: qs.map((q, i) => ({ ...q, order: i })) }));
  };

  const onDragEnd = (result) => {
    if (!result.destination) return;
    const qs = [...survey.questions];
    const [moved] = qs.splice(result.source.index, 1);
    qs.splice(result.destination.index, 0, moved);
    setSurvey(s => ({ ...s, questions: qs.map((q, i) => ({ ...q, order: i })) }));
  };

  const save = async () => {
    if (!survey.title.trim()) { alert("Informe o título da pesquisa."); return; }
    setSaving(true);
    const payload = {
      ...survey,
      target_interviews: survey.target_interviews !== "" && survey.target_interviews != null
        ? Number(survey.target_interviews)
        : undefined,
      max_interviews_per_interviewer: survey.max_interviews_per_interviewer !== "" && survey.max_interviews_per_interviewer != null
        ? Number(survey.max_interviews_per_interviewer)
        : undefined,
    };
    if (editId) {
      await base44.entities.Survey.update(editId, payload);
    } else {
      await base44.entities.Survey.create(payload);
    }
    setSaving(false);
    navigate(createPageUrl("Surveys"));
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(createPageUrl("Surveys"))}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
        </Button>
        <h1 className="text-xl font-bold text-gray-900">{editId ? "Editar Pesquisa" : "Nova Pesquisa"}</h1>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-base">Informações Gerais</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs text-gray-500 mb-1 block">Título *</Label>
            <Input value={survey.title} onChange={e => setSurvey(s => ({ ...s, title: e.target.value }))} placeholder="Título da pesquisa" />
          </div>
          <div>
            <Label className="text-xs text-gray-500 mb-1 block">Descrição</Label>
            <Textarea value={survey.description || ""} onChange={e => setSurvey(s => ({ ...s, description: e.target.value }))} placeholder="Descreva o objetivo da pesquisa..." rows={3} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Meta total de entrevistas</Label>
              <Input
                type="number"
                min="0"
                value={survey.target_interviews || ""}
                onChange={e => setSurvey(s => ({ ...s, target_interviews: e.target.value }))}
                placeholder="Ex: 200"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Limite por entrevistador</Label>
              <Input
                type="number"
                min="0"
                value={survey.max_interviews_per_interviewer || ""}
                onChange={e => setSurvey(s => ({ ...s, max_interviews_per_interviewer: e.target.value }))}
                placeholder="Ex: 20"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Categoria</Label>
              <Select value={survey.category} onValueChange={val => setSurvey(s => ({ ...s, category: val }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["urbano", "rural", "ambiental", "social", "outro"].map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Status</Label>
              <Select value={survey.status} onValueChange={val => setSurvey(s => ({ ...s, status: val }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["rascunho", "ativa", "pausada", "encerrada"].map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Início</Label>
              <Input type="date" value={survey.start_date || ""} onChange={e => setSurvey(s => ({ ...s, start_date: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Encerramento</Label>
              <Input type="date" value={survey.end_date || ""} onChange={e => setSurvey(s => ({ ...s, end_date: e.target.value }))} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {showBank && (
          <QuestionBank
            surveyCategory={survey.category}
            onLoadQuestions={qs => setSurvey(s => ({ ...s, questions: [...s.questions, ...qs] }))}
            onClose={() => setShowBank(false)}
          />
        )}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">Questões <Badge variant="secondary">{survey.questions.length}</Badge></h2>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowBank(true)} className="border-blue-200 text-blue-600 hover:bg-blue-50">
              <BookMarked className="w-4 h-4 mr-1" /> Banco de Questões
            </Button>
            <Button size="sm" onClick={addQuestion} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-1" /> Adicionar Questão
            </Button>
          </div>
        </div>

        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="questions">
            {(provided) => (
              <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-3">
                {survey.questions.map((q, i) => (
                  <Draggable key={q.id} draggableId={q.id} index={i}>
                    {(prov) => (
                      <div ref={prov.innerRef} {...prov.draggableProps}>
                        <QuestionCard
                          question={q}
                          allQuestions={survey.questions}
                          onChange={updated => updateQuestion(q.id, updated)}
                          onDelete={() => deleteQuestion(q.id)}
                          onMoveUp={() => moveQuestion(i, -1)}
                          onMoveDown={() => moveQuestion(i, 1)}
                          index={i}
                          total={survey.questions.length}
                          dragHandleProps={prov.dragHandleProps}
                        />
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>

        {survey.questions.length === 0 && (
          <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
            <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhuma questão adicionada ainda.</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={addQuestion}>
              <Plus className="w-3 h-3 mr-1" /> Adicionar primeira questão
            </Button>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 pb-10">
        <Button variant="outline" onClick={() => navigate(createPageUrl("Surveys"))}>Cancelar</Button>
        <Button onClick={save} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
          <Save className="w-4 h-4 mr-2" /> {saving ? "Salvando..." : "Salvar Pesquisa"}
        </Button>
      </div>
    </div>
  );
}

function ClipboardList(props) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="16" x2="15" y2="16" />
    </svg>
  );
}