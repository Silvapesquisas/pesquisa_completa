import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MapPin, Mic, Clock, Edit, History, UserCheck } from "lucide-react";
import { createPageUrl } from "@/utils";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function InterviewDetail() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const [interview, setInterview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [audioSrc, setAudioSrc] = useState(null);

  useEffect(() => {
    if (!id) return;
    // Busca apenas o registro pedido; o RLS no servidor garante que só
    // entrevistas da empresa do usuário sejam retornadas
    base44.entities.Interview.filter({ id })
      .then(list => setInterview(list[0] || null))
      .catch(() => setInterview(null))
      .finally(() => setLoading(false));
  }, [id]);

  // Gera a URL assinada do áudio (bucket privado) quando a entrevista carrega.
  useEffect(() => {
    let active = true;
    setAudioSrc(null);
    if (interview?.audio_url) {
      base44.storage.signedAudioUrl(interview.audio_url).then(u => { if (active) setAudioSrc(u); });
    }
    return () => { active = false; };
  }, [interview?.audio_url]);

  if (loading) return <div className="p-6 text-gray-400">Carregando...</div>;
  if (!interview) return <div className="p-6 text-gray-400">Entrevista não encontrada.</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(createPageUrl("Interviews"))}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
        </Button>
        <h1 className="text-xl font-bold text-gray-900">Detalhes da Entrevista</h1>
        <Button size="sm" variant="outline" onClick={() => navigate(createPageUrl(`InterviewEdit?id=${id}`))}>
          <Edit className="w-3 h-3 mr-1" /> Editar
        </Button>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-base">Informações Gerais</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-400">Pesquisa</p>
            <p className="font-medium">{interview.survey_title || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Entrevistador</p>
            <p className="font-medium">{interview.interviewer_name || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Status</p>
            <Badge variant={interview.status === "concluida" ? "default" : "secondary"} className="capitalize text-xs">
              {interview.status?.replace("_", " ")}
            </Badge>
          </div>
          {interview.completed_at && (
            <div>
              <p className="text-xs text-gray-400">Concluída em</p>
              <p className="font-medium">{format(new Date(interview.completed_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
            </div>
          )}
          {interview.latitude && (
            <div className="col-span-2">
              <p className="text-xs text-gray-400 flex items-center gap-1"><MapPin className="w-3 h-3" /> Localização</p>
              <p className="font-medium text-green-600">{interview.latitude.toFixed(6)}, {interview.longitude.toFixed(6)}</p>
              {interview.location_address && <p className="text-xs text-gray-400">{interview.location_address}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {interview.audio_url && (
        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Mic className="w-4 h-4" /> Áudio da Entrevista</CardTitle></CardHeader>
          <CardContent>
            {audioSrc ? (
              <>
                <audio controls src={audioSrc} className="w-full" />
                <a href={audioSrc} download className="text-xs text-blue-600 hover:underline inline-block mt-2">Baixar áudio</a>
              </>
            ) : (
              <p className="text-xs text-gray-400">Carregando áudio…</p>
            )}
            {interview.audio_duration && (
              <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Duração: {Math.round(interview.audio_duration)}s
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-base">Respostas ({interview.answers?.length || 0})</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {(interview.answers || []).map((a, i) => (
            <div key={i} className="border-b pb-3 last:border-0">
              <p className="text-xs text-gray-400 mb-1">Q{i + 1} · {a.question_type}</p>
              <p className="text-sm font-medium text-gray-700">{a.question_text}</p>
              <div className="mt-1">
                {a.answer_array?.length > 0 ? (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {a.answer_array.map((v, j) => <Badge key={j} variant="secondary" className="text-xs">{v}</Badge>)}
                  </div>
                ) : (
                  <p className="text-sm text-gray-600 bg-gray-50 rounded px-3 py-2">{a.answer || <span className="text-gray-300 italic">Sem resposta</span>}</p>
                )}
              </div>
            </div>
          ))}
          {(!interview.answers || interview.answers.length === 0) && (
            <p className="text-sm text-gray-400">Nenhuma resposta registrada.</p>
          )}
        </CardContent>
      </Card>

      {interview.notes && (
        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-base">Observações do Entrevistador</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-gray-600">{interview.notes}</p></CardContent>
        </Card>
      )}

      {/* Audit log — always visible */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-gray-700">
            <History className="w-4 h-4 text-blue-600" /> Histórico de Auditoria
            <Badge variant="secondary" className="ml-auto text-xs font-normal">
              {1 + (interview.edit_history?.length || 0)} evento(s)
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Edits — newest first */}
          {[...(interview.edit_history || [])].reverse().map((h, i) => (
            <div key={i} className="flex gap-3 text-sm">
              <div className="flex flex-col items-center gap-1 shrink-0">
                <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center">
                  <Edit className="w-3.5 h-3.5 text-orange-600" />
                </div>
                <div className="w-px flex-1 bg-gray-200 min-h-[12px]" />
              </div>
              <div className="pb-3 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-800">{h.edited_by_name || h.edited_by}</span>
                  <Badge variant="outline" className="text-xs border-orange-200 text-orange-700">Editou</Badge>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {h.edited_at ? format(new Date(h.edited_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : "—"}
                </p>
                {h.changes_summary && (
                  <p className="text-xs text-gray-500 mt-1 bg-gray-50 rounded px-2 py-1 break-words">{h.changes_summary}</p>
                )}
              </div>
            </div>
          ))}

          {/* Creation entry — always at the bottom */}
          <div className="flex gap-3 text-sm">
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center">
                <UserCheck className="w-3.5 h-3.5 text-green-600" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-gray-800">{interview.interviewer_name || "Entrevistador"}</span>
                <Badge variant="outline" className="text-xs border-green-200 text-green-700">Criou</Badge>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {interview.completed_at
                  ? format(new Date(interview.completed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                  : interview.created_date
                    ? format(new Date(interview.created_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                    : "—"}
              </p>
              <p className="text-xs text-gray-500 mt-1 bg-gray-50 rounded px-2 py-1">
                Entrevista registrada via App de Campo · {interview.answers?.length || 0} resposta(s)
                {interview.latitude ? ` · GPS: ${interview.latitude.toFixed(5)}, ${interview.longitude.toFixed(5)}` : ""}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}