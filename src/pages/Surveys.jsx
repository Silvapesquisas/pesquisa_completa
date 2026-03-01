import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Edit, BarChart2, Trash2, Play, Pause, Copy, History } from "lucide-react";
import { createPageUrl } from "@/utils";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

const statusColor = { rascunho: "secondary", ativa: "default", pausada: "outline", encerrada: "destructive" };
const categoryLabel = { urbano: "🏙️ Urbano", rural: "🌾 Rural", ambiental: "🌿 Ambiental", social: "👥 Social", outro: "📋 Outro" };

export default function Surveys() {
  const [surveys, setSurveys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState([]);
  const [versioningSurvey, setVersioningSurvey] = useState(null);
  const navigate = useNavigate();

  const load = () => {
    base44.entities.Survey.list("-created_date").then(data => { setSurveys(data); setLoading(false); });
  };
  useEffect(load, []);

  const toggleStatus = async (s) => {
    const newStatus = s.status === "ativa" ? "pausada" : "ativa";
    await base44.entities.Survey.update(s.id, { status: newStatus });
    load();
  };

  const deleteSurvey = async (id) => {
    if (!confirm("Deseja excluir esta pesquisa?")) return;
    await base44.entities.Survey.delete(id);
    load();
  };

  const duplicateSurvey = async (s) => {
    const { id, created_date, updated_date, ...rest } = s;
    await base44.entities.Survey.create({
      ...rest,
      title: `${s.title} (Cópia)`,
      status: "rascunho",
      questions: (s.questions || []).map(q => ({ ...q, id: crypto.randomUUID() })),
    });
    load();
  };

  const openVersions = async (s) => {
    setVersioningSurvey(s);
    const vs = await base44.entities.SurveyVersion.filter({ survey_id: s.id }, "-created_date");
    setVersions(vs);
    setVersionsOpen(true);
  };

  const saveVersion = async (s) => {
    const existing = await base44.entities.SurveyVersion.filter({ survey_id: s.id }, "-version_number", 1);
    const nextVersion = (existing[0]?.version_number || 0) + 1;
    await base44.entities.SurveyVersion.create({
      survey_id: s.id,
      version_number: nextVersion,
      title: s.title,
      snapshot: s,
      note: `v${nextVersion} - ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}`,
    });
    alert(`Versão v${nextVersion} salva!`);
  };

  const restoreVersion = async (version) => {
    if (!confirm(`Restaurar para ${version.note}? Isso sobrescreverá a pesquisa atual.`)) return;
    const { id, created_date, updated_date, ...snapshot } = version.snapshot;
    await base44.entities.Survey.update(versioningSurvey.id, snapshot);
    setVersionsOpen(false);
    load();
  };

  const filtered = surveys.filter(s => {
    const matchSearch = s.title?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "todos" || s.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pesquisas</h1>
          <p className="text-gray-500 text-sm mt-1">{surveys.length} pesquisa(s) no total</p>
        </div>
        <Link to={createPageUrl("SurveyBuilder")}>
          <Button className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" /> Nova Pesquisa
          </Button>
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="Buscar pesquisa..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="rascunho">Rascunho</SelectItem>
            <SelectItem value="ativa">Ativa</SelectItem>
            <SelectItem value="pausada">Pausada</SelectItem>
            <SelectItem value="encerrada">Encerrada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(s => (
            <Card key={s.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 pr-2">
                    <h3 className="font-semibold text-gray-900 leading-snug">{s.title}</h3>
                    <p className="text-xs text-gray-400 mt-1">{categoryLabel[s.category] || s.category}</p>
                  </div>
                  <Badge variant={statusColor[s.status]} className="capitalize text-xs shrink-0">{s.status}</Badge>
                </div>

                {s.description && <p className="text-sm text-gray-500 mb-3 line-clamp-2">{s.description}</p>}

                <div className="flex items-center justify-between text-xs text-gray-400 mb-4">
                  <span>{s.questions?.length || 0} questões</span>
                  {s.created_date && <span>{format(new Date(s.created_date), "dd/MM/yyyy", { locale: ptBR })}</span>}
                </div>

                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => navigate(createPageUrl(`SurveyBuilder?id=${s.id}`))}>
                    <Edit className="w-3 h-3 mr-1" /> Editar
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => navigate(createPageUrl(`Interviews?survey_id=${s.id}`))}>
                    <BarChart2 className="w-3 h-3 mr-1" /> Dados
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggleStatus(s)}>
                    {s.status === "ativa" ? <Pause className="w-4 h-4 text-orange-500" /> : <Play className="w-4 h-4 text-green-500" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteSurvey(s.id)}>
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && <p className="text-gray-400 text-sm col-span-3">Nenhuma pesquisa encontrada.</p>}
        </div>
      )}
    </div>
  );
}