import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, RefreshCw } from "lucide-react";
import ReactMarkdown from "react-markdown";

export default function AIInsightsWidget({ interviews }) {
  const [insights, setInsights] = useState("");
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const generate = async () => {
    if (!interviews?.length) return;
    setLoading(true);
    const recent = interviews.slice(0, 20);
    const prompt = `Analise as seguintes entrevistas de pesquisa de campo recentes e forneça de 3 a 5 "principais descobertas" em formato de bullet points curtos e objetivos (máximo 2 linhas cada). Seja direto e focado em insights acionáveis.

Entrevistas analisadas: ${recent.length}
Pesquisas envolvidas: ${[...new Set(recent.map(i => i.survey_title))].filter(Boolean).join(", ")}
Entrevistadores: ${[...new Set(recent.map(i => i.interviewer_name))].filter(Boolean).join(", ")}

Amostras de respostas:
${recent.slice(0, 8).map(i => `- ${i.survey_title}: ${(i.answers || []).slice(0, 3).map(a => `${a.question_text}: ${a.answer || a.answer_array?.join(", ")}`).join("; ")}`).join("\n")}

Forneça insights sobre padrões, tendências e pontos de atenção em português.`;

    const result = await base44.integrations.Core.InvokeLLM({ prompt });
    setInsights(result);
    setGenerated(true);
    setLoading(false);
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-500" />
            Principais Descobertas (IA)
          </CardTitle>
          {generated && (
            <Button size="sm" variant="ghost" onClick={generate} disabled={loading}>
              <RefreshCw className="w-3 h-3" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!generated ? (
          <div className="text-center py-6">
            <Sparkles className="w-8 h-8 text-purple-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400 mb-4">Use IA para resumir os padrões das entrevistas recentes.</p>
            <Button onClick={generate} disabled={loading || !interviews?.length} className="bg-purple-600 hover:bg-purple-700">
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              {loading ? "Analisando..." : "Gerar Insights"}
            </Button>
          </div>
        ) : loading ? (
          <div className="flex items-center gap-3 py-4 text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Analisando entrevistas...</span>
          </div>
        ) : (
          <div className="prose prose-sm max-w-none text-gray-700">
            <ReactMarkdown>{insights}</ReactMarkdown>
          </div>
        )}
      </CardContent>
    </Card>
  );
}