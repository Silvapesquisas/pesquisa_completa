import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Loader2, BarChart2, Map, PieChart, Users, FileType, FileSpreadsheet, ChevronDown, ChevronUp } from "lucide-react";
import * as XLSX from "xlsx";
import { format, isAfter, isBefore, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BarChartCard, PieChartCard } from "@/components/reports/InterviewCharts";
import { generatePDF } from "@/components/reports/pdfExport.jsx";
import { generateDOCX } from "@/components/reports/docxExport";
import { buildReportModel } from "@/components/reports/reportData";
import { renderPointMap } from "@/components/reports/chartImage";
import { captureStreetMap } from "@/components/reports/mapCapture";

const TEMPLATE_DEFAULTS = {
  eleitoral: { metodologia: true, mapa: true, resultados: true, cruzamentos: true, analise: true },
  populacional: { metodologia: true, mapa: true, resultados: true, cruzamentos: false, analise: true },
  executivo: { metodologia: false, mapa: true, resultados: true, cruzamentos: false, analise: false },
};
const TEMPLATE_LABEL = { eleitoral: "Opinião Pública / Eleitoral", populacional: "Populacional / Descritivo", executivo: "Executivo / Resumido" };
const CHART_LABEL = { bar: "Barras horizontais", column: "Colunas verticais", pie: "Pizza", donut: "Rosca" };

export default function Reports() {
  const [surveys, setSurveys] = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [company, setCompany] = useState(null);
  const [selectedSurvey, setSelectedSurvey] = useState("todos");
  const [selectedInterviewer, setSelectedInterviewer] = useState("todos");
  const [selectedStatus, setSelectedStatus] = useState("concluida");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  // Recorte por resposta: só entrevistas em que a questão X foi respondida com Y
  const [filterQuestion, setFilterQuestion] = useState("todas");
  const [filterAnswer, setFilterAnswer] = useState("todas");
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg] = useState("");
  const [preview, setPreview] = useState(false);

  // Construtor de relatório
  const [template, setTemplate] = useState("eleitoral");
  const [chartType, setChartType] = useState("bar");
  const [mapMode, setMapMode] = useState("pontos"); // none | pontos | ruas
  const [includeLogo, setIncludeLogo] = useState(true);
  const [sections, setSections] = useState(TEMPLATE_DEFAULTS.eleitoral);
  const [deselected, setDeselected] = useState([]);      // ids de entrevistas desmarcadas
  const [excludedQ, setExcludedQ] = useState([]);        // ids de questões desmarcadas
  const [pickInterviews, setPickInterviews] = useState(false);
  const [pickQuestions, setPickQuestions] = useState(false);

  useEffect(() => { setSections(TEMPLATE_DEFAULTS[template]); }, [template]);

  useEffect(() => {
    const load = async () => {
      const me = await base44.auth.me();
      const companyId = me?.company_id;
      const [sv, iv, co] = await Promise.all([
        companyId ? base44.entities.Survey.filter({ company_id: companyId }) : base44.entities.Survey.list(),
        companyId ? base44.entities.Interview.filter({ company_id: companyId }, "-completed_at", 500) : base44.entities.Interview.list("-completed_at", 500),
        companyId ? base44.entities.Company.filter({ id: companyId }) : Promise.resolve([]),
      ]);
      setSurveys(sv);
      setInterviews(iv);
      setCompany(co?.[0] || null);
    };
    load().catch(() => {});
  }, []);

  const filtered = interviews.filter(i => {
    const matchSurvey = selectedSurvey === "todos" || i.survey_id === selectedSurvey;
    const matchInterviewer = selectedInterviewer === "todos" || i.interviewer_name === selectedInterviewer;
    const matchStatus = selectedStatus === "todos" || i.status === selectedStatus;
    const dt = i.completed_at || i.created_date;
    const matchFrom = !dateFrom || (dt && isAfter(parseISO(dt), parseISO(dateFrom)));
    const matchTo = !dateTo || (dt && isBefore(parseISO(dt), parseISO(dateTo + "T23:59:59")));
    const matchAnswer = filterQuestion === "todas" || filterAnswer === "todas" || (() => {
      const a = (i.answers || []).find(x => x.question_id === filterQuestion);
      if (!a) return false;
      const vals = a.answer_array?.length ? a.answer_array : [a.answer];
      return vals.includes(filterAnswer);
    })();
    return matchSurvey && matchInterviewer && matchStatus && matchFrom && matchTo && matchAnswer;
  });

  // Entrevistas efetivamente incluídas no relatório (filtro − desmarcadas)
  const effective = filtered.filter(i => !deselected.includes(i.id));
  const surveyObj = surveys.find(s => s.id === selectedSurvey);
  const interviewers = [...new Set(interviews.map(i => i.interviewer_name).filter(Boolean))];

  const byInterviewer = (() => {
    const map = {};
    filtered.forEach(i => { const n = i.interviewer_name || "—"; map[n] = (map[n] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);
  })();
  const byStatus = [
    { name: "Concluída", value: interviews.filter(i => i.status === "concluida").length },
    { name: "Em andamento", value: interviews.filter(i => i.status === "em_andamento").length },
    { name: "Revisão", value: interviews.filter(i => i.status === "revisao").length },
  ].filter(s => s.value > 0);

  const questionStats = (() => {
    if (!effective.length || selectedSurvey === "todos" || !surveyObj?.questions) return [];
    return surveyObj.questions.map(q => {
      const allAnswers = effective.flatMap(i => (i.answers || []).filter(a => a.question_id === q.id));
      const counts = {};
      allAnswers.forEach(a => { const vals = a.answer_array?.length ? a.answer_array : [a.answer]; vals.forEach(v => { if (v) counts[v] = (counts[v] || 0) + 1; }); });
      return { question: q, counts, total: allAnswers.length };
    });
  })();

  const toggle = (arr, setArr, id) => setArr(arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]);

  // Valores possíveis para o recorte por resposta: opções da questão + o que
  // foi de fato respondido em campo.
  const answerOptions = (() => {
    if (filterQuestion === "todas" || !surveyObj) return [];
    const q = surveyObj.questions?.find(x => x.id === filterQuestion);
    const set = new Set((q?.options || []).filter(Boolean));
    if (q?.type === "sim_nao") { set.add("Sim"); set.add("Não"); }
    if (q?.type === "escala") ["1", "2", "3", "4", "5"].forEach(v => set.add(v));
    interviews.filter(i => i.survey_id === surveyObj.id).forEach(i => {
      const a = (i.answers || []).find(x => x.question_id === filterQuestion);
      if (!a) return;
      (a.answer_array?.length ? a.answer_array : [a.answer]).filter(Boolean).forEach(v => set.add(v));
    });
    return [...set];
  })();

  // Dados brutos em Excel: 1 aba com uma linha por entrevista (colunas = questões
  // escolhidas), 1 aba com o somatório por questão e 1 aba de informações.
  // Respeita a seleção de entrevistas e de questões do construtor.
  const exportXLSX = () => {
    if (effective.length === 0) { alert("Nenhuma entrevista selecionada para exportar."); return; }
    const includedQs = surveyObj?.questions ? surveyObj.questions.filter(q => !excludedQ.includes(q.id)) : [];
    const answerOf = (iv, qid) => {
      const a = (iv.answers || []).find(x => x.question_id === qid);
      if (!a) return "";
      return a.answer_array?.length ? a.answer_array.join("; ") : (a.answer || "");
    };

    const rawRows = effective.map((iv, idx) => {
      const row = {
        "#": idx + 1,
        "Pesquisa": iv.survey_title || "",
        "Entrevistador": iv.interviewer_name || "",
        "Data": iv.completed_at ? format(new Date(iv.completed_at), "dd/MM/yyyy HH:mm") : "",
        "Status": iv.status || "",
        "Latitude": iv.latitude ?? "",
        "Longitude": iv.longitude ?? "",
        "Áudio": iv.audio_url ? "Sim" : "Não",
        "Observações": iv.notes || "",
      };
      if (includedQs.length) {
        includedQs.forEach((q, qi) => { row[`Q${qi + 1}. ${q.text}`] = answerOf(iv, q.id); });
      } else {
        // Sem pesquisa específica: usa o texto da questão gravado em cada resposta
        (iv.answers || []).forEach((a, ai) => {
          row[a.question_text || `Questão ${ai + 1}`] = a.answer_array?.length ? a.answer_array.join("; ") : (a.answer || "");
        });
      }
      return row;
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rawRows), "Dados brutos");

    if (includedQs.length) {
      const summaryRows = [];
      includedQs.forEach((q, qi) => {
        const counts = {};
        let qTotal = 0;
        effective.forEach(iv => {
          const a = (iv.answers || []).find(x => x.question_id === q.id);
          if (!a) return;
          const vals = (a.answer_array?.length ? a.answer_array : [a.answer]).filter(Boolean);
          if (vals.length) qTotal++;
          vals.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
        });
        Object.entries(counts).sort((x, y) => y[1] - x[1]).forEach(([opt, n]) => {
          summaryRows.push({
            "Questão": `Q${qi + 1}. ${q.text}`,
            "Resposta": opt,
            "Qtd": n,
            "%": qTotal > 0 ? Number(((n / qTotal) * 100).toFixed(1)) : 0,
            "Respondentes": qTotal,
          });
        });
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Somatório por questão");
    }

    const filterQText = filterQuestion !== "todas"
      ? surveyObj?.questions?.find(q => q.id === filterQuestion)?.text || "—"
      : "—";
    const infoRows = [
      { "Campo": "Pesquisa", "Valor": surveyObj?.title || "Todas" },
      { "Campo": "Entrevistas exportadas", "Valor": effective.length },
      { "Campo": "Entrevistas no filtro", "Valor": filtered.length },
      { "Campo": "Questões incluídas", "Valor": includedQs.length ? `${includedQs.length} de ${surveyObj.questions.length}` : "Todas" },
      { "Campo": "Período", "Valor": `${dateFrom || "—"} a ${dateTo || "—"}` },
      { "Campo": "Entrevistador", "Valor": selectedInterviewer === "todos" ? "Todos" : selectedInterviewer },
      { "Campo": "Status", "Valor": selectedStatus },
      { "Campo": "Recorte por resposta", "Valor": filterQuestion === "todas" ? "—" : `${filterQText} = ${filterAnswer === "todas" ? "todas" : filterAnswer}` },
      { "Campo": "Gerado em", "Valor": format(new Date(), "dd/MM/yyyy HH:mm") },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(infoRows), "Informações");

    XLSX.writeFile(wb, `dados-brutos-${(surveyObj?.title || "pesquisas").slice(0, 25).replace(/\s+/g, "-")}-${format(new Date(), "yyyyMMdd-HHmm")}.xlsx`);
  };

  const buildAiText = async (model) => {
    const questionSummary = model.questions.map((q, i) =>
      `Q${i + 1}: "${q.text}" — ${q.total} respostas. Distribuição: ${q.data.slice(0, 8).map(d => `${d.name}: ${d.value} (${q.total > 0 ? ((d.value / q.total) * 100).toFixed(1) : 0}%)`).join("; ")}`
    ).join("\n");
    const prompt = `Você é especialista em pesquisas de opinião pública. Escreva uma ANÁLISE QUALITATIVA E CONCLUSÕES para o relatório abaixo, em português brasileiro, com linguagem formal e técnica.

PESQUISA: ${model.title}
PERÍODO: ${model.periodStart} a ${model.periodEnd}
TOTAL DE ENTREVISTAS: ${model.total}
MARGEM DE ERRO: ${model.marginError}% (IC 95%)

RESULTADOS POR QUESTÃO:
${questionSummary || "Sem dados."}

Estruture com: 1. SÍNTESE DOS RESULTADOS; 2. ANÁLISE POR QUESTÃO; 3. PADRÕES IDENTIFICADOS; 4. CONCLUSÕES E RECOMENDAÇÕES.`;
    try { return await base44.integrations.Core.InvokeLLM({ prompt, model: "claude_sonnet_4_6" }); }
    catch { return "Análise qualitativa não disponível (falha ao gerar)."; }
  };

  const buildMapImage = async (model) => {
    if (!sections.mapa || mapMode === "none" || model.coords.length === 0) return null;
    if (mapMode === "ruas") {
      setGenMsg("Capturando mapa com ruas...");
      const street = await captureStreetMap(model.coords);
      if (street) return street;
      // fallback transparente para pontos
    }
    return renderPointMap({ coords: model.coords });
  };

  const generateReport = async (kind) => {
    if (effective.length === 0) { alert("Nenhuma entrevista selecionada para o relatório."); return; }
    if (sections.resultados && selectedSurvey === "todos") {
      alert("Para incluir resultados por questão, selecione uma pesquisa específica no filtro.");
      return;
    }
    setGenerating(true);
    try {
      const periodStart = dateFrom || undefined;
      const periodEnd = dateTo || undefined;
      setGenMsg("Processando dados...");
      const model = buildReportModel({
        surveyObj,
        interviews: effective,
        options: {
          dateFrom: periodStart, dateTo: periodEnd,
          includeCrosstabs: sections.cruzamentos,
          questionIds: surveyObj?.questions ? surveyObj.questions.filter(q => !excludedQ.includes(q.id)).map(q => q.id) : undefined,
        },
      });

      const mapImg = await buildMapImage(model);
      let aiText = "";
      if (sections.analise) { setGenMsg("Gerando análise com IA..."); aiText = await buildAiText(model); }

      const options = {
        template, chartType, sections,
        logoDataUrl: includeLogo ? (company?.logo_url || null) : null,
        mapDataUrl: mapImg?.dataUrl || null,
        mapWidth: mapImg?.w, mapHeight: mapImg?.h,
        aiText,
      };
      setGenMsg(kind === "docx" ? "Montando DOCX..." : "Montando PDF...");
      if (kind === "docx") await generateDOCX(model, options);
      else await generatePDF(model, options);
    } catch (e) {
      alert("Erro ao gerar relatório: " + (e?.message || "tente novamente."));
    }
    setGenMsg("");
    setGenerating(false);
  };

  const exportKML = () => {
    const withGeo = effective.filter(i => i.latitude && i.longitude);
    if (withGeo.length === 0) { alert("Nenhuma entrevista com geolocalização."); return; }
    const placemarks = withGeo.map(i => {
      const date = i.completed_at ? format(new Date(i.completed_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—";
      return `    <Placemark><name>${i.interviewer_name || "Entrevistador"}</name><description><![CDATA[<b>Data:</b> ${date}<br/><b>Pesquisa:</b> ${i.survey_title || "—"}]]></description><Point><coordinates>${i.longitude},${i.latitude},0</coordinates></Point></Placemark>`;
    }).join("\n");
    const kml = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Entrevistas</name>${placemarks}</Document></kml>`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([kml], { type: "application/vnd.google-earth.kml+xml" }));
    a.download = `entrevistas-${format(new Date(), "yyyyMMdd")}.kml`;
    a.click();
  };

  const SectionToggle = ({ k, label }) => (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <Switch checked={!!sections[k]} onCheckedChange={v => setSections(s => ({ ...s, [k]: v }))} />
      <span className="text-gray-600">{label}</span>
    </label>
  );

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Relatórios</h1>
        <p className="text-gray-500 text-sm mt-1">Monte relatórios personalizados e exporte em PDF, DOCX, TXT ou KML</p>
      </div>

      {/* Filtros */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3"><CardTitle className="text-base">1. Filtros</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <Label className="text-xs text-gray-500 mb-1 block">Pesquisa</Label>
            <Select value={selectedSurvey} onValueChange={v => { setSelectedSurvey(v); setExcludedQ([]); setFilterQuestion("todas"); setFilterAnswer("todas"); }}>
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
          {surveyObj && (
            <>
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Recorte: questão</Label>
                <Select value={filterQuestion} onValueChange={v => { setFilterQuestion(v); setFilterAnswer("todas"); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Sem recorte</SelectItem>
                    {(surveyObj.questions || []).map((q, i) => (
                      <SelectItem key={q.id} value={q.id}>Q{i + 1}. {q.text.slice(0, 45)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Recorte: resposta</Label>
                <Select value={filterAnswer} onValueChange={setFilterAnswer} disabled={filterQuestion === "todas"}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas as respostas</SelectItem>
                    {answerOptions.map(v => <SelectItem key={v} value={v}>{v.slice(0, 45)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-gray-400 mt-1">Ex.: só entrevistas em que "Sexo" = "Feminino".</p>
              </div>
            </>
          )}
          <div className="flex items-end">
            <Button onClick={() => setPreview(true)} variant="outline" className="w-full">
              <BarChart2 className="w-4 h-4 mr-2" /> Pré-visualizar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Selecionadas", value: effective.length },
          { label: "No filtro", value: filtered.length },
          { label: "Com Geo", value: effective.filter(i => i.latitude).length },
          { label: "Com Áudio", value: effective.filter(i => i.audio_url).length },
        ].map(s => (
          <Card key={s.label} className="border-0 shadow-sm">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-400 mt-1">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Construtor */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3"><CardTitle className="text-base">2. Como montar o relatório</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Padrão (template)</Label>
              <Select value={template} onValueChange={setTemplate}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TEMPLATE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Estilo de gráfico</Label>
              <Select value={chartType} onValueChange={setChartType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CHART_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Imagem da localização</Label>
              <Select value={mapMode} onValueChange={setMapMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não incluir</SelectItem>
                  <SelectItem value="pontos">Mapa de pontos (sempre funciona)</SelectItem>
                  <SelectItem value="ruas">Mapa com ruas (precisa de internet)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <SectionToggle k="metodologia" label="Metodologia" />
            <SectionToggle k="mapa" label="Mapa / distribuição" />
            <SectionToggle k="resultados" label="Resultados por questão" />
            <SectionToggle k="cruzamentos" label="Cruzamentos (sexo/idade)" />
            <SectionToggle k="analise" label="Análise com IA" />
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={includeLogo} onCheckedChange={setIncludeLogo} />
            <span className="text-sm text-gray-600">Incluir logomarca da empresa</span>
            {includeLogo && !company?.logo_url && (
              <span className="text-xs text-amber-600">— nenhuma logo cadastrada (adicione em Empresas)</span>
            )}
          </div>

          {/* Seleção de entrevistas */}
          <div className="border-t pt-3">
            <button onClick={() => setPickInterviews(v => !v)} className="flex items-center gap-1 text-sm font-medium text-gray-700">
              {pickInterviews ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              Selecionar entrevistas ({effective.length} de {filtered.length})
            </button>
            {pickInterviews && (
              <div className="mt-2">
                <div className="flex gap-2 mb-2">
                  <Button size="sm" variant="outline" onClick={() => setDeselected([])}>Todas</Button>
                  <Button size="sm" variant="outline" onClick={() => setDeselected(filtered.map(i => i.id))}>Nenhuma</Button>
                </div>
                <div className="max-h-56 overflow-y-auto border rounded-lg divide-y">
                  {filtered.map(i => (
                    <label key={i.id} className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-gray-50">
                      <input type="checkbox" checked={!deselected.includes(i.id)} onChange={() => toggle(deselected, setDeselected, i.id)} />
                      <span className="flex-1 truncate">{i.interviewer_name || "—"} · {i.completed_at ? format(new Date(i.completed_at), "dd/MM HH:mm") : "—"} {i.latitude ? "· GPS" : ""} {i.audio_url ? "· áudio" : ""}</span>
                    </label>
                  ))}
                  {filtered.length === 0 && <p className="text-xs text-gray-400 p-3">Nenhuma entrevista no filtro.</p>}
                </div>
              </div>
            )}
          </div>

          {/* Seleção de questões */}
          {surveyObj?.questions?.length > 0 && (
            <div className="border-t pt-3">
              <button onClick={() => setPickQuestions(v => !v)} className="flex items-center gap-1 text-sm font-medium text-gray-700">
                {pickQuestions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Selecionar questões ({surveyObj.questions.length - excludedQ.length} de {surveyObj.questions.length})
              </button>
              {pickQuestions && (
                <div className="mt-2">
                  <div className="flex gap-2 mb-2">
                    <Button size="sm" variant="outline" onClick={() => setExcludedQ([])}>Todas</Button>
                    <Button size="sm" variant="outline" onClick={() => setExcludedQ(surveyObj.questions.map(q => q.id))}>Nenhuma</Button>
                  </div>
                  <div className="max-h-56 overflow-y-auto border rounded-lg divide-y">
                    {surveyObj.questions.map((q, idx) => (
                      <label key={q.id} className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-gray-50">
                        <input type="checkbox" checked={!excludedQ.includes(q.id)} onChange={() => toggle(excludedQ, setExcludedQ, q.id)} />
                        <span className="flex-1">Q{idx + 1}. {q.text}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pré-visualização */}
      {preview && (
        <Tabs defaultValue="charts" className="space-y-4">
          <TabsList>
            <TabsTrigger value="charts"><BarChart2 className="w-4 h-4 mr-1" /> Gráficos</TabsTrigger>
            <TabsTrigger value="questions"><PieChart className="w-4 h-4 mr-1" /> Por Questão</TabsTrigger>
          </TabsList>
          <TabsContent value="charts" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="border-0 shadow-sm"><CardContent className="p-5"><BarChartCard data={byInterviewer} title="Entrevistas por Entrevistador" /></CardContent></Card>
              <Card className="border-0 shadow-sm"><CardContent className="p-5"><PieChartCard data={byStatus} title="Distribuição por Status" /></CardContent></Card>
            </div>
          </TabsContent>
          <TabsContent value="questions">
            {selectedSurvey === "todos" ? (
              <Card className="border-0 shadow-sm"><CardContent className="p-8 text-center text-gray-400 text-sm">Selecione uma pesquisa específica para ver os resultados por questão.</CardContent></Card>
            ) : (
              <Card className="border-0 shadow-sm"><CardContent className="p-5 space-y-6">
                {questionStats.filter(qs => Object.keys(qs.counts).length > 0).map(({ question, counts, total }) => {
                  const chartData = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name: name.slice(0, 20), value }));
                  return (
                    <div key={question.id} className="border-b pb-5 last:border-0">
                      <p className="text-sm font-medium text-gray-700 mb-3">{question.text}</p>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4"><BarChartCard data={chartData} /><PieChartCard data={chartData} /></div>
                    </div>
                  );
                })}
                {questionStats.filter(qs => Object.keys(qs.counts).length > 0).length === 0 && <p className="text-sm text-gray-400">Sem dados para os filtros atuais.</p>}
              </CardContent></Card>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Exportar */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3"><CardTitle className="text-base">3. Gerar</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-3 items-center">
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => generateReport("pdf")} disabled={generating || effective.length === 0}>
            {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />} Gerar PDF
          </Button>
          <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => generateReport("docx")} disabled={generating || effective.length === 0}>
            {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileType className="w-4 h-4 mr-2" />} Gerar DOCX
          </Button>
          <Button className="bg-green-600 hover:bg-green-700" onClick={exportXLSX} disabled={effective.length === 0}>
            <FileSpreadsheet className="w-4 h-4 mr-2" /> Exportar Excel (dados brutos)
          </Button>
          <Button variant="outline" onClick={exportKML} disabled={effective.filter(i => i.latitude).length === 0}>
            <Map className="w-4 h-4 mr-2" /> Exportar KML
          </Button>
          {generating && genMsg && <span className="text-sm text-gray-500">{genMsg}</span>}
        </CardContent>
      </Card>
    </div>
  );
}
