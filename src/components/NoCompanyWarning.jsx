import { Building2, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Shown to users who are logged in but have no company_id set.
 * They need to be assigned to a company by a super-admin in the Companies page.
 */
export default function NoCompanyWarning() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <Card className="border-0 shadow-lg max-w-md w-full">
        <CardContent className="p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto">
            <Building2 className="w-8 h-8 text-amber-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Conta não vinculada</h2>
            <p className="text-gray-500 text-sm mt-2">
              Sua conta ainda não está associada a uma empresa no Entrevista Pro.
            </p>
            <p className="text-gray-400 text-xs mt-3 leading-relaxed">
              Entre em contato com o administrador da plataforma para que ele associe seu usuário à empresa correta na página <strong>Empresas</strong>.
            </p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-2 text-left">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-700">
              Por segurança, dados de outras empresas são inacessíveis até a vinculação ser realizada.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}