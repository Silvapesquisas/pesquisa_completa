import { X, CheckCircle2, Circle } from "lucide-react";

export default function QuestionIndex({ questions, currentIndex, answers, onSelect, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex items-center justify-between px-5 py-4 border-b bg-blue-600 text-white">
        <h2 className="font-bold text-base">Índice de Questões</h2>
        <button onClick={onClose}><X className="w-5 h-5" /></button>
      </div>
      <div className="flex-1 overflow-y-auto divide-y">
        {questions.map((q, idx) => {
          const answered = !!answers[q.id];
          const isCurrent = idx === currentIndex;
          return (
            <button
              key={q.id}
              onClick={() => { onSelect(idx); onClose(); }}
              className={`w-full text-left px-5 py-4 flex items-start gap-3 transition-colors
                ${isCurrent ? "bg-blue-50" : "hover:bg-gray-50"}`}
            >
              <div className={`mt-0.5 shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2
                ${isCurrent ? "border-blue-600 bg-blue-600 text-white" : answered ? "border-green-500 bg-green-50 text-green-700" : "border-gray-300 text-gray-400"}`}>
                {idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm leading-snug ${isCurrent ? "font-semibold text-blue-700" : "text-gray-800"}`}>
                  {q.text}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  {answered
                    ? <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="w-3 h-3" /> Respondida</span>
                    : <span className="flex items-center gap-1 text-xs text-gray-400"><Circle className="w-3 h-3" /> Pendente</span>
                  }
                  {q.required && <span className="text-xs text-red-400">• Obrigatória</span>}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}