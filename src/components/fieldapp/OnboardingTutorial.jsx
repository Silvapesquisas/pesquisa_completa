import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, MapPin, Mic, CheckSquare, ChevronRight, ChevronLeft, BookOpen } from "lucide-react";

const STEPS = [
  {
    icon: BookOpen,
    color: "bg-blue-600",
    title: "Bem-vindo ao App de Campo!",
    description: "Este tutorial rápido vai te mostrar como usar o aplicativo para coletar entrevistas de campo de forma eficiente.",
    demo: null,
  },
  {
    icon: CheckSquare,
    color: "bg-indigo-600",
    title: "Respondendo Perguntas",
    description: "Selecione uma pesquisa na tela inicial e responda cada questão. Use os botões de navegação para avançar ou voltar.",
    demo: (
      <div className="space-y-2 mt-3">
        <p className="text-xs text-gray-500 mb-2">Exemplo de pergunta:</p>
        <p className="text-sm font-semibold text-gray-800 mb-3">Qual a faixa etária do entrevistado?</p>
        {["18 a 24 anos", "25 a 34 anos", "35 a 44 anos"].map((opt, i) => (
          <div key={i} className={`py-2.5 px-4 rounded-xl border-2 text-sm ${i === 1 ? "border-blue-600 bg-blue-50 text-blue-700 font-medium" : "border-gray-200 text-gray-500"}`}>
            {opt}
          </div>
        ))}
        <p className="text-xs text-blue-600 mt-2">👆 Toque na opção desejada para selecionar</p>
      </div>
    ),
  },
  {
    icon: MapPin,
    color: "bg-green-600",
    title: "Capturando Localização",
    description: "Ao iniciar uma entrevista, a localização GPS é capturada automaticamente. Na tela de revisão, você pode ver as coordenadas ou capturar novamente.",
    demo: (
      <div className="mt-3 space-y-3">
        <div className="flex items-center gap-3 p-3 bg-green-50 border-2 border-green-200 rounded-xl">
          <MapPin className="w-5 h-5 text-green-600 shrink-0" />
          <div>
            <p className="text-sm font-medium text-green-800">Localização capturada ✓</p>
            <p className="text-xs text-green-600">-9.97474, -67.80978</p>
          </div>
        </div>
        <div className="p-3 bg-orange-50 border-2 border-orange-200 rounded-xl">
          <p className="text-xs text-orange-700">⚠️ Se aparecer em laranja, a localização não foi obtida. Verifique se o GPS está ativado no dispositivo e clique em "Capturar Localização".</p>
        </div>
      </div>
    ),
  },
  {
    icon: Mic,
    color: "bg-purple-600",
    title: "Gravando Áudio",
    description: "Na tela de revisão, você pode gravar um áudio opcional da entrevista. Clique em 'Gravar Áudio', fale e depois clique em 'Parar Gravação'.",
    demo: (
      <div className="mt-3 space-y-3">
        <div className="flex gap-2">
          <div className="flex-1 py-2.5 px-4 rounded-xl border-2 border-gray-200 text-sm text-gray-600 flex items-center gap-2">
            <Mic className="w-4 h-4" /> Gravar Áudio
          </div>
        </div>
        <div className="flex gap-2 items-center p-3 bg-red-50 border border-red-200 rounded-xl">
          <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse shrink-0" />
          <p className="text-xs text-red-700 font-medium">Gravando... (toque para parar)</p>
        </div>
        <p className="text-xs text-gray-500">O áudio é opcional mas ajuda a validar as respostas.</p>
      </div>
    ),
  },
  {
    icon: CheckSquare,
    color: "bg-teal-600",
    title: "Salvando e Enviando",
    description: "Ao terminar, revise as respostas e clique em 'Enviar'. Sem internet? Não tem problema — os dados ficam salvos como rascunho e enviados automaticamente ao voltar online.",
    demo: (
      <div className="mt-3 space-y-2">
        <div className="py-2.5 px-4 rounded-xl bg-green-600 text-white text-sm font-medium text-center">✓ Enviar Entrevista</div>
        <div className="py-2.5 px-4 rounded-xl bg-gray-100 border border-gray-200 text-sm text-gray-600 text-center">💾 Salvar como Rascunho</div>
        <p className="text-xs text-gray-500 text-center mt-1">Rascunhos são sincronizados automaticamente quando a internet voltar.</p>
      </div>
    ),
  },
];

export default function OnboardingTutorial({ onClose }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        {/* Header */}
        <div className={`${current.color} p-5 text-white relative`}>
          <button onClick={onClose} className="absolute top-4 right-4 text-white/70 hover:text-white">
            <X className="w-5 h-5" />
          </button>
          <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center mb-3">
            <Icon className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-lg font-bold leading-tight">{current.title}</h2>
          {/* Progress dots */}
          <div className="flex gap-1.5 mt-3">
            {STEPS.map((_, i) => (
              <div key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "bg-white w-5" : "bg-white/40 w-1.5"}`} />
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="p-5">
          <p className="text-sm text-gray-600 leading-relaxed">{current.description}</p>
          {current.demo}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-2">
          {step > 0 && (
            <Button variant="outline" size="sm" onClick={() => setStep(s => s - 1)} className="shrink-0">
              <ChevronLeft className="w-4 h-4" />
            </Button>
          )}
          <Button
            className={`flex-1 ${isLast ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"}`}
            onClick={() => isLast ? onClose() : setStep(s => s + 1)}
          >
            {isLast ? "Começar!" : <><ChevronRight className="w-4 h-4 mr-1" /> Próximo</>}
          </Button>
        </div>
      </div>
    </div>
  );
}