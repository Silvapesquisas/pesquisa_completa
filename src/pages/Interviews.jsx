import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, MapPin, Mic, Eye, Edit, FileText, Plus, X, Filter, RotateCcw } from "lucide-react";
import { createPageUrl } from "@/utils";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import KmlExportDialog from "@/components/reports/KmlExportDialog";
import { normalizeText, questionChoices, answerValues, surveySequence } from "@/lib/surveyAnswers";

const PAGE = 100;              // cartões exibidos por vez
const MAX_LISTED_VALUES = 60;  // acima disso (resposta aberta), a busca é por texto
const NO_ANSWER = "__sem_resposta__";

// Coordenada válida (0,0 é "sem GPS").
const hasGeo = (i) => {
  if (i?.latitude == null || i?.longitude == null) return false;
  const lat = Number(i.latitude), lng = Number(i.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
};

// Texto pesquisável de uma entrevista: entrevistador, pesquisa, respostas e observações.
const searchableText = (i) => normalizeText([
  i.interviewer_name, i.survey_title, i.notes,
  ...(i.answers || []).flatMap((a) => [a.answer, ...(a.answer_array || [])]),
].filter(Boolean).join(" | "));

// Uma condição de resposta: pergunta + (valor exato | "sem resposta" | texto contido).
function matchesCondition(i, cond, choice) {
  if (!choice) return true;
  const values = answerValues(i, choice);
  if (cond.value === NO_ANSWER) return values.length === 0;
  if (cond.value) return values.some((v) => normalizeText(v) === normalizeText(cond.value));
  if (cond.text?.trim()) return values.some((v) => normalizeText(v).includes(normalizeText(cond.text)));
  return true; // pergunta escolhida sem valor ainda: não filtra
}

let condSeq = 0;
const newCondition = () => ({ id: ++condSeq, key: "", value: "", text: "" });

export default function Interviews() {
  const [interviews, setInterviews] = useState([]);
  const [surveys, setSurveys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterSurvey, setFilterSurvey] = useState("todos");
  const [filterInterviewer, setFilterInterviewer] = useState("todos");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [filterGeo, setFilterGeo] = useState("todas");
  const [filterAudio, setFilterAudio] = useState("todos");
  const [conditions, setConditions] = useState([]);
  const [shown, setShown] = useState(PAGE);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      const surveyIdParam = new URLSearchParams(window.location.search).get("survey_id");
      if (surveyIdParam) setFilterSurvey(surveyIdParam);
      const me = await base44.auth.me();
      const companyId = me?.company_id;
      const [iv, sv] = await Promise.all([
        companyId
          ? base44.entities.Interview.filter({ company_id: companyId }, "-created_date")
          : base44.entities.Interview.list("-created_date"),
        companyId
          ? base44.entities.Survey.filter({ company_id: companyId })
          : base44.entities.Survey.list(),
      ]);
      setInterviews(iv);
      setSurveys(sv);
      setLoading(false);
    };
    load().catch(() => setLoading(false));
  }, []);

  // Nº de cada entrevista dentro da sua pesquisa (o mesmo do KML).
  const numbers = useMemo(() => surveySequence(interviews), [interviews]);
  const searchIndex = useMemo(() => new Map(interviews.map((i) => [i.id, searchableText(i)])), [interviews]);

  const interviewers = useMemo(() => {
    const base = filterSurvey === "todos" ? interviews : interviews.filter((i) => i.survey_id === filterSurvey);
    return [...new Set(base.map((i) => (i.interviewer_name || "").trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [interviews, filterSurvey]);

  // Perguntas disponíveis: da pesquisa escolhida, ou de todas as que têm entrevistas.
  const scopeInterviews = useMemo(
    () => (filterSurvey === "todos" ? interviews : interviews.filter((i) => i.survey_id === filterSurvey)),
    [interviews, filterSurvey],
  );
  const choices = useMemo(() => {
    const ids = new Set(scopeInterviews.map((i) => i.survey_id));
    return questionChoices(surveys.filter((s) => ids.has(s.id)));
  }, [scopeInterviews, surveys]);
  const choiceByKey = useMemo(() => new Map(choices.map((c) => [c.key, c])), [choices]);

  // Respostas existentes de cada pergunta escolhida, com contagem.
  const valuesFor = (choice) => {
    const counts = new Map();
    let empty = 0;
    for (const i of scopeInterviews) {
      const vals = answerValues(i, choice);
      if (vals.length === 0) empty++;
      for (const v of vals) {
        const k = normalizeText(v);
        const cur = counts.get(k) || { label: v, count: 0 };
        cur.count++;
        counts.set(k, cur);
      }
    }
    const list = [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"));
    return { list, empty };
  };

  const filtered = useMemo(() => {
    const q = normalizeText(search);
    return interviews.filter((i) => {
      if (filterSurvey !== "todos" && i.survey_id !== filterSurvey) return false;
      if (filterInterviewer !== "todos" && (i.interviewer_name || "").trim() !== filterInterviewer) return false;
      if (filterStatus !== "todos" && i.status !== filterStatus) return false;
      if (filterGeo === "com" && !hasGeo(i)) return false;
      if (filterGeo === "sem" && hasGeo(i)) return false;
      if (filterAudio === "com" && !i.audio_url) return false;
      if (filterAudio === "sem" && i.audio_url) return false;
      if (q && !searchIndex.get(i.id)?.includes(q)) return false;
      for (const c of conditions) if (!matchesCondition(i, c, choiceByKey.get(c.key))) return false;
      return true;
    });
  }, [interviews, search, filterSurvey, filterInterviewer, filterStatus, filterGeo, filterAudio, conditions, choiceByKey, searchIndex]);

  // Novo filtro volta a mostrar do começo da lista.
  useEffect(() => { setShown(PAGE); }, [search, filterSurvey, filterInterviewer, filterStatus, filterGeo, filterAudio, conditions]);

  const activeFilters = [search, filterSurvey !== "todos", filterInterviewer !== "todos", filterStatus !== "todos",
    filterGeo !== "todas", filterAudio !== "todos", conditions.some((c) => c.key && (c.value || c.text?.trim()))]
    .filter(Boolean).length;
  const clearAll = () => {
    setSearch(""); setFilterSurvey("todos"); setFilterInterviewer("todos"); setFilterStatus("todos");
    setFilterGeo("todas"); setFilterAudio("todos"); setConditions([]);
  };
  const updateCondition = (id, patch) => setConditions((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const withGeo = filtered.filter(hasGeo).length;
  const withAudio = filtered.filter((i) => i.audio_url).length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Entrevistas</h1>
          <p className="text-gray-500 text-sm mt-1">
            {filtered.length} entrevista(s){activeFilters > 0 && ` de ${interviews.length}`}
            <span className="text-gray-400"> · {withGeo} com GPS · {withAudio} com áudio</span>
          </p>
        </div>
        <div className="flex gap-2">
          <KmlExportDialog
            interviews={filtered}
            allInterviews={interviews}
            surveys={surveys}
            docName={surveys.find(sv => sv.id === filterSurvey)?.title || "Entrevistas de Campo"}
          />
          <Button variant="outline" onClick={() => navigate(createPageUrl("Reports"))}>
            <FileText className="w-4 h-4 mr-2" /> Relatório PDF
          </Button>
        </div>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Buscar por entrevistador, pesquisa ou qualquer resposta (ex.: Sede, Masculino)..."
              className="pl-9" value={search} onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Select value={filterSurvey} onValueChange={(v) => { setFilterSurvey(v); setFilterInterviewer("todos"); setConditions([]); }}>
              <SelectTrigger className="col-span-2 md:col-span-1"><SelectValue placeholder="Pesquisa" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as pesquisas</SelectItem>
                {surveys.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterInterviewer} onValueChange={setFilterInterviewer}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os entrevistadores</SelectItem>
                {interviewers.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="concluida">Concluída</SelectItem>
                <SelectItem value="em_andamento">Em andamento</SelectItem>
                <SelectItem value="revisao">Em revisão</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterGeo} onValueChange={setFilterGeo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">GPS: todas</SelectItem>
                <SelectItem value="com">Só com GPS</SelectItem>
                <SelectItem value="sem">Só sem GPS</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterAudio} onValueChange={setFilterAudio}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Áudio: todos</SelectItem>
                <SelectItem value="com">Só com áudio</SelectItem>
                <SelectItem value="sem">Só sem áudio</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Filtros por resposta: todas as condições valem juntas (E). */}
          <div className="border-t pt-3 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5" /> Filtrar por resposta
                {filterSurvey === "todos" && <span className="font-normal text-gray-400">(perguntas iguais em pesquisas diferentes contam juntas)</span>}
              </p>
              <div className="flex gap-2">
                {activeFilters > 0 && (
                  <Button size="sm" variant="ghost" className="h-8 text-xs text-gray-500" onClick={clearAll}>
                    <RotateCcw className="w-3.5 h-3.5 mr-1" /> Limpar filtros
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setConditions((cs) => [...cs, newCondition()])} disabled={choices.length === 0}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar filtro de resposta
                </Button>
              </div>
            </div>

            {conditions.map((c) => {
              const choice = choiceByKey.get(c.key);
              const { list, empty } = choice ? valuesFor(choice) : { list: [], empty: 0 };
              const asText = choice && list.length > MAX_LISTED_VALUES;
              return (
                <div key={c.id} className="flex flex-col md:flex-row gap-2 md:items-center bg-gray-50 rounded-lg p-2">
                  <Select value={c.key} onValueChange={(v) => updateCondition(c.id, { key: v, value: "", text: "" })}>
                    <SelectTrigger className="md:flex-1 bg-white"><SelectValue placeholder="Escolha a pergunta" /></SelectTrigger>
                    <SelectContent>
                      {choices.map((ch) => (
                        <SelectItem key={ch.key} value={ch.key}>{ch.text.length > 80 ? `${ch.text.slice(0, 79)}…` : ch.text}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {choice && !asText && (
                    <Select value={c.value} onValueChange={(v) => updateCondition(c.id, { value: v })}>
                      <SelectTrigger className="md:w-72 bg-white"><SelectValue placeholder="Escolha a resposta" /></SelectTrigger>
                      <SelectContent>
                        {list.map((v) => <SelectItem key={v.label} value={v.label}>{v.label} ({v.count})</SelectItem>)}
                        {empty > 0 && <SelectItem value={NO_ANSWER}>Sem resposta ({empty})</SelectItem>}
                      </SelectContent>
                    </Select>
                  )}
                  {choice && asText && (
                    <Input className="md:w-72 bg-white" placeholder="Resposta contém..." value={c.text}
                      onChange={(e) => updateCondition(c.id, { text: e.target.value })} />
                  )}
                  <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0 text-gray-400 hover:text-red-500"
                    onClick={() => setConditions((cs) => cs.filter((x) => x.id !== c.id))} title="Remover filtro">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              );
            })}
            {conditions.length === 0 && (
              <p className="text-xs text-gray-400">
                Ex.: "Qual o seu sexo?" = Masculino e "Em qual bairro ou localidade reside?" = Sede. Combine com pesquisa, entrevistador, GPS e áudio acima.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : (
        <div className="space-y-3">
          {filtered.slice(0, shown).map(i => (
            <Card key={i.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {numbers.get(i.id) && (
                        <span className="text-xs font-semibold text-blue-700 bg-blue-50 rounded px-1.5 py-0.5 tabular-nums" title="Número da entrevista nesta pesquisa (o mesmo do KML)">
                          Nº {numbers.get(i.id)}
                        </span>
                      )}
                      <h3 className="font-semibold text-gray-900 text-sm">{i.survey_title || "Pesquisa sem título"}</h3>
                      <Badge variant={i.status === "concluida" ? "default" : "secondary"} className="text-xs capitalize">
                        {i.status?.replace("_", " ")}
                      </Badge>
                      {i.edit_history?.length > 0 && (
                        <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">Editada</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                      <span>👤 {i.interviewer_name || "—"}</span>
                      {i.completed_at && <span>📅 {format(new Date(i.completed_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>}
                      {hasGeo(i) ? (
                        <span className="flex items-center gap-1 text-green-600">
                          <MapPin className="w-3 h-3" /> {Number(i.latitude).toFixed(4)}, {Number(i.longitude).toFixed(4)}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-orange-500"><MapPin className="w-3 h-3" /> Sem GPS</span>
                      )}
                      {i.audio_url && (
                        <span className="flex items-center gap-1 text-blue-600">
                          <Mic className="w-3 h-3" /> Áudio
                        </span>
                      )}
                      <span>{i.answers?.length || 0} respostas</span>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => navigate(createPageUrl(`InterviewDetail?id=${i.id}`))}>
                      <Eye className="w-3 h-3 mr-1" /> Ver
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigate(createPageUrl(`InterviewEdit?id=${i.id}`))}>
                      <Edit className="w-3 h-3 mr-1" /> Editar
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {filtered.length > shown && (
            <div className="text-center">
              <Button variant="outline" onClick={() => setShown((n) => n + PAGE)}>
                Mostrar mais ({filtered.length - shown} restantes)
              </Button>
            </div>
          )}
          {filtered.length === 0 && <p className="text-gray-400 text-sm">Nenhuma entrevista encontrada com esses filtros.</p>}
        </div>
      )}
    </div>
  );
}
