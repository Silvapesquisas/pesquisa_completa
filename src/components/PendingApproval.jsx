import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

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
          Avise pelo WhatsApp para agilizar. Assim que sua empresa for aprovada, basta entrar novamente com o mesmo e-mail e senha.
        </p>
        <Button variant="outline" className="w-full" onClick={logout}>Sair</Button>
      </div>
    </div>
  );
}
