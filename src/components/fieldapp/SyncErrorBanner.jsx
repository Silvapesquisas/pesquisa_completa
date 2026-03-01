import { AlertTriangle, X, ArrowRight } from "lucide-react";

export default function SyncErrorBanner({ drafts, onGoToDrafts, onDismiss }) {
  const errorDrafts = drafts.filter(d => d._syncStatus === "error");
  if (errorDrafts.length === 0) return null;

  return (
    <div className="bg-red-600 text-white px-4 py-3 flex items-center gap-3">
      <AlertTriangle className="w-5 h-5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-tight">
          {errorDrafts.length} rascunho(s) com erro de sincronização
        </p>
        <p className="text-xs text-red-200 mt-0.5 truncate">
          {errorDrafts.map(d => d.survey_title || "sem título").join(", ")}
        </p>
      </div>
      {onGoToDrafts && (
        <button
          onClick={onGoToDrafts}
          className="shrink-0 flex items-center gap-1 text-xs font-medium bg-white/20 hover:bg-white/30 px-2 py-1 rounded-lg transition-colors"
        >
          Ver <ArrowRight className="w-3 h-3" />
        </button>
      )}
      {onDismiss && (
        <button onClick={onDismiss} className="shrink-0 text-red-200 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}