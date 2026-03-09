import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClipboardList, Users, MapPin, TrendingUp, Plus, ArrowRight, Download, CheckCircle2, HardDrive } from "lucide-react";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";
import SyncErrorBanner from "@/components/fieldapp/SyncErrorBanner";
import { useOfflineSync } from "@/components/fieldapp/useOfflineSync";
import AIInsightsWidget from "@/components/dashboard/AIInsightsWidget";
import InterviewMap from "@/components/dashboard/InterviewMap";
import InterviewerPerformance from "@/components/dashboard/InterviewerPerformance";
import InterviewHeatmap from "@/components/dashboard/InterviewHeatmap";

export default function Dashboard() {
  const [surveys, setSurveys] = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const { drafts, offlineSurveys, downloadSurvey, removeSurveyOffline, isOnline } = useOfflineSync();

  useEffect(() => {
    base44.auth.me().then(async (me) => {
      const companyId = me?.company_id;
      const [s, i, u] = await Promise.all([
        companyId
          ? base44.entities.Survey.filter({ company_id: companyId }, "-created_date", 50)
          : base44.entities.Survey.list("-created_date", 50),
        companyId
          ? base44.entities.Interview.filter({ company_id: companyId }, "-created_date", 50)
          : base44.entities.Interview.list("-created_date", 50),
        base44.entities.User.list(),
      ]);
      setSurveys(s);
      setInterviews(i);
      setUsers(u);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const offlineIds = new Set(offlineSurveys.map(s => s.id));
  const activeSurveysList = surveys.filter(s => s.status === "ativa");

  const activeSurveys = surveys.filter(s => s.status === "ativa").length;
  const completedInterviews = interviews.filter(i => i.status === "concluida").length;
  const activeInterviewers = users.filter(u => u.role === "entrevistador" && u.active !== false).length;
  const withGeo = interviews.filter(i => i.latitude && i.longitude).length;

  const stats = [
    { title: "Pesquisas Ativas", value: activeSurveys, icon: ClipboardList, color: "text-blue-600", bg: "bg-blue-50" },
    { title: "Entrevistas Concluídas", value: completedInterviews, icon: TrendingUp, color: "text-green-600", bg: "bg-green-50" },
    { title: "Entrevistadores", value: activeInterviewers, icon: Users, color: "text-purple-600", bg: "bg-purple-50" },
    { title: "Com Geolocalização", value: withGeo, icon: MapPin, color: "text-orange-600", bg: "bg-orange-50" },
  ];

  const recentInterviews = interviews.slice(0, 5);

  return (
    <div className="max-w-7xl mx-auto">
      {!bannerDismissed && (
        <SyncErrorBanner
          drafts={drafts}
          onGoToDrafts={() => { window.location.href = createPageUrl("FieldApp"); }}
          onDismiss={() => setBannerDismissed(true)}
        />
      )}
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Visão geral da plataforma de pesquisas de campo</p>
        </div>
        <Link to={createPageUrl("SurveyBuilder")}>
          <Button className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" /> Nova Pesquisa
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.title} className="border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">{s.title}</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{loading ? "—" : s.value}</p>
                </div>
                <div className={`p-3 rounded-xl ${s.bg}`}>
                  <s.icon className={`w-6 h-6 ${s.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Pesquisas Recentes</CardTitle>
              <Link to={createPageUrl("Surveys")} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                Ver todas <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? <p className="text-gray-400 text-sm">Carregando...</p> : surveys.slice(0, 5).map(s => (
              <div key={s.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="font-medium text-sm text-gray-800">{s.title}</p>
                  <p className="text-xs text-gray-400 capitalize">{s.category}</p>
                </div>
                <Badge variant={s.status === "ativa" ? "default" : "secondary"} className="capitalize text-xs">
                  {s.status}
                </Badge>
              </div>
            ))}
            {!loading && surveys.length === 0 && <p className="text-gray-400 text-sm">Nenhuma pesquisa criada ainda.</p>}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Entrevistas Recentes</CardTitle>
              <Link to={createPageUrl("Interviews")} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                Ver todas <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? <p className="text-gray-400 text-sm">Carregando...</p> : recentInterviews.map(i => (
              <div key={i.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="font-medium text-sm text-gray-800">{i.survey_title || "Pesquisa"}</p>
                  <p className="text-xs text-gray-400">{i.interviewer_name} {i.latitude ? "• 📍" : ""} {i.audio_url ? "• 🎙️" : ""}</p>
                </div>
                <Badge variant={i.status === "concluida" ? "default" : "secondary"} className="text-xs capitalize">
                  {i.status?.replace("_", " ")}
                </Badge>
              </div>
            ))}
            {!loading && interviews.length === 0 && <p className="text-gray-400 text-sm">Nenhuma entrevista realizada ainda.</p>}
          </CardContent>
        </Card>
      </div>

      {/* AI Insights + Map + Performance */}
      <AIInsightsWidget interviews={interviews} />
      <InterviewMap interviews={interviews} surveys={surveys} />
      <InterviewerPerformance interviews={interviews} />

      {/* Offline surveys management */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-blue-500" />
              Pesquisas para Uso Offline
            </CardTitle>
            {!isOnline && <Badge variant="outline" className="text-orange-600 border-orange-300 text-xs">Sem conexão</Badge>}
          </div>
          <p className="text-xs text-gray-400 mt-1">Baixe pesquisas para realizar entrevistas sem internet.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <p className="text-gray-400 text-sm">Carregando...</p>
          ) : activeSurveysList.length === 0 ? (
            <p className="text-gray-400 text-sm">Nenhuma pesquisa ativa no momento.</p>
          ) : activeSurveysList.map(s => {
            const isDownloaded = offlineIds.has(s.id);
            return (
              <div key={s.id} className="flex items-center justify-between py-2.5 border-b last:border-0 gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm text-gray-800 truncate">{s.title}</p>
                    {isDownloaded && (
                      <span className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full shrink-0">
                        <CheckCircle2 className="w-3 h-3" /> Offline
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 capitalize mt-0.5">{s.category} · {s.questions?.length || 0} questões</p>
                </div>
                {isOnline && (
                  isDownloaded ? (
                    <Button size="sm" variant="ghost" onClick={() => removeSurveyOffline(s.id)} className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0">
                      Remover
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => downloadSurvey(s)} className="text-xs shrink-0">
                      <Download className="w-3 h-3 mr-1" /> Baixar
                    </Button>
                  )
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
      </div>
      </div>
      );
      }