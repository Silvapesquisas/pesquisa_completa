import { Download, Trash2, CheckCircle2, HardDrive, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function OfflineSurveys({ surveys, offlineSurveys, onDownload, onRemove, totalStorageBytes, isOnline, onSelect, onRefresh, loadingSurveys }) {
  const offlineIds = new Set(offlineSurveys.map(s => s.id));

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

      {/* Storage bar */}
      {totalStorageBytes > 0 && (
        <div className="w-full bg-gray-200 rounded-full h-1.5">
          <div
            className="bg-blue-500 h-1.5 rounded-full transition-all"
            style={{ width: `${Math.min((totalStorageBytes / (500 * 1024)) * 100, 100)}%` }}
          />
        </div>
      )}

      {surveys.map(s => {
        const isDownloaded = offlineIds.has(s.id);
        const offlineInfo = offlineSurveys.find(o => o.id === s.id);
        return (
          <Card key={s.id}
            className={`border-0 shadow-sm transition-shadow hover:shadow-md cursor-pointer ${isDownloaded ? "border-l-4 border-l-blue-400" : ""}`}
            onClick={() => onSelect(s)}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-gray-900 text-sm">{s.title}</h3>
                  {isDownloaded && (
                    <Badge className="bg-blue-100 text-blue-700 border-0 text-xs">
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Offline
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5 capitalize">
                  {s.category} · {s.questions?.length || 0} questões
                  {offlineInfo?._downloadedAt && (
                    <span> · baixado {format(new Date(offlineInfo._downloadedAt), "dd/MM", { locale: ptBR })}</span>
                  )}
                </p>
              </div>
              <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                {isOnline && !isDownloaded && (
                  <Button size="sm" variant="outline" onClick={() => onDownload(s)} className="text-xs h-8">
                    <Download className="w-3 h-3 mr-1" /> Baixar
                  </Button>
                )}
                {isDownloaded && (
                  <Button size="sm" variant="ghost" onClick={() => onRemove(s.id)} className="text-xs h-8 text-red-400 hover:text-red-600 hover:bg-red-50">
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {surveys.length === 0 && offlineSurveys.length === 0 && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-8 text-center text-gray-400">
            <p className="text-sm">Nenhuma pesquisa ativa disponível.</p>
            {!isOnline && <p className="text-xs mt-1">Sem conexão. Baixe pesquisas quando estiver online.</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}