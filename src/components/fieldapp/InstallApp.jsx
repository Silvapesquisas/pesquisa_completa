// Instalação do App de Campo no celular (PWA).
//
// Android/Chrome dispara `beforeinstallprompt`: guardamos o evento e o
// disparamos quando o entrevistador toca em "Instalar".
// iOS/Safari não tem esse evento — lá a instalação é manual, pelo menu
// Compartilhar, então mostramos as instruções.
//
// Nada aparece quando o app já está rodando instalado (standalone).
import { useEffect, useState } from "react";
import { Download, Share, Plus, X, CheckCircle2 } from "lucide-react";

const DISMISS_KEY = "fieldapp_install_dismissed";

// Já está aberto como aplicativo instalado?
export function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)")?.matches
    || window.navigator.standalone === true; // iOS
}

const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent)
  // iPadOS 13+ se identifica como Mac; o toque é o que o distingue.
  || (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

export default function InstallApp({ className = "" }) {
  const [deferred, setDeferred] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  });

  useEffect(() => {
    // O manifesto do entrevistador abre direto no App de Campo, em vez da
    // tela de login do painel. Precisa estar ativo ANTES do toque em instalar.
    const link = document.querySelector('link[rel="manifest"]');
    const original = link?.getAttribute("href");
    if (link) link.setAttribute("href", "/manifest-campo.json");

    const onPrompt = (e) => { e.preventDefault(); setDeferred(e); };
    const onInstalled = () => { setInstalled(true); setDeferred(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      if (link && original) link.setAttribute("href", original);
    };
  }, []);

  const install = async () => {
    if (!deferred) { setShowIosHelp(true); return; }
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setDeferred(null);
  };

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
  };

  if (isStandalone()) return null;

  if (installed) {
    return (
      <div className={`bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2 ${className}`}>
        <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
        <p className="text-xs text-green-800">
          Aplicativo instalado. Abra pelo ícone <strong>Campo</strong> na tela inicial do celular.
        </p>
      </div>
    );
  }

  // Sem evento de instalação e fora do iOS: navegador que não instala
  // (ex.: Firefox no desktop). Não mostra nada em vez de prometer o que não há.
  if (!deferred && !isIOS()) return null;
  if (dismissed && !showIosHelp) return null;

  return (
    <div className={`bg-white border border-blue-200 rounded-xl overflow-hidden ${className}`}>
      <div className="flex items-start gap-3 p-4">
        <div className="bg-blue-600 rounded-xl p-2 shrink-0">
          <Download className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">Instalar no celular</p>
          <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
            Abre em tela cheia, direto pelo ícone, e continua funcionando sem internet.
          </p>
          <button
            onClick={install}
            className="mt-2.5 w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg py-2.5 flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" /> {deferred ? "Instalar aplicativo" : "Como instalar"}
          </button>
        </div>
        <button onClick={dismiss} className="text-gray-300 hover:text-gray-500 shrink-0" title="Agora não">
          <X className="w-4 h-4" />
        </button>
      </div>

      {showIosHelp && (
        <div className="bg-blue-50 border-t border-blue-100 px-4 py-3">
          <p className="text-[11px] font-medium text-blue-900 mb-1.5">No iPhone/iPad, pelo Safari:</p>
          <ol className="text-[11px] text-blue-800 space-y-1">
            <li className="flex items-center gap-1.5">
              <span className="font-semibold">1.</span> Toque em Compartilhar
              <Share className="w-3.5 h-3.5" /> na barra do navegador
            </li>
            <li className="flex items-center gap-1.5">
              <span className="font-semibold">2.</span> Escolha "Adicionar à Tela de Início"
              <Plus className="w-3.5 h-3.5" />
            </li>
            <li><span className="font-semibold">3.</span> Confirme em "Adicionar"</li>
          </ol>
        </div>
      )}
    </div>
  );
}
