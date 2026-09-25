import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardEdit, Search, User, Calendar, ChevronDown, ChevronUp, Wand2, Pencil, Eye, FileSpreadsheet, RotateCcw } from "lucide-react";
import { format, startOfMonth, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AUDIT_TYPES, entryType, parseChanges } from "@/lib/auditEntries";
import { normalizeText, surveySequence } from "@/lib/surveyAnswers";

const PAGE = 100;
const ymd = (d) => format(d, "yyyy-MM-dd");
const dayOf = (iso) => { const d = iso ? new Date(iso) : null; return d && !isNaN(d) ? ymd(d) : ""; };
const fmt = (iso, pattern) => { const d = iso ? new Date(iso) : null; return d && !isNaN(d) ? format(d, pattern, { locale: ptBR }) : "—"; };

// Atalhos de período.
const PRESETS = [
  { key: "hoje", label: "Hoje", range: () => [ymd(new Date()), ymd(new Date())] },
  { key: "7d", label: "Últimos 7 dias", range: () => [ymd(subDays(new Date(), 6)), ymd(new Date())] },
  { key: "30d", label: "Últimos 30 dias", range: () => [ymd(subDays(new Date(), 29)), ymd(new Date())] },
  { key: "mes", label: "Este mês", range: () => [ymd(startOfMonth(new Date())), ymd(new Date())] },
];

export default function AuditLog() {
  const navigate = useNavigate();
  const [interviews, setInterviews] = useState([]);
  const [surveys, setSurveys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterSurvey, setFilterSurvey] = useState("todas");
  const [filterUser, setFilterUser] = useState("todos");
  const [filterType, setFilterType] = useState("todos");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    const load = async () => {
      const me = await base44.auth.me();
      const companyId = me?.company_id;
      const [data, sv] = await Promise.all([
        companyId
          ? base44.entities.Interview.filter({ company_id: companyId }, "-updated_date")
          : base44.entities.Interview.list("-updated_date"),
        companyId ? base44.entities.Survey.filter({ company_id: companyId }) : base44.entities.Survey.list(),
      ]);
      setInterviews(data);
      setSurveys(sv);
      setLoading(false);
    };
    load().catch(() => setLoading(false));
  }, []);

  // Nº de cada entrevista na sua pesquisa (o mesmo da tela Entrevistas e do KML).
  const numbers = useMemo(() => surveySequence(interviews), [interviews]);

  // Um registro por alteração, do mais recente para o mais antigo. Uma
  // padronização grava um registro em CADA entrevista alterada; aqui elas viram
  // uma linha só por operação (mesmo momento, editor e texto), com a lista das
  // entrevistas afetadas.
  const allEntries = useMemo(() => {
    const out = [];
    const ops = new Map();
    for (const i of interviews) {
      (i.edit_history || []).forEach((h, k) => {
        const ref = { id: i.id, number: numbers.get(i.id), interviewer: i.interviewer_name || "—" };
        const type = entryType(h);
        if (type === "padronizacao") {
          const opKey = `${h.edited_at}|${h.edited_by}|${i.survey_id}|${h.changes_summary}`;
          const op = ops.get(opKey);
          if (op) { op.affected.push(ref); return; }
          const entry = {
            ...h, key: `op_${ops.size}`, type, interview_id: i.id, survey_id: i.survey_id,
            survey_title: i.survey_title || "Pesquisa", interviewer_name: null, number: null,
            changes: parseChanges(h.changes_summary), day: dayOf(h.edited_at), affected: [ref],
          };
          ops.set(opKey, entry);
          out.push(entry);
          return;
        }
        out.push({
          ...h, key: `${i.id}_${k}`, type, interview_id: i.id, survey_id: i.survey_id,
          survey_title: i.survey_title || "Pesquisa", interviewer_name: ref.interviewer, number: ref.number,
          changes: parseChanges(h.changes_summary), day: dayOf(h.edited_at), affected: [ref],
        });
      });
    }
    for (const e of ops.values()) e.affected.sort((a, b) => (a.number ?? 1e9) - (b.number ?? 1e9));
    return out.sort((a, b) => String(b.edited_at || "").localeCompare(String(a.edited_at || "")));
  }, [interviews, numbers]);

  // Pesquisas e editores que aparecem no histórico.
  const auditedSurveys = useMemo(() => {
    const ids = new Set(allEntries.map((e) => e.survey_id));
    const list = surveys.filter((s) => ids.has(s.id)).map((s) => ({ id: s.id, title: s.title }));
    // Pesquisa excluída: ainda aparece, pelo título gravado na entrevista.
    for (const e of allEntries) if (!list.some((s) => s.id === e.survey_id)) list.push({ id: e.survey_id, title: e.survey_title });
    return list.sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  }, [allEntries, surveys]);
  const editors = useMemo(() => [...new Set(allEntries.map((e) => e.edited_by_name).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "pt-BR")), [allEntries]);

  const filtered = useMemo(() => {
    const q = normalizeText(search);
    return allEntries.filter((e) => {
      if (filterSurvey !== "todas" && e.survey_id !== filterSurvey) return false;
      if (filterUser !== "todos" && e.edited_by_name !== filterUser) return false;
      if (filterType !== "todos" && e.type !== filterType) return false;
      if (dateFrom && (!e.day || e.day < dateFrom)) return false;
      if (dateTo && (!e.day || e.day > dateTo)) return false;
      if (q) {
        const hay = normalizeText([
          e.edited_by_name, e.survey_title, e.changes_summary,
          ...e.affected.map((a) => `${a.interviewer} nº ${a.number ?? ""}`),
        ].join(" "));
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allEntries, search, filterSurvey, filterUser, filterType, dateFrom, dateTo]);

  useEffect(() => { setShown(PAGE); }, [search, filterSurvey, filterUser, filterType, dateFrom, dateTo]);

  const activePreset = PRESETS.find((p) => { const [a, b] = p.range(); return a === dateFrom && b === dateTo; })?.key;
  const anyFilter = search || filterSurvey !== "todas" || filterUser !== "todos" || filterType !== "todos" || dateFrom || dateTo;
  const clearAll = () => { setSearch(""); setFilterSurvey("todas"); setFilterUser("todos"); setFilterType("todos"); setDateFrom(""); setDateTo(""); };

  const stats = {
    edits: filtered.length,
    interviews: new Set(filtered.flatMap((e) => e.affected.map((a) => a.id))).size,
    editors: new Set(filtered.map((e) => e.edited_by_name).filter(Boolean)).size,
    standardizations: filtered.filter((e) => e.type === "padronizacao").length,
  };

  // Agrupa por dia para a leitura cronológica.
  const visible = filtered.slice(0, shown);
  const byDay = [];
  for (const e of visible) {
    const last = byDay[byDay.length - 1];
    if (last && last.day === e.day) last.items.push(e);
    else byDay.push({ day: e.day, items: [e] });
  }
  const dayCount = useMemo(() => {
    const m = new Map();
    for (const e of filtered) m.set(e.day, (m.get(e.day) || 0) + 1);
    return m;
  }, [filtered]);

  const exportXLSX = () => {
    const rows = filtered.flatMap((e) => {
      const base = {
        "Data": fmt(e.edited_at, "dd/MM/yyyy HH:mm"),
        "Editor": e.edited_by_name || "",
        "E-mail do editor": e.edited_by || "",
        "Tipo": AUDIT_TYPES[e.type],
        "Pesquisa": e.survey_title,
        "Entrevistas afetadas": e.affected.length,
        "Nº da(s) entrevista(s)": e.affected.map((a) => a.number).filter(Boolean).join(", "),
        "Entrevistador(es)": [...new Set(e.affected.map((a) => a.interviewer))].join(", "),
      };
      if (!e.changes.length) return [{ ...base, "Campo": "", "Antes": "", "Depois": "", "Resumo": e.changes_summary || "" }];
      return e.changes.map((c) => ({ ...base, "Campo": c.field, "Antes": c.from ?? "", "Depois": c.to ?? "", "Resumo": c.from == null ? (e.changes_summary || "") : "" }));
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Auditoria");
    const period = dateFrom || dateTo ? `-${(dateFrom || "inicio").replaceAll("-", "")}-a-${(dateTo || "hoje").replaceAll("-", "")}` : "";
    XLSX.writeFile(wb, `auditoria${period}-${format(new Date(), "yyyyMMdd-HHmm")}.xlsx`);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardEdit className="w-6 h-6 text-blue-600" />
            Painel de Auditoria
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Histórico de todas as alterações realizadas em entrevistas
          </p>
        </div>
        <Button variant="outline" onClick={exportXLSX} disabled={!filtered.length}>
          <FileSpreadsheet className="w-4 h-4 mr-2" /> Exportar Excel
        </Button>
      </div>

      {/* Filtros */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Buscar por editor, pesquisa, entrevistador, Nº ou alteração..."
              className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Pesquisa</Label>
              <Select value={filterSurvey} onValueChange={setFilterSurvey}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as pesquisas</SelectItem>
                  {auditedSurveys.map((s) => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Editor</Label>
              <Select value={filterUser} onValueChange={setFilterUser}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os editores</SelectItem>
                  {editors.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Tipo de alteração</Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os tipos</SelectItem>
                  {Object.entries(AUDIT_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col md:flex-row md:items-end gap-3">
            <div className="grid grid-cols-2 gap-3 md:w-80">
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">De</Label>
                <Input type="date" value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Até</Label>
                <Input type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 flex-1">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => { const [a, b] = p.range(); setDateFrom(a); setDateTo(b); }}
                  className={`text-xs rounded-full px-3 py-1.5 border ${activePreset === p.key ? "bg-blue-600 text-white border-blue-600" : "text-gray-600 border-gray-200 hover:border-blue-300"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {anyFilter && (
              <Button variant="ghost" size="sm" className="text-xs text-gray-500" onClick={clearAll}>
                <RotateCcw className="w-3.5 h-3.5 mr-1" /> Limpar filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Números do recorte */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Alterações", value: stats.edits, color: "text-blue-600" },
          { label: "Entrevistas alteradas", value: stats.interviews, color: "text-purple-600" },
          { label: "Editores", value: stats.editors, color: "text-green-600" },
          { label: "Padronizações", value: stats.standardizations, color: "text-amber-600" },
        ].map((s) => (
          <Card key={s.label} className="border-0 shadow-sm">
            <CardContent className="p-4 text-center">
              <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <ClipboardEdit className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">{allEntries.length ? "Nenhuma alteração com esses filtros." : "Nenhuma edição registrada ainda."}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {byDay.map((group) => (
            <div key={group.day || "sem-data"}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5" />
                {group.day ? fmt(`${group.day}T12:00:00`, "EEEE, dd 'de' MMMM 'de' yyyy") : "Sem data"}
                <span className="font-normal normal-case text-gray-400">· {dayCount.get(group.day) || group.items.length} alteração(ões)</span>
              </p>
              <Card className="border-0 shadow-sm overflow-hidden">
                <div className="divide-y divide-gray-100">
                  {group.items.map((entry) => {
                    const isExpanded = expandedId === entry.key;
                    const isStd = entry.type === "padronizacao";
                    return (
                      <div
                        key={entry.key}
                        className="px-5 py-4 hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : entry.key)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="flex items-center gap-1 text-sm font-semibold text-gray-800">
                                <User className="w-3.5 h-3.5 text-blue-500" />
                                {entry.edited_by_name || "Usuário desconhecido"}
                              </span>
                              <Badge variant="outline" className={`text-xs ${isStd ? "text-amber-700 border-amber-200" : "text-purple-600 border-purple-200"}`}>
                                {isStd ? <Wand2 className="w-3 h-3 mr-1" /> : <Pencil className="w-3 h-3 mr-1" />}
                                {isStd ? `Padronização · ${entry.affected.length} entrevista(s)` : `${entry.changes.length} campo${entry.changes.length !== 1 ? "s" : ""}`}
                              </Badge>
                            </div>
                            <p className="text-xs text-gray-500 mt-1 truncate">
                              {!isStd && entry.number && <span className="font-semibold text-blue-700 mr-1">Nº {entry.number}</span>}
                              {entry.survey_title}{!isStd && ` · entrevistador ${entry.interviewer_name}`}
                            </p>
                            {!isExpanded && entry.changes.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {isStd ? (
                                  <span className="text-xs bg-amber-50 text-amber-800 rounded px-2 py-0.5">
                                    → "{entry.changes[0].to}"
                                  </span>
                                ) : (
                                  <>
                                    {entry.changes.slice(0, 3).map((c, i) => (
                                      <span key={i} className="text-xs bg-blue-50 text-blue-700 rounded px-2 py-0.5 font-medium max-w-[260px] truncate">
                                        {c.field}
                                      </span>
                                    ))}
                                    {entry.changes.length > 3 && <span className="text-xs text-gray-400">+{entry.changes.length - 3} mais</span>}
                                  </>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-gray-400 tabular-nums">{fmt(entry.edited_at, "HH:mm")}</span>
                            {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="mt-3 border-t pt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
                            {entry.changes.length > 0 ? entry.changes.map((c, i) => (
                              c.from == null ? (
                                <p key={i} className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">{c.field}</p>
                              ) : (
                                <div key={i} className="grid sm:grid-cols-3 gap-2 text-xs rounded-lg bg-gray-50 px-3 py-2">
                                  <span className="font-semibold text-gray-700">{c.field}</span>
                                  <span className="text-red-500 break-words"><span className="text-gray-400 mr-1">Antes:</span>{c.from || "(vazio)"}</span>
                                  <span className="text-green-600 break-words"><span className="text-gray-400 mr-1">Depois:</span>{c.to || "(vazio)"}</span>
                                </div>
                              )
                            )) : (
                              <p className="text-xs text-gray-400 italic">{entry.changes_summary || "Sem detalhes disponíveis."}</p>
                            )}
                            {isStd && (
                              <div>
                                <p className="text-[11px] text-gray-500 mb-1">{entry.affected.length} entrevista(s) alterada(s) — clique para abrir:</p>
                                <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                                  {entry.affected.map((a) => (
                                    <button key={a.id} type="button" title={`Entrevistador: ${a.interviewer}`}
                                      onClick={() => navigate(createPageUrl(`InterviewDetail?id=${a.id}`))}
                                      className="text-[11px] tabular-nums rounded border border-gray-200 px-1.5 py-0.5 text-blue-700 hover:bg-blue-50">
                                      Nº {a.number ?? "?"}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                              <span className="text-[11px] text-gray-400">
                                {fmt(entry.edited_at, "dd/MM/yyyy 'às' HH:mm")}{entry.edited_by ? ` · ${entry.edited_by}` : ""}
                              </span>
                              {!isStd && (
                                <Button size="sm" variant="outline" className="h-7 text-xs"
                                  onClick={() => navigate(createPageUrl(`InterviewDetail?id=${entry.interview_id}`))}>
                                  <Eye className="w-3 h-3 mr-1" /> Ver entrevista
                                </Button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          ))}
          {filtered.length > shown && (
            <div className="text-center">
              <Button variant="outline" onClick={() => setShown((n) => n + PAGE)}>
                Mostrar mais ({filtered.length - shown} restantes)
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
