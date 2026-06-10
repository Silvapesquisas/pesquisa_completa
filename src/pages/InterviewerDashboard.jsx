import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Target, CheckCircle2, Clock, TrendingUp, Award, Calendar, MapPin, Wifi, WifiOff, RefreshCw, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useOfflineSync } from "@/components/fieldapp/useOfflineSync";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

const FIELD_USER_KEY = "fieldapp_user";

function formatDate(date) {
  return new Date(date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function CircularProgress({ value, max, size = 100, strokeWidth = 10, color = "#2563eb" }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const offset = circumference * (1 - pct);
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={strokeWidth} />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.6s ease" }} />
    </svg>
  );
}

function SurveyGoalCard({ survey, myCount, limit, todayCount }) {
  const hasLimit = limit !== null && limit !== undefined;
  const pct = hasLimit ? Math.min(Math.round((myCount / limit) * 100), 100) : null;
  const remaining = hasLimit ? Math.max(limit - myCount, 0) : null;
  const done = hasLimit && myCount >= limit;

  const color = done ? "#16a34a" : pct > 70 ? "#f59e0b" : "#2563eb";

  return (
    <div className={`bg-white rounded-2xl p-4 shadow-sm border-2 ${done ? "border-green-200" : "border-gray-100"}`}>
      <div className="flex items-start gap-4">
        <div className="relative shrink-0">
          <CircularProgress value={myCount} max={hasLimit ? limit : Math.max(myCount, 1)} size={72} strokeWidth={8} color={color} />
          <div className="absolute inset-0 flex items-center justify-center">
            {done
              ? <CheckCircle2 className="w-5 h-5 text-green-600" />
              : <span className="text-xs font-bold text-gray-700">{hasLimit ? `${pct}%` : myCount}</span>}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 text-sm leading-snug truncate">{survey.title}</h3>
          <div className="flex flex-wrap gap-2 mt-1.5">
            <span className="text-xs text-gray-500">{myCount} realizadas</span>
            {hasLimit && (
              <>
                <span className="text-gray-300">·</span>
                <span className={`text-xs font-medium ${done ? "text-green-600" : "text-blue-600"}`}>
                  {done ? "Meta atingida!" : `${remaining} restantes`}
                </span>
                <span className="text-gray-300">·</span>
                <span className="text-xs text-gray-400">meta: {limit}</span>
              </>
            )}
            {!hasLimit && <span className="text-xs text-gray-400 italic">sem limite definido</span>}
          </div>
          {todayCount > 0 && (
            <div className="mt-1.5 inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full">
              <Calendar className="w-3 h-3" /> {todayCount} hoje
            </div>
          )}
          {survey.end_date && (
            <div className="mt-1 flex items-center gap-1 text-xs text-gray-400">
              <Clock className="w-3 h-3" /> Até {formatDate(survey.end_date)}
            </div>
          )}
        </div>
        {done && (
          <Badge className="bg-green-100 text-green-700 border-0 shrink-0">✓ Concluído</Badge>
        )}
      </div>
    </div>
  );
}

// ── Login screen ──
function CodeLoginMini({ onLogin }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handle = async () => {
    if (code.length !== 8) { setError("O código deve ter 8 dígitos."); return; }
    setLoading(true); setError("");
    const results = await base44.entities.FieldUser.filter({ access_code: code, active: true });
    if (!results.length) { setError("Código inválido."); setLoading(false); return; }
    const fu = results[0];
    localStorage.setItem(FIELD_USER_KEY, JSON.stringify(fu));
    onLogin(fu);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-indigo-700 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8 space-y-5">
        <div className="text-center">
          <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <KeyRound className="w-7 h-7 text-blue-600" />
          </div>
          <h1 className="text-lg font-bold text-gray-900">Meu Painel</h1>
          <p className="text-sm text-gray-500 mt-1">Digite seu código de acesso para ver seu progresso</p>
        </div>
        <Input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
          placeholder="00000000" className="text-center text-2xl tracking-[0.5em] font-mono font-bold h-14"
          maxLength={8} inputMode="numeric" onKeyDown={e => e.key === "Enter" && handle()} />
        {error && <p className="text-sm text-red-500 text-center">{error}</p>}
        <Button className="w-full h-11 bg-blue-600 hover:bg-blue-700" onClick={handle} disabled={loading || code.length !== 8}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Ver meu painel"}
        </Button>
      </div>
    </div>
  );
}

export default function InterviewerDashboard() {
  const [fieldUser, setFieldUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [surveys, setSurveys] = useState([]);
  const [allMyInterviews, setAllMyInterviews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const { isOnline, drafts } = useOfflineSync();

  useEffect(() => {
    const stored = localStorage.getItem(FIELD_USER_KEY);
    if (stored) {
      try { setFieldUser(JSON.parse(stored)); }
      catch { /* ignore */ }
    }
    setLoadingUser(false);
  }, []);

  const loadData = async (user) => {
    if (!user || !isOnline) return;
    setLoading(true);
    const [freshUsers, allActive, myInterviews] = await Promise.all([
      base44.entities.FieldUser.filter({ access_code: user.access_code, active: true }),
      base44.entities.Survey.filter({ status: "ativa" }),
      base44.entities.Interview.filter({ field_user_id: user.id }),
    ]);

    const freshUser = freshUsers[0] || user;
    localStorage.setItem(FIELD_USER_KEY, JSON.stringify(freshUser));
    setFieldUser(freshUser);

    const assigned = freshUser.assigned_survey_ids || [];
    const mySurveys = assigned.length > 0
      ? allActive.filter(s => assigned.includes(s.id))
      : allActive;

    setSurveys(mySurveys);
    setAllMyInterviews(myInterviews);
    setLastRefresh(new Date());
    setLoading(false);
  };

  useEffect(() => {
    if (fieldUser && isOnline) loadData(fieldUser);
  }, [fieldUser, isOnline]);  

  if (loadingUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!fieldUser) return <CodeLoginMini onLogin={setFieldUser} />;

  // ── Compute stats ──
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayInterviews = allMyInterviews.filter(iv =>
    (iv.completed_at || iv.created_date || "").slice(0, 10) === todayStr
  );
  const completedTotal = allMyInterviews.filter(iv => iv.status === "concluida").length;
  const todayCompleted = todayInterviews.filter(iv => iv.status === "concluida").length;

  // Per-survey counts
  const countBySurvey = {};
  const todayCountBySurvey = {};
  allMyInterviews.forEach(iv => {
    if (iv.status === "concluida") countBySurvey[iv.survey_id] = (countBySurvey[iv.survey_id] || 0) + 1;
    if ((iv.completed_at || iv.created_date || "").slice(0, 10) === todayStr && iv.status === "concluida") {
      todayCountBySurvey[iv.survey_id] = (todayCountBySurvey[iv.survey_id] || 0) + 1;
    }
  });

  const getLimit = (survey) => {
    const personal = fieldUser?.survey_interview_limits?.[survey.id];
    if (personal !== undefined && personal !== null && personal !== "") return Number(personal);
    return survey.max_interviews_per_interviewer || null;
  };

  // Today's target = sum of all remaining limits or 0 if none defined
  const surveysWithLimits = surveys.filter(s => getLimit(s) !== null);
  const totalDayTarget = surveysWithLimits.reduce((acc, s) => {
    const limit = getLimit(s);
    const done = countBySurvey[s.id] || 0;
    return acc + Math.max(limit - done, 0);
  }, 0);

  const allGoalsDone = surveysWithLimits.length > 0 && surveysWithLimits.every(s => {
    const limit = getLimit(s);
    return (countBySurvey[s.id] || 0) >= limit;
  });

  // Recent interviews (last 5)
  const recent = [...allMyInterviews]
    .sort((a, b) => new Date(b.completed_at || b.created_date) - new Date(a.completed_at || a.created_date))
    .slice(0, 5);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-6 pb-10">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-blue-200 text-xs mb-1">Painel do Entrevistador</p>
            <h1 className="text-xl font-bold">{fieldUser.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge className="bg-blue-500 text-white border-0 text-xs capitalize">{fieldUser.role}</Badge>
              {isOnline
                ? <span className="flex items-center gap-1 text-xs text-green-300"><Wifi className="w-3 h-3" /> Online</span>
                : <span className="flex items-center gap-1 text-xs text-red-300"><WifiOff className="w-3 h-3" /> Offline</span>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Button size="sm" variant="ghost" className="text-white hover:bg-blue-500 h-8 px-2"
              onClick={() => loadData(fieldUser)} disabled={loading || !isOnline}>
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <button onClick={() => { localStorage.removeItem(FIELD_USER_KEY); setFieldUser(null); }}
              className="text-xs text-blue-200 hover:text-white">Sair</button>
          </div>
        </div>

        {/* Summary pills */}
        <div className="grid grid-cols-3 gap-3 mt-5">
          <div className="bg-blue-500/50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold">{todayCompleted}</p>
            <p className="text-xs text-blue-200 mt-0.5">Hoje</p>
          </div>
          <div className="bg-blue-500/50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold">{completedTotal}</p>
            <p className="text-xs text-blue-200 mt-0.5">Total</p>
          </div>
          <div className={`rounded-xl p-3 text-center ${allGoalsDone ? "bg-green-500/60" : "bg-blue-500/50"}`}>
            <p className="text-2xl font-bold">{allGoalsDone ? "✓" : totalDayTarget}</p>
            <p className="text-xs text-blue-200 mt-0.5">{allGoalsDone ? "Meta OK!" : "Restantes"}</p>
          </div>
        </div>
      </div>

      <div className="px-4 -mt-5 space-y-4 pb-28">
        {/* Offline drafts alert */}
        {drafts.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
            <WifiOff className="w-5 h-5 text-amber-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-800">{drafts.length} entrevista{drafts.length > 1 ? "s" : ""} salva{drafts.length > 1 ? "s" : ""} offline</p>
              <p className="text-xs text-amber-600">Serão enviadas automaticamente ao reconectar.</p>
            </div>
          </div>
        )}

        {/* Goals per survey */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <Target className="w-4 h-4 text-blue-600" /> Minhas Metas
            </h2>
            {lastRefresh && (
              <span className="text-xs text-gray-400">
                {lastRefresh.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
          ) : !isOnline ? (
            <div className="bg-white rounded-2xl p-6 text-center text-gray-500 shadow-sm">
              <WifiOff className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">Conecte-se para ver suas metas</p>
            </div>
          ) : surveys.length === 0 ? (
            <div className="bg-white rounded-2xl p-6 text-center text-gray-500 shadow-sm">
              <Target className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">Nenhuma pesquisa ativa atribuída</p>
            </div>
          ) : (
            <div className="space-y-3">
              {surveys.map(s => (
                <SurveyGoalCard
                  key={s.id} survey={s}
                  myCount={countBySurvey[s.id] || 0}
                  limit={getLimit(s)}
                  todayCount={todayCountBySurvey[s.id] || 0}
                />
              ))}
            </div>
          )}
        </div>

        {/* Recent interviews */}
        {recent.length > 0 && (
          <div>
            <h2 className="font-bold text-gray-900 flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-indigo-600" /> Últimas Entrevistas
            </h2>
            <div className="space-y-2">
              {recent.map(iv => (
                <div key={iv.id} className="bg-white rounded-xl p-3 shadow-sm flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${iv.status === "concluida" ? "bg-green-500" : "bg-yellow-400"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{iv.survey_title || "Pesquisa"}</p>
                    <p className="text-xs text-gray-400">
                      {formatDate(iv.completed_at || iv.created_date)}
                      {iv.location_address && <> · <MapPin className="w-2.5 h-2.5 inline" /> {iv.location_address}</>}
                    </p>
                  </div>
                  <Badge variant="outline" className={`text-xs shrink-0 ${iv.status === "concluida" ? "border-green-200 text-green-700" : "border-yellow-200 text-yellow-700"}`}>
                    {iv.status === "concluida" ? "Concluída" : "Revisão"}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Achievement badge if all done */}
        {allGoalsDone && surveys.length > 0 && (
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl p-5 text-white text-center shadow-lg">
            <Award className="w-10 h-10 mx-auto mb-2" />
            <p className="font-bold text-lg">Parabéns!</p>
            <p className="text-sm text-green-100 mt-1">Você atingiu todas as suas metas. Continue assim!</p>
          </div>
        )}

        {/* CTA to field app */}
        <Link to={createPageUrl("FieldApp")}
          className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-center py-3.5 rounded-2xl shadow-sm transition-colors">
          Ir para o App de Campo
        </Link>
      </div>
    </div>
  );
}