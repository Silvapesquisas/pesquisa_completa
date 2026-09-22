// Link e QR code do App de Campo, para o gestor passar aos entrevistadores.
//
// O entrevistador precisa de duas coisas para começar: o endereço do app e o
// seu código de acesso. O código já aparece na lista; aqui fica o endereço,
// em três formatos — QR para quem está junto, link para copiar, e mensagem
// pronta de WhatsApp para quem está longe.
//
// O QR carrega apenas a URL pública do app. O código de acesso é uma
// credencial e continua sendo entregue individualmente, nunca em um QR que
// qualquer pessoa possa fotografar.
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Smartphone, Copy, Check, Download, MessageCircle, Share2 } from "lucide-react";

const QR_SIZE = 148;

export function fieldAppUrl() {
  return `${window.location.origin}/FieldApp`;
}

// Mensagem pronta para o grupo da equipe.
const whatsappMessage = (url, companyName) =>
  `*App de Campo${companyName ? ` — ${companyName}` : ""}*\n\n`
  + `1. Abra este link no celular: ${url}\n`
  + `2. Toque em "Instalar aplicativo" para colocar o ícone na tela inicial\n`
  + `3. Entre com o seu código de acesso (enviado separadamente)\n\n`
  + `Depois do primeiro acesso o app funciona sem internet: as entrevistas ficam salvas no celular e são enviadas quando o sinal voltar.`;

export default function FieldAppAccess({ companyName = "" }) {
  const canvasRef = useRef(null);
  const [url] = useState(() => fieldAppUrl());
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, url, {
      width: QR_SIZE,
      margin: 1,
      // Correção alta: o QR continua legível impresso, amassado ou lido de longe.
      errorCorrectionLevel: "H",
      color: { dark: "#1e293b", light: "#ffffff" },
    }).catch(() => setError("Não foi possível gerar o QR code."));
  }, [url]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Não foi possível copiar. Selecione o endereço e copie manualmente.");
    }
  };

  const shareWhatsapp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(whatsappMessage(url, companyName))}`, "_blank", "noopener");
  };

  // Compartilhamento nativo do celular/desktop, quando disponível.
  const shareNative = async () => {
    try {
      await navigator.share({ title: "App de Campo", text: whatsappMessage(url, companyName), url });
    } catch { /* usuário cancelou */ }
  };

  // Gera um cartaz simples com o QR e o endereço, para imprimir e levar a campo.
  const downloadPoster = async () => {
    try {
      const qr = await QRCode.toDataURL(url, { width: 600, margin: 1, errorCorrectionLevel: "H" });
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = 760; c.height = 1000;
        const x = c.getContext("2d");
        x.fillStyle = "#ffffff"; x.fillRect(0, 0, c.width, c.height);

        x.fillStyle = "#2563eb"; x.fillRect(0, 0, c.width, 14);
        x.fillStyle = "#1e293b";
        x.textAlign = "center";
        x.font = "bold 44px Helvetica, Arial, sans-serif";
        x.fillText("App de Campo", c.width / 2, 110);
        if (companyName) {
          x.fillStyle = "#64748b";
          x.font = "24px Helvetica, Arial, sans-serif";
          x.fillText(companyName.slice(0, 44), c.width / 2, 152);
        }

        x.drawImage(img, 80, 200, 600, 600);

        x.fillStyle = "#1e293b";
        x.font = "bold 26px Helvetica, Arial, sans-serif";
        x.fillText("Aponte a câmera do celular", c.width / 2, 860);
        x.fillStyle = "#475569";
        x.font = "22px Helvetica, Arial, sans-serif";
        x.fillText(url, c.width / 2, 900);
        x.fillStyle = "#94a3b8";
        x.font = "19px Helvetica, Arial, sans-serif";
        x.fillText("Instale o app e entre com o seu código de acesso.", c.width / 2, 946);

        const a = document.createElement("a");
        a.href = c.toDataURL("image/png");
        a.download = "app-de-campo-qrcode.png";
        a.click();
      };
      img.onerror = () => setError("Não foi possível gerar o arquivo do QR code.");
      img.src = qr;
    } catch {
      setError("Não foi possível gerar o arquivo do QR code.");
    }
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-5">
        <div className="flex flex-col sm:flex-row gap-5">
          <div className="flex flex-col items-center shrink-0">
            <div className="bg-white border rounded-xl p-2">
              <canvas ref={canvasRef} width={QR_SIZE} height={QR_SIZE} className="block" />
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5">Aponte a câmera do celular</p>
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-blue-600" /> App de Campo
            </h3>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Endereço que o entrevistador usa no celular. Ao abrir, ele pode tocar em
              <strong> Instalar aplicativo</strong> para deixar o ícone na tela inicial — depois do primeiro
              acesso o app funciona sem internet.
            </p>

            <div className="mt-3 flex items-center gap-2 bg-gray-50 border rounded-lg px-3 py-2">
              <code className="text-xs text-gray-700 truncate flex-1" title={url}>{url}</code>
              <Button size="sm" variant="ghost" className="h-7 px-2 shrink-0" onClick={copy}>
                {copied
                  ? <><Check className="w-3.5 h-3.5 mr-1 text-green-600" /> <span className="text-xs text-green-600">Copiado</span></>
                  : <><Copy className="w-3.5 h-3.5 mr-1 text-gray-400" /> <span className="text-xs text-gray-500">Copiar</span></>}
              </Button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" className="bg-green-600 hover:bg-green-700 text-xs" onClick={shareWhatsapp}>
                <MessageCircle className="w-3.5 h-3.5 mr-1.5" /> Enviar no WhatsApp
              </Button>
              <Button size="sm" variant="outline" className="text-xs" onClick={downloadPoster}>
                <Download className="w-3.5 h-3.5 mr-1.5" /> Baixar QR para imprimir
              </Button>
              {typeof navigator !== "undefined" && navigator.share && (
                <Button size="sm" variant="outline" className="text-xs" onClick={shareNative}>
                  <Share2 className="w-3.5 h-3.5 mr-1.5" /> Compartilhar
                </Button>
              )}
            </div>

            <p className="text-[11px] text-amber-700 mt-3">
              O código de acesso não vai no QR nem na mensagem — envie a cada entrevistador separadamente.
            </p>
            {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
