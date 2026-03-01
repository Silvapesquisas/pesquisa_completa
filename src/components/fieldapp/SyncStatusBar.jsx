import { Wifi, WifiOff, CloudUpload, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function SyncStatusBar({ isOnline, syncing, drafts, lastSynced, onSync }) {
  const pendingCount = drafts.length;

  if (syncing) {
    return (
      <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-sm">
        <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
        <span className="text-blue-700 font-medium">Sincronizando {pendingCount} rascunho(s)...</span>
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-xl px-4 py-2.5 text-sm">
        <WifiOff className="w-4 h-4 text-orange-600 shrink-0" />
        <div className="flex-1">
          <span className="text-orange-700 font-medium">Sem conexão</span>
          {pendingCount > 0 && (
            <span className="text-orange-500 text-xs ml-2">· {pendingCount} rascunho(s) pendente(s)</span>
          )}
        </div>
      </div>
    );
  }

  if (pendingCount > 0) {
    return (
      <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-2.5 text-sm">
        <AlertCircle className="w-4 h-4 text-yellow-600 shrink-0" />
        <div className="flex-1">
          <span className="text-yellow-700 font-medium">{pendingCount} rascunho(s) para sincronizar</span>
        </div>
        <Button size="sm" variant="outline" onClick={onSync} className="text-xs h-7 border-yellow-400 text-yellow-700 hover:bg-yellow-100">
          <CloudUpload className="w-3 h-3 mr-1" /> Sincronizar
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 text-sm">
      <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
      <div className="flex-1">
        <span className="text-green-700 font-medium">Online</span>
        {lastSynced && (
          <span className="text-green-500 text-xs ml-2">
            · sincronizado {format(lastSynced, "HH:mm", { locale: ptBR })}
          </span>
        )}
      </div>
      <Wifi className="w-4 h-4 text-green-500" />
    </div>
  );
}