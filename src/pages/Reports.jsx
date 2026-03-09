import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Download, Loader2, BarChart2, Map, PieChart, Users } from "lucide-react";
import { format, isAfter, isBefore, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BarChartCard, PieChartCard } from "@/components/reports/InterviewCharts";
import { generatePDF } from "@/components/reports/pdfExport.jsx";

export default function Reports() {
  const [surveys, setSurveys] = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [selectedSurvey, setSelectedSurvey] = useState("todos");
  const [selectedInterviewer, setSelectedInterviewer] = useState("todos");
  const [selectedStatus, setSelectedStatus] = useState("concluida");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    base44.auth.me().then(async (me) => {
      const companyId = me?.company_id;
      const [sv, iv] = await Promise.all([
        companyId
          ? base44.entities.Survey.filter({ company_id: companyId })
          : base44.entities.Survey.list(),
        companyId
          ? base44.entities.Interview.filter({ company_id: companyId }, "-completed_at", 500)
          : base44.entities.Interview.list("-completed_at", 500),
      ]);
      setSurveys(sv);
      setInterviews(iv);
    });
  }, []);

  const filtered = interviews.filter(i => {
    const matchSurvey = selectedSurvey === "todos" || i.survey_id === selectedSurvey;
    const matchInterviewer = selectedInterviewer === "todos" || i.interviewer_name === selectedInterviewer;
    const matchStatus = selectedStatus === "todos" || i.status === selectedStatus;
    const dt = i.completed_at || i.created_date;
    const matchFrom = !dateFrom || (dt && isAfter(parseISO(dt), parseISO(dateFrom)));
    const matchTo = !dateTo || (dt && isBefore(parseISO(dt), parseISO(dateTo + "T23:59:59")));
    return matchSurvey && matchInterviewer && matchStatus && matchFrom && matchTo;
  });

  const interviewers = [...new Set(interviews.map(i => i.interviewer_name).filter(Boolean))];

  // Chart data
  const byInterviewer = (() => {
    const map = {};
    filtered.forEach(i => { const n = i.interviewer_name || "—"; map[n] = (map[n] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);
  })();

  const bySurvey = (() => {
    const map = {};
    filtered.forEach(i => { const n = i.survey_title || "—"; map[n] = (map[n] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name: name.slice(0, 20), value }));
  })();

  const byStatus = [
    { name: "Concluída", value: interviews.filter(i => i.status === "concluida").length },
    { name: "Em andamento", value: interviews.filter(i => i.status === "em_andamento").length },
    { name: "Revisão", value: interviews.filter(i => i.status === "revisao").length },
  ].filter(s => s.value > 0);

  const questionStats = (() => {
    if (!filtered.length || selectedSurvey === "todos") return [];
    const surveyObj = surveys.find(s => s.id === selectedSurvey);
    if (!surveyObj?.questions) return [];
    return surveyObj.questions.map(q => {
      const allAnswers = filtered.flatMap(i => (i.answers || []).filter(a => a.question_id === q.id));
      const counts = {};
      allAnswers.forEach(a => {
        const vals = a.answer_array?.length ? a.answer_array : [a.answer];
        vals.forEach(v => { if (v) counts[v] = (counts[v] || 0) + 1; });
      });
      return { question: q, counts, total: allAnswers.length };
    });
  })();

  const exportKML = () => {
    const withGeo = filtered.filter(i => i.latitude && i.longitude);
    if (withGeo.length === 0) { alert("Nenhuma entrevista com geolocalização."); return; }
    const placemarks = withGeo.map(i => {
      const date = i.completed_at ? format(new Date(i.completed_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—";
      return `    <Placemark>
      <name>${i.interviewer_name || "Entrevistador"}</name>
      <description><![CDATA[<b>Data:</b> ${date}<br/><b>Pesquisa:</b> ${i.survey_title || "—"}]]></description>
      <Point><coordinates>${i.longitude},${i.latitude},0</coordinates></Point>
    </Placemark>`;
    }).join("\n");
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document><name>Entrevistas</name>${placemarks}</Document>
</kml>`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([kml], { type: "application/vnd.google-earth.kml+xml" }));
    a.download = `entrevistas-${format(new Date(), "yyyyMMdd")}.kml`;
    a.click();
  };

  const exportPDF = async () => {
    if (filtered.length === 0) { alert("Nenhuma entrevista nos filtros selecionados."); return; }
    setGenerating(true);
    const surveyObj = surveys.find(s => s.id === selectedSurvey);
    const totalInterviews = filtered.length;
    const interviewersList = [...new Set(filtered.map(i => i.interviewer_name).filter(Boolean))];
    const withGeo = filtered.filter(i => i.latitude && i.longitude).length;
    const withAudio = filtered.filter(i => i.audio_url).length;
    const periodStart = dateFrom || (filtered.length > 0 ? format(new Date(filtered[filtered.length - 1].created_date || Date.now()), "dd/MM/yyyy", { locale: ptBR }) : "—");
    const periodEnd = dateTo || (filtered.length > 0 ? format(new Date(filtered[0].completed_at || filtered[0].created_date || Date.now()), "dd/MM/yyyy", { locale: ptBR }) : "—");

    const qStats = surveyObj?.questions?.map(q => {
      const allAnswers = filtered.flatMap(i => (i.answers || []).filter(a => a.question_id === q.id));
      const counts = {};
      allAnswers.forEach(a => {
        const vals = a.answer_array?.length ? a.answer_array : [a.answer];
        vals.forEach(v => { if (v) counts[v] = (counts[v] || 0) + 1; });
      });
      return { question: q, counts, total: allAnswers.length };
    }) || [];

    const questionSummary = qStats.map((qs, i) => {
      const entries = Object.entries(qs.counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
      return `Q${i+1}: "${qs.question.text}" — ${qs.total} respostas. Distribuição: ${entries.map(([v, n]) => `${v}: ${n} (${qs.total > 0 ? ((n/qs.total)*100).toFixed(1) : 0}%)`).join("; ")}`;
    }).join("\n");

    const prompt = `Você é especialista em pesquisas de opinião pública. Escreva uma ANÁLISE QUALITATIVA E CONCLUSÕES para o seguinte relatório. Use linguagem formal e técnica. Escreva em português brasileiro. Seja objetivo e analítico.

PESQUISA: ${surveyObj?.title || "Pesquisa"}
PERÍODO: ${periodStart} a ${periodEnd}
TOTAL DE ENTREVISTAS: ${totalInterviews}
ENTREVISTADORES: ${interviewersList.join(", ") || "—"} (${interviewersList.length} total)
COM GEOLOCALIZAÇÃO: ${withGeo} (${totalInterviews > 0 ? ((withGeo/totalInterviews)*100).toFixed(1) : 0}%)

RESULTADOS POR QUESTÃO:
${questionSummary || "Sem dados de questões."}

Estruture sua resposta com estas seções:
1. SÍNTESE DOS RESULTADOS
2. ANÁLISE POR QUESTÃO (comente cada questão individualmente com os dados)
3. PADRÕES IDENTIFICADOS
4. CONCLUSÕES E RECOMENDAÇÕES`;

    let aiText = "";
    try {
      aiText = await base44.integrations.Core.InvokeLLM({ prompt, model: "claude_sonnet_4_6" });
    } catch {
      aiText = "Análise qualitativa não disponível.";
    }

    await generatePDF({
      surveyObj,
      filtered,
      questionStats: qStats,
      aiText,
      dateFrom: periodStart,
      dateTo: periodEnd,
    });
    setGenerating(false);
  };

  const exportTXT = async () => {
    setGenerating(true);
    const surveyObj = surveys.find(s => s.id === selectedSurvey);
    const surveyTitle = surveyObj?.title || "Todas as pesquisas";
    const surveyDesc = surveyObj?.description || "";
    const surveyCategory = surveyObj?.category || "";
    const totalInterviews = filtered.length;
    const interviewersList = [...new Set(filtered.map(i => i.interviewer_name).filter(Boolean))];
    const withGeo = filtered.filter(i => i.latitude && i.longitude).length;
    const withAudio = filtered.filter(i => i.audio_url).length;
    const periodStart = dateFrom || (filtered.length > 0 ? format(new Date(filtered[filtered.length - 1].created_date || Date.now()), "dd/MM/yyyy", { locale: ptBR }) : "—");
    const periodEnd = dateTo || (filtered.length > 0 ? format(new Date(filtered[0].completed_at || filtered[0].created_date || Date.now()), "dd/MM/yyyy", { locale: ptBR }) : "—");

    // Build per-question stats
    const questionStats = surveyObj?.questions?.map(q => {
      const allAnswers = filtered.flatMap(i => (i.answers || []).filter(a => a.question_id === q.id));
      const counts = {};
      allAnswers.forEach(a => {
        const vals = a.answer_array?.length ? a.answer_array : [a.answer];
        vals.forEach(v => { if (v) counts[v] = (counts[v] || 0) + 1; });
      });
      const sortedCounts = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      return { question: q.text, type: q.type, total: allAnswers.length, counts: sortedCounts };
    }) || [];

    const questionSummary = questionStats.map((qs, i) =>
      `Q${i+1}: "${qs.question}" (${qs.type}) — ${qs.total} respostas. Distribuição: ${qs.counts.slice(0, 8).map(([v, n]) => `${v}: ${n} (${totalInterviews > 0 ? ((n/qs.total)*100).toFixed(1) : 0}%)`).join("; ")}`
    ).join("\n");

    const sampleAnswers = filtered.slice(0, 20).map((i, idx) =>
      `[${idx+1}] ${i.interviewer_name || "—"} | ${i.location_address || (i.latitude ? `${i.latitude?.toFixed(4)},${i.longitude?.toFixed(4)}` : "sem GPS")} | ${(i.answers || []).map(a => `${a.question_text}: ${a.answer || a.answer_array?.join(", ") || "—"}`).join("; ")}`
    ).join("\n");

    const prompt = `Você é um especialista em pesquisas de opinião pública e deve gerar um RELATÓRIO DESCRITIVO TÉCNICO COMPLETO, seguindo rigorosamente a estrutura abaixo. Use linguagem formal, técnica e analítica. Escreva em português brasileiro.

===== DADOS DA PESQUISA =====
Título: ${surveyTitle}
Descrição: ${surveyDesc}
Categoria: ${surveyCategory}
Total de entrevistas: ${totalInterviews}
Período de campo: ${periodStart} a ${periodEnd}
Entrevistadores: ${interviewersList.join(", ") || "—"} (${interviewersList.length} no total)
Entrevistas com geolocalização: ${withGeo} (${totalInterviews > 0 ? ((withGeo/totalInterviews)*100).toFixed(1) : 0}%)
Entrevistas com áudio: ${withAudio} (${totalInterviews > 0 ? ((withAudio/totalInterviews)*100).toFixed(1) : 0}%)

===== QUESTÕES E RESULTADOS =====
${questionSummary || "Sem dados de questões disponíveis."}

===== AMOSTRA DE RESPOSTAS =====
${sampleAnswers || "Sem respostas disponíveis."}

===== ESTRUTURA OBRIGATÓRIA DO RELATÓRIO =====

Gere o relatório com EXATAMENTE estas seções, nesta ordem:

1. CABEÇALHO
   - Título formal do relatório
   - Subtítulo descritivo (ex: "Relatório Descritivo contendo informações técnicas, representação gráfica e análise dos resultados")
   - Nome da pesquisa, período de campo, total de entrevistas

2. METODOLOGIA
   - Tipo de pesquisa (quantitativa/qualitativa, Survey)
   - Método de coleta (entrevistas presenciais, digitais etc.)
   - Tamanho da amostra e justificativa
   - Margem de erro (calcule com base em: n=${totalInterviews}, IC 95%)
   - Intervalo de confiança
   - Variáveis de controle utilizadas
   - Instrumento de coleta (questionário estruturado digital)
   - Período de trabalho de campo
   - Processamento e análise dos dados

3. ÁREAS DE INTERESSE E DISTRIBUIÇÃO DO TRABALHO DE CAMPO
   - Distribuição territorial das entrevistas por entrevistador
   - Cobertura geográfica (${withGeo} entrevistas com GPS de ${totalInterviews})
   - Controle de qualidade: georreferenciamento, tempo médio de entrevista, verificação de cotas

4. RESULTADOS DA PESQUISA
   - Para CADA questão, escreva:
     a) Enunciado da questão
     b) Análise descritiva dos resultados (texto narrativo explicando os números)
     c) Destaques e observações relevantes
     d) Comparação entre grupos quando relevante
   - Inclua os percentuais e números absolutos nas análises

5. CONCLUSÕES E AVALIAÇÃO ESTRATÉGICA
   - Síntese dos principais achados
   - Padrões identificados entre as respostas
   - Recomendações baseadas nos dados
   - Observações finais sobre a qualidade da pesquisa

Use linguagem formal e técnica, similar a relatórios de pesquisa eleitoral e de opinião pública. Seja detalhado e analítico em cada seção.`;

    const result = await base44.integrations.Core.InvokeLLM({ prompt, model: "claude_sonnet_4_6" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([result], { type: "text/plain;charset=utf-8" }));
    a.download = `relatorio-${format(new Date(), "yyyyMMdd")}.txt`;
    a.click();
    setGenerating(false);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Relatórios</h1>
        <p className="text-gray-500 text-sm mt-1">Relatórios customizados com visualizações gráficas</p>
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3"><CardTitle className="text-base">Filtros</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
          <div>
            <Label className="text-xs text-gray-500 mb-1 block">Status</Label>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="concluida">Concluída</SelectItem>
                <SelectItem value="em_andamento">Em andamento</SelectItem>
                <SelectItem value="revisao">Revisão</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-gray-500 mb-1 block">Data início</Label>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-gray-500 mb-1 block">Data fim</Label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button onClick={() => setPreview(true)} variant="outline" className="w-full">
              <BarChart2 className="w-4 h-4 mr-2" /> Gerar Visualização
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Entrevistas", value: filtered.length },
          { label: "Com Geo", value: filtered.filter(i => i.latitude).length },
          { label: "Com Áudio", value: filtered.filter(i => i.audio_url).length },
          { label: "Entrevistadores", value: new Set(filtered.map(i => i.interviewer_name)).size },
        ].map(s => (
          <Card key={s.label} className="border-0 shadow-sm">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-400 mt-1">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      {preview && (
        <Tabs defaultValue="charts" className="space-y-4">
          <TabsList>
            <TabsTrigger value="charts"><BarChart2 className="w-4 h-4 mr-1" /> Gráficos</TabsTrigger>
            <TabsTrigger value="interviewers"><Users className="w-4 h-4 mr-1" /> Entrevistadores</TabsTrigger>
            <TabsTrigger value="questions"><PieChart className="w-4 h-4 mr-1" /> Por Questão</TabsTrigger>
          </TabsList>

          <TabsContent value="charts" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="border-0 shadow-sm">
                <CardContent className="p-5">
                  <BarChartCard data={byInterviewer} title="Entrevistas por Entrevistador" />
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-5">
                  <PieChartCard data={byStatus} title="Distribuição por Status" />
                </CardContent>
              </Card>
              {bySurvey.length > 1 && (
                <Card className="border-0 shadow-sm lg:col-span-2">
                  <CardContent className="p-5">
                    <BarChartCard data={bySurvey} title="Entrevistas por Pesquisa" />
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="interviewers">
            {byInterviewer.length === 0 ? (
              <Card className="border-0 shadow-sm">
                <CardContent className="p-8 text-center text-gray-400 text-sm">Nenhum dado disponível para os filtros selecionados.</CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {byInterviewer.map(({ name, value }) => {
                  const interviewerData = filtered.filter(i => i.interviewer_name === name);
                  const completed = interviewerData.filter(i => i.status === "concluida").length;
                  const completionRate = value > 0 ? Math.round((completed / value) * 100) : 0;
                  const withGeo = interviewerData.filter(i => i.latitude).length;
                  const withAudio = interviewerData.filter(i => i.audio_url).length;

                  // Avg duration estimate from audio
                  const durations = interviewerData.filter(i => i.audio_duration).map(i => i.audio_duration);
                  const avgDuration = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;

                  return (
                    <Card key={name} className="border-0 shadow-sm">
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-3 mb-4">
                          <div>
                            <p className="font-semibold text-gray-900">{name}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{value} entrevistas no período</p>
                          </div>
                          <Badge className={completionRate >= 80 ? "bg-green-100 text-green-800" : completionRate >= 50 ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800"}>
                            {completionRate}% conclusão
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {[
                            { label: "Concluídas", value: completed, color: "text-green-600" },
                            { label: "Com GPS", value: withGeo, color: "text-blue-600" },
                            { label: "Com Áudio", value: withAudio, color: "text-purple-600" },
                            { label: "Duração Média", value: avgDuration ? `${Math.floor(avgDuration / 60)}m ${avgDuration % 60}s` : "—", color: "text-gray-600" },
                          ].map(s => (
                            <div key={s.label} className="bg-gray-50 rounded-lg p-3 text-center">
                              <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                              <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3">
                          <div className="flex justify-between text-xs text-gray-400 mb-1">
                            <span>Taxa de conclusão</span><span>{completionRate}%</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2">
                            <div className={`h-2 rounded-full transition-all ${completionRate >= 80 ? "bg-green-500" : completionRate >= 50 ? "bg-yellow-500" : "bg-red-500"}`}
                              style={{ width: `${completionRate}%` }} />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="questions">
            {selectedSurvey === "todos" ? (
              <Card className="border-0 shadow-sm">
                <CardContent className="p-8 text-center text-gray-400 text-sm">
                  Selecione uma pesquisa específica para ver os resultados por questão.
                </CardContent>
              </Card>
            ) : questionStats.length === 0 ? (
              <Card className="border-0 shadow-sm">
                <CardContent className="p-8 text-center text-gray-400 text-sm">
                  Nenhum dado de questões disponível para os filtros selecionados.
                </CardContent>
              </Card>
            ) : (
              <Card className="border-0 shadow-sm">
                <CardContent className="p-5 space-y-6">
                  {questionStats.filter(qs => Object.keys(qs.counts).length > 0).map(({ question, counts, total }) => {
                    const chartData = Object.entries(counts)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 8)
                      .map(([name, value]) => ({ name: name.slice(0, 20), value }));
                    return (
                      <div key={question.id} className="border-b pb-5 last:border-0">
                        <p className="text-sm font-medium text-gray-700 mb-3">{question.text}</p>
                        {(question.type === "multipla_escolha" || question.type === "unica_escolha" || question.type === "sim_nao") ? (
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <BarChartCard data={chartData} />
                            <PieChartCard data={chartData} />
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {chartData.map(({ name, value }) => (
                              <div key={name} className="flex items-center gap-3">
                                <span className="text-xs text-gray-500 w-32 truncate">{name}</span>
                                <div className="flex-1 bg-gray-100 rounded-full h-2">
                                  <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${(value / total) * 100}%` }} />
                                </div>
                                <span className="text-xs text-gray-500 w-14 text-right">{value} ({Math.round((value / total) * 100)}%)</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Export */}
      <div className="flex flex-wrap gap-3">
        <Button className="bg-blue-600 hover:bg-blue-700" onClick={exportPDF} disabled={generating || filtered.length === 0}>
          {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
          {generating ? "Gerando PDF..." : "Exportar Relatório PDF (com IA)"}
        </Button>
        <Button variant="outline" onClick={exportTXT} disabled={generating || filtered.length === 0}>
          <FileText className="w-4 h-4 mr-2" /> Exportar TXT
        </Button>
        <Button variant="outline" onClick={exportKML} disabled={filtered.filter(i => i.latitude).length === 0}>
          <Map className="w-4 h-4 mr-2" /> Exportar KML
        </Button>
      </div>
    </div>
  );
}