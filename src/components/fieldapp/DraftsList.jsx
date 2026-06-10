import { Clock, AlertCircle, Trash2, Edit } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const statusConfig = {
  pending: { label: "Aguardando envio", color: "bg-yellow-100 text-yellow-700", icon: Clock },
  error: { label: "Erro no envio", color: "bg-red-100 text-red-700", icon: AlertCircle },
  em_andamento: { label: "Em andamento", color: "bg-blue-100 text-blue-700", icon: Edit },
};

function draftStatus(draft) {
  if (draft._syncStatus === "error") return statusConfig.error;
  if (draft.status === "em_andamento") return statusConfig.em_andamento;
  return statusConfig.pending;
}

export default function DraftsList({ drafts, onEdit, onDelete }) {
  if (drafts.length === 0) return null;

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide flex items-center gap-2">
        Rascunhos Salvos
        <Badge className="bg-yellow-100 text-yellow-700 border-0">{drafts.length}</Badge>
      </h2>
      {drafts.map(draft => {
        const status = draftStatus(draft);
        const Icon = status.icon;
        const savedDate = draft._savedAt ? new Date(draft._savedAt) : null;
        return (
          <Card key={draft._draftId} className="border-0 shadow-sm border-l-4 border-l-yellow-400">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900 text-sm truncate">{draft.survey_title || "Pesquisa sem título"}</h3>
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${status.color}`}>
                      <Icon className="w-3 h-3" /> {status.label}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1 space-x-2">
                    {savedDate && <span>Salvo {format(savedDate, "dd/MM HH:mm", { locale: ptBR })}</span>}
                    {draft.answers?.length > 0 && <span>· {draft.answers.length} resposta(s)</span>}
                    {draft._lastError && <span className="text-red-400">· {draft._lastError}</span>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => onEdit(draft)} className="h-8 px-2">
                    <Edit className="w-3 h-3" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onDelete(draft._draftId)} className="h-8 px-2 text-red-400 hover:text-red-600 hover:bg-red-50">
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}