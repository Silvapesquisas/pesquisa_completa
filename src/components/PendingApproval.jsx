import { Button } from "@/components/ui/button";
import { Clock, MessageCircle } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { OWNER, ownerWhatsappLink } from "@/lib/brand";

// Exibida quando o usuário está autenticado mas a empresa ainda não foi
// aprovada pelo super-admin (perfil inativo).
export default function PendingApproval() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8 space-y-4 text-center">
        <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto">
          <Clock className="w-7 h-7 text-amber-600" />
        </div>
        <h1 className="text-lg font-bold text-gray-900">Cadastro em análise</h1>
        <p className="text-sm text-gray-600">
          O cadastro de <strong>{user?.email}</strong> está aguardando aprovação do responsável pela plataforma.
        </p>
        <p className="text-xs text-gray-500">
          Para agilizar a liberação, fale com a plataforma pelo WhatsApp abaixo. É por esse canal que se faz a <strong>negociação do plano de adesão e todos os fechamentos</strong>. Assim que aprovado, basta entrar novamente com o mesmo e-mail e senha.
        </p>
        <a
          href={ownerWhatsappLink(`Olá! Acabei de cadastrar a empresa "${user?.email || ""}" e gostaria de liberar o acesso / negociar o plano.`)}
          target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg py-2.5"
        >
          <MessageCircle className="w-4 h-4" /> Falar no WhatsApp {OWNER.whatsappDisplay}
        </a>
        <Button variant="outline" className="w-full" onClick={logout}>Sair</Button>
        <p className="text-[10px] text-gray-400 pt-1">{OWNER.name} · CNPJ {OWNER.cnpj}</p>
      </div>
    </div>
  );
}
