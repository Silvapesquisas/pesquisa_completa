import { useState } from "react";
import { WifiOff, CloudUpload, CheckCircle2, Loader2, AlertCircle, ChevronDown, ChevronUp, Clock, XCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

function LogEntry({ log }) {
  const icons = {
    success: <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0 mt-0.5" />,
    error: <XCircle className="w-3 h-3 text-red-500 shrink-0 mt-0.5" />,
    info: <Info className="w-3 h-3 text-blue-400 shrink-0 mt-0.5" />,
  };
  const colors = { success: "text-green-700", error: "text-red-700", info: "text-gray-600" };
  return (
    <div className="flex items-start gap-2 py-1 border-b border-gray-50 last:border-0">
      {icons[log.type]}
      <div className="flex-1 min-w-0">
        <p className={`text-xs leading-snug ${colors[log.type]}`}>{log.message}</p>
        <p className="text-xs text-gray-400">{format(new Date(log.timestamp), "HH:mm:ss", { locale: ptBR })}</p>
      </div>
    </div>
  );
}

export default function SyncStatusBar({ isOnline, syncing, drafts, lastSynced, onSync, syncLogs = [], onClearLogs }) {
  const [showLogs, setShowLogs] = useState(false);
  // Apenas entrevistas concluídas são sincronizadas; rascunhos em andamento permanecem locais
  const pendingCount = drafts.filter(d => d.status === "concluida").length;
  const errorCount = drafts.filter(d => d._syncStatus === "error").length;

  let barColor = "bg-green-50 border-green-200";
  let icon = <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />;
  let label = <span className="text-green-700 font-medium">Online</span>;
  let sub = lastSynced ? <span className="text-green-500 text-xs ml-2">· sincronizado {format(lastSynced, "HH:mm", { locale: ptBR })}</span> : null;

  if (syncing) {
    barColor = "bg-blue-50 border-blue-200";
    icon = <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />;
    label = <span className="text-blue-700 font-medium">Sincronizando {pendingCount} rascunho(s)...</span>;
    sub = null;
  } else if (!isOnline) {
    barColor = "bg-orange-50 border-orange-200";
    icon = <WifiOff className="w-4 h-4 text-orange-600 shrink-0" />;
    label = <span className="text-orange-700 font-medium">Sem conexão</span>;
    sub = pendingCount > 0 ? <span className="text-orange-500 text-xs ml-2">· {pendingCount} pendente(s)</span> : null;
  } else if (errorCount > 0) {
    barColor = "bg-red-50 border-red-200";
    icon = <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />;
    label = <span className="text-red-700 font-medium">{errorCount} falha(s) na sincronização</span>;
    sub = null;
  } else if (pendingCount > 0) {
    barColor = "bg-yellow-50 border-yellow-200";
    icon = <Clock className="w-4 h-4 text-yellow-600 shrink-0" />;
    label = <span className="text-yellow-700 font-medium">{pendingCount} rascunho(s) pendentes</span>;
    sub = null;
  }

  return (
    <div className={`border rounded-xl overflow-hidden ${barColor}`}>
      <div className="flex items-center gap-2 px-4 py-2.5">
        {icon}
        <div className="flex-1 flex items-center">{label}{sub}</div>
        {!syncing && isOnline && pendingCount > 0 && (
          <Button size="sm" variant="outline" onClick={onSync} className="text-xs h-7 mr-1">
            <CloudUpload className="w-3 h-3 mr-1" /> Sincronizar
          </Button>
        )}
        {syncLogs.length > 0 && (
          <button onClick={() => setShowLogs(s => !s)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
            Logs {showLogs ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </div>

      {showLogs && (
        <div className="bg-white border-t border-gray-100 px-4 py-2 max-h-48 overflow-y-auto">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs font-medium text-gray-500">Histórico de sincronização</span>
            {onClearLogs && (
              <button onClick={onClearLogs} className="text-xs text-gray-400 hover:text-red-500">Limpar</button>
            )}
          </div>
          {[...syncLogs].reverse().map(log => <LogEntry key={log.id} log={log} />)}
        </div>
      )}
    </div>
  );
}