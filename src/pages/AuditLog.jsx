import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardEdit, Search, User, Calendar, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function AuditLog() {
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterUser, setFilterUser] = useState("todos");
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    const load = async () => {
      const me = await base44.auth.me();
      const companyId = me?.company_id;
      const data = companyId
        ? await base44.entities.Interview.filter({ company_id: companyId }, "-updated_date", 200)
        : await base44.entities.Interview.list("-updated_date", 200);
      // Only keep interviews that have edit history
      setInterviews(data.filter(i => i.edit_history?.length > 0));
      setLoading(false);
    };
    load().catch(() => setLoading(false));
  }, []);

  // Flatten all audit entries
  const allEntries = interviews.flatMap(i =>
    (i.edit_history || []).map(h => ({
      ...h,
      interview_id: i.id,
      survey_title: i.survey_title || "Pesquisa",
      interviewer_name: i.interviewer_name || "—",
    }))
  ).sort((a, b) => new Date(b.edited_at) - new Date(a.edited_at));

  // Unique editors for filter
  const editors = [...new Set(allEntries.map(e => e.edited_by_name).filter(Boolean))];

  const filtered = allEntries.filter(e => {
    const matchSearch =
      (e.edited_by_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (e.survey_title || "").toLowerCase().includes(search.toLowerCase()) ||
      (e.changes_summary || "").toLowerCase().includes(search.toLowerCase());
    const matchUser = filterUser === "todos" || e.edited_by_name === filterUser;
    return matchSearch && matchUser;
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ClipboardEdit className="w-6 h-6 text-blue-600" />
          Painel de Auditoria
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Histórico de todas as alterações realizadas em entrevistas
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-blue-600">{allEntries.length}</p>
            <p className="text-xs text-gray-500 mt-1">Total de edições</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-purple-600">{interviews.length}</p>
            <p className="text-xs text-gray-500 mt-1">Entrevistas editadas</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm col-span-2 sm:col-span-1">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-green-600">{editors.length}</p>
            <p className="text-xs text-gray-500 mt-1">Editores únicos</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Buscar por editor, pesquisa ou alteração..."
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterUser} onValueChange={setFilterUser}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Filtrar por editor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os editores</SelectItem>
            {editors.map(e => (
              <SelectItem key={e} value={e}>{e}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <ClipboardEdit className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">Nenhuma edição encontrada.</p>
        </div>
      ) : (
        <Card className="border-0 shadow-sm overflow-hidden">
          <div className="divide-y divide-gray-100">
            {filtered.map((entry, idx) => {
              const key = `${entry.interview_id}_${entry.edited_at}_${idx}`;
              const isExpanded = expandedId === key;
              const changes = parseChanges(entry.changes_summary);

              return (
                <div
                  key={key}
                  className="px-5 py-4 hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : key)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Header row */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="flex items-center gap-1 text-sm font-semibold text-gray-800">
                          <User className="w-3.5 h-3.5 text-blue-500" />
                          {entry.edited_by_name || "Usuário desconhecido"}
                        </span>
                        <span className="text-gray-300">·</span>
                        <span className="text-xs text-gray-500 truncate max-w-[200px]">
                          {entry.survey_title}
                        </span>
                        <Badge variant="outline" className="text-xs text-purple-600 border-purple-200">
                          {changes.length} campo{changes.length !== 1 ? "s" : ""}
                        </Badge>
                      </div>

                      {/* Fields preview */}
                      {!isExpanded && changes.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {changes.slice(0, 3).map((c, i) => (
                            <span key={i} className="text-xs bg-blue-50 text-blue-700 rounded px-2 py-0.5 font-medium">
                              {c.field}
                            </span>
                          ))}
                          {changes.length > 3 && (
                            <span className="text-xs text-gray-400">+{changes.length - 3} mais</span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Calendar className="w-3 h-3" />
                        {entry.edited_at
                          ? format(new Date(entry.edited_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
                          : "—"}
                      </span>
                      {isExpanded
                        ? <ChevronUp className="w-4 h-4 text-gray-400" />
                        : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </div>

                  {/* Expanded: field details */}
                  {isExpanded && (
                    <div className="mt-3 border-t pt-3 space-y-2">
                      {changes.length > 0 ? (
                        changes.map((c, i) => (
                          <div key={i} className="grid grid-cols-3 gap-2 text-xs rounded-lg bg-gray-50 px-3 py-2">
                            <span className="font-semibold text-gray-700">{c.field}</span>
                            <span className="text-red-500 truncate">
                              <span className="text-gray-400 mr-1">Antes:</span>{c.from || "—"}
                            </span>
                            <span className="text-green-600 truncate">
                              <span className="text-gray-400 mr-1">Depois:</span>{c.to || "—"}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-gray-400 italic">{entry.changes_summary || "Sem detalhes disponíveis."}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

/**
 * Try to parse structured changes from changes_summary string.
 * Expected format: "Campo: De 'X' para 'Y'; ..."
 */
function parseChanges(summary) {
  if (!summary) return [];
  const entries = summary.split(/;\s*/);
  return entries.map(e => {
    const match = e.match(/^(.+?):\s*De ['"]?(.*?)['"]?\s*para\s*['"]?(.*?)['"]?$/i);
    if (match) return { field: match[1].trim(), from: match[2].trim(), to: match[3].trim() };
    // fallback: just show as field name
    if (e.trim()) return { field: e.trim(), from: null, to: null };
    return null;
  }).filter(Boolean);
}