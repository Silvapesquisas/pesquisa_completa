import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, FileText, Users, TrendingUp } from "lucide-react";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [surveys, setSurveys] = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const u = await base44.auth.me().catch(() => null);
      setUser(u);
      if (u?.company_id) {
        const [s, i] = await Promise.all([
          base44.entities.Survey.filter({ company_id: u.company_id }),
          base44.entities.Interview.filter({ company_id: u.company_id }),
        ]).catch(() => [[], []]);
        setSurveys(s);
        setInterviews(i);
      }
      setLoading(false);
    }
    load();
  }, []);

  const activeSurveys = surveys.filter(s => s.status === "ativa").length;
  const completedInterviews = interviews.filter(i => i.status === "concluida").length;
  const pendingInterviews = interviews.filter(i => i.status === "em_andamento").length;

  const stats = [
    { title: "Pesquisas Ativas", value: activeSurveys, total: surveys.length, icon: ClipboardList, color: "text-blue-600" },
    { title: "Entrevistas Concluídas", value: completedInterviews, total: interviews.length, icon: FileText, color: "text-green-600" },
    { title: "Em Andamento", value: pendingInterviews, total: interviews.length, icon: TrendingUp, color: "text-amber-600" },
    { title: "Total de Pesquisas", value: surveys.length, icon: Users, color: "text-purple-600" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        {user && <p className="text-sm text-gray-500 mt-1">Bem-vindo, {user.full_name || user.email}</p>}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
                {stat.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
              {stat.total !== undefined && stat.total !== stat.value && (
                <p className="text-xs text-gray-400 mt-1">de {stat.total} total</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pesquisas Recentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {surveys.slice(0, 5).map(s => (
              <div key={s.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <span className="text-sm text-gray-800 truncate flex-1 mr-2">{s.title}</span>
                <Badge variant={s.status === "ativa" ? "default" : "secondary"} className="text-xs shrink-0">
                  {s.status}
                </Badge>
              </div>
            ))}
            {surveys.length === 0 && <p className="text-sm text-gray-400">Nenhuma pesquisa encontrada.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Entrevistas Recentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {interviews.slice(0, 5).map(i => (
              <div key={i.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <span className="text-sm text-gray-800 truncate flex-1 mr-2">{i.survey_title || "—"}</span>
                <Badge variant={i.status === "concluida" ? "default" : "secondary"} className="text-xs shrink-0">
                  {i.status}
                </Badge>
              </div>
            ))}
            {interviews.length === 0 && <p className="text-sm text-gray-400">Nenhuma entrevista encontrada.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}