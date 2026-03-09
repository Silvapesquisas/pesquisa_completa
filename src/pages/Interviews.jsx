import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, MapPin, Mic, Eye, Edit, FileText, Download, Map } from "lucide-react";
import { createPageUrl } from "@/utils";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Interviews() {
  const [interviews, setInterviews] = useState([]);
  const [surveys, setSurveys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterSurvey, setFilterSurvey] = useState("todos");
  const [filterStatus, setFilterStatus] = useState("todos");
  const navigate = useNavigate();

  const params = new URLSearchParams(window.location.search);
  const surveyIdParam = params.get("survey_id");

  useEffect(() => {
    if (surveyIdParam) setFilterSurvey(surveyIdParam);
    base44.auth.me().then(async (me) => {
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
    }).catch(() => setLoading(false));
  }, []);

  const filtered = interviews.filter(i => {
    const matchSearch = (i.interviewer_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (i.survey_title || "").toLowerCase().includes(search.toLowerCase());
    const matchSurvey = filterSurvey === "todos" || i.survey_id === filterSurvey;
    const matchStatus = filterStatus === "todos" || i.status === filterStatus;
    return matchSearch && matchSurvey && matchStatus;
  });

  const exportKML = () => {
    const withGeo = filtered.filter(i => i.latitude && i.longitude);
    if (withGeo.length === 0) { alert("Nenhuma entrevista com geolocalização nos filtros atuais."); return; }

    const placemarks = withGeo.map(i => {
      const date = i.completed_at ? format(new Date(i.completed_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—";
      const summary = i.notes || (i.answers || []).slice(0, 2).map(a => `${a.question_text}: ${a.answer || ""}`).join("; ");
      return `    <Placemark>
      <name>${i.interviewer_name || "Entrevistador"}</name>
      <description><![CDATA[
        <b>Data:</b> ${date}<br/>
        <b>Entrevistador:</b> ${i.interviewer_name || "—"}<br/>
        <b>Pesquisa:</b> ${i.survey_title || "—"}<br/>
        <b>Resumo:</b> ${summary || "—"}
      ]]></description>
      <Point><coordinates>${i.longitude},${i.latitude},0</coordinates></Point>
    </Placemark>`;
    }).join("\n");

    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Entrevistas de Campo</name>
${placemarks}
  </Document>
</kml>`;

    const blob = new Blob([kml], { type: "application/vnd.google-earth.kml+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "entrevistas.kml";
    a.click();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Entrevistas</h1>
          <p className="text-gray-500 text-sm mt-1">{filtered.length} entrevista(s)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportKML}>
            <Map className="w-4 h-4 mr-2" /> Exportar KML
          </Button>
          <Button variant="outline" onClick={() => navigate(createPageUrl("Reports"))}>
            <FileText className="w-4 h-4 mr-2" /> Relatório PDF
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="Buscar entrevistador ou pesquisa..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterSurvey} onValueChange={setFilterSurvey}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Pesquisa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as pesquisas</SelectItem>
            {surveys.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="concluida">Concluída</SelectItem>
            <SelectItem value="em_andamento">Em andamento</SelectItem>
            <SelectItem value="revisao">Em revisão</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : (
        <div className="space-y-3">
          {filtered.map(i => (
            <Card key={i.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
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
                      {i.latitude && i.longitude && (
                        <span className="flex items-center gap-1 text-green-600">
                          <MapPin className="w-3 h-3" /> {i.latitude.toFixed(4)}, {i.longitude.toFixed(4)}
                        </span>
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
          {filtered.length === 0 && <p className="text-gray-400 text-sm">Nenhuma entrevista encontrada.</p>}
        </div>
      )}
    </div>
  );
}