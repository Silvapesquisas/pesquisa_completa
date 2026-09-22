// Cotas de campo: mostra ao entrevistador quantas entrevistas faltam em cada
// grupo do plano amostral (sexo, zona, faixa etária...), para ele procurar
// quem está em falta em vez de completar a meta com quem for mais fácil.
//
// O progresso é da pesquisa inteira — a cota vem do plano amostral, não do
// limite individual do entrevistador.
import { useState } from "react";
import { Users, ChevronDown, ChevronUp, Check, AlertTriangle } from "lucide-react";

export default function QuotaPanel({ progress, title = null, compact = false, className = "" }) {
  const [open, setOpen] = useState(!compact);
  if (!progress) return null;

  const total = progress.strata[0];
  const overall = total ? Math.min(100, (total.done / (total.quota || 1)) * 100) : 0;

  return (
    <div className={`bg-white rounded-xl border overflow-hidden ${className}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left"
      >
        <Users className="w-4 h-4 text-blue-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">{title || "Cotas da pesquisa"}</p>
          <p className="text-[11px] text-gray-500">
            {total ? `${total.done} de ${progress.n} entrevistas · ${Math.round(overall)}%` : `Meta de ${progress.n} entrevistas`}
          </p>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4">
          {progress.strata.map(st => (
            <div key={st.id || st.label}>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-medium text-gray-700">{st.label}</p>
                {st.unclassified > 0 && (
                  <span className="text-[10px] text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> {st.unclassified} fora dos grupos
                  </span>
                )}
              </div>
              <div className="space-y-1.5">
                {st.groups.map(g => (
                  <div key={g.label}>
                    <div className="flex items-center justify-between text-[11px] mb-0.5">
                      <span className={`truncate pr-2 ${g.full ? "text-gray-400" : "text-gray-700"}`}>{g.label}</span>
                      <span className={`shrink-0 font-medium ${g.full ? "text-green-600" : "text-blue-600"}`}>
                        {g.full
                          ? <span className="flex items-center gap-0.5"><Check className="w-3 h-3" /> completa</span>
                          : `faltam ${g.remaining}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-1.5 rounded-full transition-all ${g.full ? "bg-green-500" : "bg-blue-500"}`}
                          style={{ width: `${g.pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-400 w-14 text-right shrink-0">{g.done}/{g.quota}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <p className="text-[10px] text-gray-400 leading-snug">
            Priorize os grupos que ainda faltam: é o equilíbrio entre eles que segura a margem de erro da pesquisa.
          </p>
        </div>
      )}
    </div>
  );
}
