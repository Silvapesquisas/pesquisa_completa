import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Loader2, BarChart2, Map } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Reports() {
  const [surveys, setSurveys] = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [selectedSurvey, setSelectedSurvey] = useState("todos");
  const [selectedInterviewer, setSelectedInterviewer] = useState("todos");
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    Promise.all([
      base44.entities.Survey.list(),
      base44.entities.Interview.list("-completed_at"),
    ]).then(([sv, iv]) => {
      setSurveys(sv);
      setInterviews(iv);
    });
  }, []);

  const filtered = interviews.filter(i => {
    const matchSurvey = selectedSurvey === "todos" || i.survey_id === selectedSurvey;
    const matchInterviewer = selectedInterviewer === "todos" || i.interviewer_name === selectedInterviewer;
    return matchSurvey && matchInterviewer && i.status === "concluida";
  });

  const interviewers = [...new Set(interviews.map(i => i.interviewer_name).filter(Boolean))];

  const generatePreview = () => {
    setGenerating(true);
    setTimeout(() => {
      setPreview({ interviews: filtered, survey: surveys.find(s => s.id === selectedSurvey) });
      setGenerating(false);
    }, 500);
  };

  const exportPDF = async () => {
    setGenerating(true);
    const surveyObj = surveys.find(s => s.id === selectedSurvey);
    const surveyTitle = surveyObj?.title || "Todas as pesquisas";

    const prompt = `Gere um relatório profissional em formato de texto bem estruturado sobre as seguintes entrevistas de pesquisa de campo.

Título da Pesquisa: ${surveyTitle}
Total de Entrevistas: ${filtered.length}
Período: ${filtered.length > 0 ? format(new Date(filtered[filtered.length - 1].completed_at || Date.now()), "dd/MM/yyyy", { locale: ptBR }) : "—"} a ${filtered.length > 0 ? format(new Date(filtered[0].completed_at || Date.now()), "dd/MM/yyyy", { locale: ptBR }) : "—"}
Com Geolocalização: ${filtered.filter(i => i.latitude).length}
Com Áudio: ${filtered.filter(i => i.audio_url).length}

Entrevistadores: ${[...new Set(filtered.map(i => i.interviewer_name))].join(", ") || "—"}

Dados das Entrevistas:
${filtered.slice(0, 20).map((i, idx) => `
Entrevista ${idx + 1} - ${i.interviewer_name || "—"} - ${i.completed_at ? format(new Date(i.completed_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—"}
${(i.answers || []).map(a => `  ${a.question_text}: ${a.answer || a.answer_array?.join(", ") || "—"}`).join("\n")}
`).join("\n")}

Gere uma análise completa com: resumo executivo, principais resultados por questão, padrões observados, observações e conclusão.`;

    const result = await base44.integrations.Core.InvokeLLM({ prompt });

    // Simulated PDF download using text blob
    const blob = new Blob([result], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `relatorio-${surveyTitle.replace(/\s+/g, "-").toLowerCase()}-${format(new Date(), "yyyyMMdd")}.txt`;
    a.click();
    setGenerating(false);
  };

  const exportKML = () => {
    const withGeo = filtered.filter(i => i.latitude && i.longitude);
    if (withGeo.length === 0) { alert("Nenhuma entrevista com geolocalização."); return; }

    const placemarks = withGeo.map(i => {
      const date = i.completed_at ? format(new Date(i.completed_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—";
      const summary = i.notes || (i.answers || []).slice(0, 3).map(a => `${a.question_text}: ${a.answer || ""}`).join("; ");
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
    <name>Relatório de Entrevistas de Campo</name>
${placemarks}
  </Document>
</kml>`;

    const blob = new Blob([kml], { type: "application/vnd.google-earth.kml+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `entrevistas-${format(new Date(), "yyyyMMdd")}.kml`;
    a.click();
  };

  // Build stats per question
  const questionStats = (() => {
    if (!filtered.length) return [];
    const surveyObj = surveys.find(s => s.id === selectedSurvey);
    const questions = surveyObj?.questions || [];
    return questions.map(q => {
      const allAnswers = filtered.flatMap(i => (i.answers || []).filter(a => a.question_id === q.id));
      const counts = {};
      allAnswers.forEach(a => {
        const vals = a.answer_array?.length ? a.answer_array : [a.answer];
        vals.forEach(v => { if (v) counts[v] = (counts[v] || 0) + 1; });
      });
      return { question: q, counts, total: allAnswers.length };
    });
  })();

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Relatórios</h1>
        <p className="text-gray-500 text-sm mt-1">Gerar relatórios e exportar dados das entrevistas</p>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-base">Filtros</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label className="text-xs text-gray-500 mb-1 block">Pesquisa</Label>
            <Select value={selectedSurvey} onValueChange={setSelectedSurvey}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                {surveys.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-gray-500 mb-1 block">Entrevistador</Label>
            <Select value={selectedInterviewer} onValueChange={setSelectedInterviewer}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {interviewers.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={generatePreview} disabled={generating} variant="outline" className="w-full">
              {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <BarChart2 className="w-4 h-4 mr-2" />}
              Gerar Prévia
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Entrevistas", value: filtered.length },
          { label: "Com Geo", value: filtered.filter(i => i.latitude).length },
          { label: "Com Áudio", value: filtered.filter(i => i.audio_url).length },
          { label: "Editadas", value: filtered.filter(i => i.edit_history?.length > 0).length },
        ].map(s => (
          <Card key={s.label} className="border-0 shadow-sm">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-400 mt-1">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {preview && questionStats.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-base">Resultados por Questão</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            {questionStats.filter(qs => Object.keys(qs.counts).length > 0).map(({ question, counts, total }) => (
              <div key={question.id} className="border-b pb-4 last:border-0">
                <p className="text-sm font-medium text-gray-700 mb-2">{question.text}</p>
                <div className="space-y-2">
                  {Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([val, count]) => (
                    <div key={val} className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 w-32 truncate">{val}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${(count / total) * 100}%` }} />
                      </div>
                      <span className="text-xs text-gray-500 w-12 text-right">{count} ({Math.round((count / total) * 100)}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-3">
        <Button className="bg-blue-600 hover:bg-blue-700" onClick={exportPDF} disabled={generating || filtered.length === 0}>
          {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
          Exportar Relatório (TXT/PDF)
        </Button>
        <Button variant="outline" onClick={exportKML} disabled={filtered.filter(i => i.latitude).length === 0}>
          <Map className="w-4 h-4 mr-2" /> Exportar KML
        </Button>
      </div>
    </div>
  );
}