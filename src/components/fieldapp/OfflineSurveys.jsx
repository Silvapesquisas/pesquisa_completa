// Lista de pesquisas do App de Campo.
//
// As pesquisas são guardadas no celular automaticamente sempre que o app fala
// com o servidor (ver surveyCache.js) — não há mais botão "Baixar". A lista
// mostra a versão de cada questionário e de quando é a informação, para o
// entrevistador saber se está com a versão atual.
import { HardDrive, RefreshCw, Target, CheckCircle2, WifiOff, AlertCircle, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { questionsVersion } from "@/components/fieldapp/surveyCache";

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const fmt = (d, pattern) => {
  const date = d ? new Date(d) : null;
  return date && !isNaN(date) ? format(date, pattern, { locale: ptBR }) : null;
};

export default function OfflineSurveys({
  surveys, fromServer, checkedAt, checkFailed, updates = [], onDismissUpdates,
  totalStorageBytes, isOnline, onSelect, onRefresh, loadingSurveys, myInterviewCounts, getEffectiveLimit,
}) {
  // Quando a cópia do celular foi atualizada pela última vez (sem internet).
  const lastSaved = surveys.reduce((max, s) => (s._savedAt && s._savedAt > max ? s._savedAt : max), "");

  let status = null;
  if (!isOnline) {
    status = (
      <p className="text-[11px] text-amber-700 flex items-start gap-1.5">
        <WifiOff className="w-3.5 h-3.5 shrink-0 mt-px" />
        <span>
          Sem internet: usando os questionários salvos no celular
          {fmt(lastSaved, "dd/MM 'às' HH:mm") && <> (atualizados em {fmt(lastSaved, "dd/MM 'às' HH:mm")})</>}.
          Conecte-se para receber alterações.
        </span>
      </p>
    );
  } else if (checkFailed && !loadingSurveys) {
    status = (
      <p className="text-[11px] text-amber-700 flex items-start gap-1.5">
        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
        <span>Não foi possível verificar atualizações agora. Usando a cópia do celular; toque em Atualizar para tentar de novo.</span>
      </p>
    );
  } else if (fromServer && checkedAt) {
    status = (
      <p className="text-[11px] text-gray-400">
        Questionários verificados às {fmt(checkedAt, "HH:mm")} e salvos no celular para uso sem internet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Pesquisas Disponíveis</h2>
        <div className="flex items-center gap-2">
          {isOnline && onRefresh && (
            <Button size="sm" variant="ghost" onClick={onRefresh} disabled={loadingSurveys} className="h-7 px-2 text-xs text-blue-500 hover:text-blue-700">
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loadingSurveys ? "animate-spin" : ""}`} />
              {loadingSurveys ? "Atualizando..." : "Atualizar"}
            </Button>
          )}
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <HardDrive className="w-3 h-3" />
            <span>{formatBytes(totalStorageBytes)} usado</span>
          </div>
        </div>
      </div>

      {status}

      {updates.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 text-xs text-green-800 space-y-0.5">
            <p className="font-semibold">Questionário atualizado</p>
            {updates.map((u) => (
              <p key={u.id}>"{u.title}" agora está na versão {u.to}. As próximas entrevistas já usam a nova versão.</p>
            ))}
          </div>
          {onDismissUpdates && (
            <button onClick={onDismissUpdates} className="text-green-400 hover:text-green-600 shrink-0" title="Fechar">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {surveys.map(s => {
        const myCount = myInterviewCounts?.[s.id] || 0;
        const limit = getEffectiveLimit ? getEffectiveLimit(s) : (s.max_interviews_per_interviewer || null);
        const target = s.target_interviews;
        const limitReached = limit && myCount >= limit;
        const progressPct = limit ? Math.min((myCount / limit) * 100, 100) : null;
        const version = questionsVersion(s);
        const changedAt = fmt(s.questions_updated_at, "dd/MM HH:mm");

        return (
          <Card key={s.id}
            className={`border-0 shadow-sm transition-shadow hover:shadow-md cursor-pointer ${limitReached ? "opacity-70" : ""}`}
            onClick={() => !limitReached && onSelect(s)}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900 text-sm">{s.title}</h3>
                    {version > 0 && (
                      <Badge className="bg-blue-50 text-blue-700 border-0 text-[10px]">versão {version}</Badge>
                    )}
                    {limitReached && (
                      <Badge className="bg-orange-100 text-orange-700 border-0 text-xs">Limite atingido</Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 capitalize">
                    {s.category} · {s.questions?.length || 0} questões
                    {changedAt && <span className="normal-case"> · alterado em {changedAt}</span>}
                  </p>
                  {(limit || target) && (
                    <div className="mt-2 space-y-1">
                      {limit && (
                        <div>
                          <div className="flex justify-between text-[10px] text-gray-400 mb-0.5">
                            <span className="flex items-center gap-0.5"><Target className="w-2.5 h-2.5" /> Meu progresso</span>
                            <span className={`font-medium ${limitReached ? "text-orange-500" : "text-blue-600"}`}>{myCount}/{limit}</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-1.5">
                            <div className={`h-1.5 rounded-full transition-all ${limitReached ? "bg-orange-400" : "bg-blue-400"}`}
                              style={{ width: `${progressPct}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {surveys.length === 0 && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-8 text-center text-gray-400">
            <p className="text-sm">Nenhuma pesquisa ativa disponível.</p>
            {!isOnline && <p className="text-xs mt-1">Sem conexão. Abra o app com internet para receber as pesquisas.</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
