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

export default function Dashboard() {
  const [surveys, setSurveys] = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const { drafts, offlineSurveys, downloadSurvey, removeSurveyOffline, isOnline } = useOfflineSync();

  useEffect(() => {
    Promise.all([
      base44.entities.Survey.list("-created_date", 50),
      base44.entities.Interview.list("-created_date", 50),
      base44.entities.User.list(),
    ]).then(([s, i, u]) => {
      setSurveys(s);
      setInterviews(i);
      setUsers(u);
      setLoading(false);
    });
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
    <div className="p-6 max-w-7xl mx-auto space-y-6">
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
    </div>
  );
}