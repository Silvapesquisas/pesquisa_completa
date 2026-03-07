import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search, Filter, MapPin, Mic, FileText, ChevronDown, ChevronUp,
  Plus, Trash2, X, Eye, Download, Loader2
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const STATUS_LABELS = { concluida: "Concluída", em_andamento: "Em Andamento", revisao: "Revisão" };
const STATUS_COLORS = {
  concluida: "bg-green-100 text-green-800",
  em_andamento: "bg-yellow-100 text-yellow-800",
  revisao: "bg-blue-100 text-blue-800"
};

function InterviewDetailModal({ interview, surveys, onClose }) {
  if (!interview) return null;
  const survey = surveys.find(s => s.id === interview.survey_id);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">{interview.survey_title || "Entrevista"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">Entrevistador</p>
              <p className="font-medium">{interview.interviewer_name || "—"}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">Data de Conclusão</p>
              <p className="font-medium">{interview.completed_at ? format(new Date(interview.completed_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—"}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">Status</p>
              <Badge className={STATUS_COLORS[interview.status]}>{STATUS_LABELS[interview.status] || interview.status}</Badge>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">Localização</p>
              {interview.latitude && interview.longitude ? (
                <a
                  href={`https://maps.google.com/?q=${interview.latitude},${interview.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 text-xs flex items-center gap-1"
                >
                  <MapPin className="w-3 h-3" /> {interview.latitude.toFixed(4)}, {interview.longitude.toFixed(4)}
                </a>
              ) : <span className="text-gray-400 text-xs">Sem localização</span>}
            </div>
          </div>

          {interview.audio_url && (
            <div className="bg-purple-50 rounded-lg p-4">
              <p className="text-xs font-semibold text-purple-700 mb-2 flex items-center gap-1">
                <Mic className="w-3.5 h-3.5" /> Áudio da Entrevista
                {interview.audio_duration && <span className="font-normal ml-1">({Math.floor(interview.audio_duration / 60)}m {Math.round(interview.audio_duration % 60)}s)</span>}
              </p>
              <audio controls src={interview.audio_url} className="w-full" />
              <a href={interview.audio_url} download className="text-xs text-purple-600 hover:underline flex items-center gap-1 mt-2">
                <Download className="w-3 h-3" /> Baixar áudio
              </a>
            </div>
          )}

          {interview.notes && (
            <div className="bg-amber-50 rounded-lg p-3">
              <p className="text-xs font-semibold text-amber-700 mb-1">Observações</p>
              <p className="text-sm text-gray-700">{interview.notes}</p>
            </div>
          )}

          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">Respostas ({interview.answers?.length || 0})</p>
            <div className="space-y-3">
              {(interview.answers || []).map((a, idx) => (
                <div key={idx} className="border border-gray-100 rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-1">Q{idx + 1}: {a.question_text}</p>
                  <p className="text-sm text-gray-800 font-medium">
                    {a.answer_array?.length > 0 ? a.answer_array.join(", ") : a.answer || <span className="text-gray-300 italic">Sem resposta</span>}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AdvancedReports() {
  const [surveys, setSurveys] = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedInterview, setSelectedInterview] = useState(null);

  // Basic filters
  const [searchText, setSearchText] = useState("");
  const [filterSurvey, setFilterSurvey] = useState("todos");
  const [filterInterviewer, setFilterInterviewer] = useState("todos");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [filterGeo, setFilterGeo] = useState("todos");
  const [filterAudio, setFilterAudio] = useState("todos");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Cross-question filters
  const [crossFilters, setCrossFilters] = useState([]);
  const [selectedCrossSurvey, setSelectedCrossSurvey] = useState("todos");

  // Pagination
  const [page, setPage] = useState(1);
  const PER_PAGE = 20;

  useEffect(() => {
    setLoading(true);
    Promise.all([
      base44.entities.Survey.list(),
      base44.entities.Interview.list("-completed_at", 1000),
    ]).then(([sv, iv]) => {
      setSurveys(sv);
      setInterviews(iv);
      setLoading(false);
    });
  }, []);

  const interviewers = useMemo(() =>
    [...new Set(interviews.map(i => i.interviewer_name).filter(Boolean))].sort(),
    [interviews]
  );

  // Get questions for cross-filter survey
  const crossSurveyQuestions = useMemo(() => {
    if (selectedCrossSurvey === "todos") return [];
    const s = surveys.find(sv => sv.id === selectedCrossSurvey);
    return (s?.questions || []).filter(q =>
      ["multipla_escolha", "unica_escolha", "sim_nao"].includes(q.type)
    );
  }, [selectedCrossSurvey, surveys]);

  const addCrossFilter = () => {
    setCrossFilters(f => [...f, { question_id: "", answer: "" }]);
  };

  const removeCrossFilter = (idx) => {
    setCrossFilters(f => f.filter((_, i) => i !== idx));
  };

  const updateCrossFilter = (idx, key, val) => {
    setCrossFilters(f => f.map((cf, i) => i === idx ? { ...cf, [key]: val, ...(key === "question_id" ? { answer: "" } : {}) } : cf));
  };

  const getOptionsForQuestion = (qId) => {
    const q = crossSurveyQuestions.find(q => q.id === qId);
    if (!q) return [];
    if (q.type === "sim_nao") return ["Sim", "Não"];
    return q.options || [];
  };

  const filtered = useMemo(() => {
    return interviews.filter(i => {
      if (filterSurvey !== "todos" && i.survey_id !== filterSurvey) return false;
      if (filterInterviewer !== "todos" && i.interviewer_name !== filterInterviewer) return false;
      if (filterStatus !== "todos" && i.status !== filterStatus) return false;
      if (filterGeo === "com_geo" && !i.latitude) return false;
      if (filterGeo === "sem_geo" && i.latitude) return false;
      if (filterAudio === "com_audio" && !i.audio_url) return false;
      if (filterAudio === "sem_audio" && i.audio_url) return false;

      const dt = i.completed_at || i.created_date;
      if (dateFrom && dt && dt < dateFrom) return false;
      if (dateTo && dt && dt > dateTo + "T23:59:59") return false;

      if (searchText) {
        const lower = searchText.toLowerCase();
        const inTitle = (i.survey_title || "").toLowerCase().includes(lower);
        const inName = (i.interviewer_name || "").toLowerCase().includes(lower);
        const inAnswers = (i.answers || []).some(a =>
          (a.answer || "").toLowerCase().includes(lower) ||
          (a.question_text || "").toLowerCase().includes(lower)
        );
        if (!inTitle && !inName && !inAnswers) return false;
      }

      // Cross filters — all must match (AND logic)
      const validCross = crossFilters.filter(cf => cf.question_id && cf.answer);
      for (const cf of validCross) {
        const ans = (i.answers || []).find(a => a.question_id === cf.question_id);
        if (!ans) return false;
        const matches = ans.answer === cf.answer ||
          (ans.answer_array || []).includes(cf.answer) ||
          (ans.answer || "").includes(cf.answer);
        if (!matches) return false;
      }

      return true;
    });
  }, [interviews, filterSurvey, filterInterviewer, filterStatus, filterGeo, filterAudio, dateFrom, dateTo, searchText, crossFilters]);

  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);

  const crossMatchCount = useMemo(() => {
    const validCross = crossFilters.filter(cf => cf.question_id && cf.answer);
    if (validCross.length === 0) return null;
    return filtered.length;
  }, [filtered, crossFilters]);

  const resetFilters = () => {
    setSearchText(""); setFilterSurvey("todos"); setFilterInterviewer("todos");
    setFilterStatus("todos"); setFilterGeo("todos"); setFilterAudio("todos");
    setDateFrom(""); setDateTo(""); setCrossFilters([]); setPage(1);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Relatório Avançado</h1>
          <p className="text-gray-500 text-sm mt-1">Histórico completo de entrevistas com filtros combinados</p>
        </div>
        <Badge variant="secondary" className="text-sm px-3 py-1">
          {filtered.length} entrevistas
        </Badge>
      </div>

      {/* Basic Filters */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-5 space-y-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                value={searchText}
                onChange={e => { setSearchText(e.target.value); setPage(1); }}
                placeholder="Buscar por pesquisa, entrevistador ou resposta..."
                className="pl-9"
              />
            </div>
            <Button variant="outline" onClick={() => setShowAdvanced(v => !v)} className="shrink-0">
              <Filter className="w-4 h-4 mr-2" />
              Filtros
              {showAdvanced ? <ChevronUp className="w-3.5 h-3.5 ml-1" /> : <ChevronDown className="w-3.5 h-3.5 ml-1" />}
            </Button>
            <Button variant="ghost" onClick={resetFilters} className="shrink-0 text-gray-400 hover:text-gray-700">
              <X className="w-4 h-4" />
            </Button>
          </div>

          {showAdvanced && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 pt-2 border-t">
              <div>
                <Label className="text-xs text-gray-400 mb-1 block">Pesquisa</Label>
                <Select value={filterSurvey} onValueChange={v => { setFilterSurvey(v); setPage(1); }}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas</SelectItem>
                    {surveys.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-gray-400 mb-1 block">Entrevistador</Label>
                <Select value={filterInterviewer} onValueChange={v => { setFilterInterviewer(v); setPage(1); }}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {interviewers.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-gray-400 mb-1 block">Status</Label>
                <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setPage(1); }}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="concluida">Concluída</SelectItem>
                    <SelectItem value="em_andamento">Em Andamento</SelectItem>
                    <SelectItem value="revisao">Revisão</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-gray-400 mb-1 block">Localização</Label>
                <Select value={filterGeo} onValueChange={v => { setFilterGeo(v); setPage(1); }}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas</SelectItem>
                    <SelectItem value="com_geo">Com coordenadas</SelectItem>
                    <SelectItem value="sem_geo">Sem coordenadas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-gray-400 mb-1 block">Áudio</Label>
                <Select value={filterAudio} onValueChange={v => { setFilterAudio(v); setPage(1); }}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="com_audio">Com áudio</SelectItem>
                    <SelectItem value="sem_audio">Sem áudio</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-gray-400 mb-1 block">Data início</Label>
                <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} className="text-sm" />
              </div>
              <div>
                <Label className="text-xs text-gray-400 mb-1 block">Data fim</Label>
                <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} className="text-sm" />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cross-question filter */}
      <Card className="border-0 shadow-sm border-l-4 border-l-indigo-400">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-indigo-700 flex items-center gap-2">
              <Filter className="w-4 h-4" /> Filtro Cruzado por Respostas
            </CardTitle>
            {crossMatchCount !== null && (
              <Badge className="bg-indigo-100 text-indigo-800 text-xs">
                {crossMatchCount} resultado{crossMatchCount !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Combine respostas de diferentes questões para análise cruzada (lógica AND)
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-gray-400 mb-1 block">Pesquisa para filtro cruzado</Label>
            <Select value={selectedCrossSurvey} onValueChange={v => { setSelectedCrossSurvey(v); setCrossFilters([]); }}>
              <SelectTrigger className="text-sm max-w-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Selecione uma pesquisa...</SelectItem>
                {surveys.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {crossFilters.map((cf, idx) => (
            <div key={idx} className="flex items-center gap-2 bg-indigo-50 p-3 rounded-lg">
              <span className="text-xs text-indigo-500 font-medium w-6 shrink-0">#{idx + 1}</span>
              <Select value={cf.question_id} onValueChange={val => updateCrossFilter(idx, "question_id", val)}>
                <SelectTrigger className="text-xs flex-1"><SelectValue placeholder="Selecione a questão..." /></SelectTrigger>
                <SelectContent>
                  {crossSurveyQuestions.map(q => (
                    <SelectItem key={q.id} value={q.id}>{q.text?.slice(0, 60) || `Questão ${q.order + 1}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={cf.answer} onValueChange={val => updateCrossFilter(idx, "answer", val)} disabled={!cf.question_id}>
                <SelectTrigger className="text-xs flex-1"><SelectValue placeholder="Resposta..." /></SelectTrigger>
                <SelectContent>
                  {getOptionsForQuestion(cf.question_id).map(opt => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="ghost" onClick={() => removeCrossFilter(idx)}>
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
              </Button>
            </div>
          ))}

          {selectedCrossSurvey !== "todos" && (
            <Button size="sm" variant="outline" onClick={addCrossFilter} className="text-indigo-600 border-indigo-200 hover:bg-indigo-50">
              <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar condição
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Filtrado", value: filtered.length, color: "text-gray-900" },
          { label: "Com Coordenadas", value: filtered.filter(i => i.latitude).length, color: "text-blue-600" },
          { label: "Com Áudio", value: filtered.filter(i => i.audio_url).length, color: "text-purple-600" },
          { label: "Entrevistadores", value: new Set(filtered.map(i => i.interviewer_name)).size, color: "text-green-600" },
        ].map(s => (
          <Card key={s.label} className="border-0 shadow-sm">
            <CardContent className="p-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-400 mt-1">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : paged.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhuma entrevista encontrada com os filtros aplicados.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left text-xs text-gray-400 font-medium px-5 py-3">Pesquisa</th>
                    <th className="text-left text-xs text-gray-400 font-medium px-5 py-3">Entrevistador</th>
                    <th className="text-left text-xs text-gray-400 font-medium px-5 py-3">Data</th>
                    <th className="text-left text-xs text-gray-400 font-medium px-5 py-3">Status</th>
                    <th className="text-left text-xs text-gray-400 font-medium px-5 py-3">Extras</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paged.map(i => (
                    <tr key={i.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setSelectedInterview(i)}>
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-800 max-w-[180px] truncate">{i.survey_title || "—"}</p>
                      </td>
                      <td className="px-5 py-3 text-gray-600">{i.interviewer_name || "—"}</td>
                      <td className="px-5 py-3 text-gray-500 whitespace-nowrap">
                        {i.completed_at ? format(new Date(i.completed_at), "dd/MM/yy HH:mm", { locale: ptBR }) : "—"}
                      </td>
                      <td className="px-5 py-3">
                        <Badge className={`text-xs ${STATUS_COLORS[i.status] || "bg-gray-100 text-gray-600"}`}>
                          {STATUS_LABELS[i.status] || i.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          {i.latitude && <MapPin className="w-3.5 h-3.5 text-blue-400" title="Com GPS" />}
                          {i.audio_url && <Mic className="w-3.5 h-3.5 text-purple-400" title="Com Áudio" />}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                          <Eye className="w-3.5 h-3.5 text-gray-400" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Página {page} de {totalPages} ({filtered.length} entrevistas)</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Anterior</Button>
            <Button size="sm" variant="outline" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Próxima</Button>
          </div>
        </div>
      )}

      {selectedInterview && (
        <InterviewDetailModal
          interview={selectedInterview}
          surveys={surveys}
          onClose={() => setSelectedInterview(null)}
        />
      )}
    </div>
  );
}