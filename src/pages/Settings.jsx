import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, User, Trash2, LogOut, ChevronRight } from "lucide-react";

export default function Settings() {
  const [user, setUser] = useState(null);
  const [step, setStep] = useState("idle"); // idle | confirm | typing
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => null);
  }, []);

  const CONFIRM_PHRASE = "EXCLUIR MINHA CONTA";

  const handleDelete = async () => {
    if (confirmText.trim().toUpperCase() !== CONFIRM_PHRASE) {
      setError(`Digite exatamente: ${CONFIRM_PHRASE}`);
      return;
    }
    setError("");
    setDeleting(true);
    try {
      await base44.entities.User.delete(user.id);
      base44.auth.logout("/");
    } catch (e) {
      setError("Erro ao excluir conta. Tente novamente ou contate o suporte.");
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 pb-safe space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Configurações</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Preferências da sua conta</p>
      </div>

      {/* Profile card */}
      {user && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="w-4 h-4" /> Minha Conta
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <p><span className="font-medium">Nome:</span> {user.full_name}</p>
            <p><span className="font-medium">E-mail:</span> {user.email}</p>
            <p><span className="font-medium">Perfil:</span> {user.role}</p>
          </CardContent>
        </Card>
      )}

      {/* Logout */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <button
            onClick={() => base44.auth.logout()}
            className="w-full flex items-center justify-between text-gray-700 dark:text-gray-300 py-1 select-none touch-manipulation"
          >
            <span className="flex items-center gap-3 text-sm font-medium">
              <LogOut className="w-4 h-4 text-gray-400" /> Sair da conta
            </span>
            <ChevronRight className="w-4 h-4 text-gray-300" />
          </button>
        </CardContent>
      </Card>

      {/* Delete account */}
      <Card className="border border-red-100 dark:border-red-900 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-red-600 flex items-center gap-2">
            <Trash2 className="w-4 h-4" /> Excluir Conta
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === "idle" && (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                A exclusão da sua conta é permanente e irreversível. Todos os seus dados serão removidos.
              </p>
              <Button
                variant="outline"
                className="border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                onClick={() => setStep("confirm")}
              >
                <Trash2 className="w-4 h-4 mr-2" /> Quero excluir minha conta
              </Button>
            </>
          )}

          {step === "confirm" && (
            <>
              <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4 flex gap-3">
                <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div className="text-sm text-red-700 dark:text-red-300 space-y-1">
                  <p className="font-semibold">Esta ação não pode ser desfeita.</p>
                  <ul className="list-disc ml-4 space-y-0.5 text-xs">
                    <li>Seu acesso será revogado imediatamente</li>
                    <li>Seus dados pessoais serão removidos</li>
                    <li>Entrevistas e pesquisas criadas por você podem permanecer no sistema</li>
                  </ul>
                </div>
              </div>

              <p className="text-sm text-gray-700 dark:text-gray-300">
                Para confirmar, digite: <strong className="font-mono text-red-600">{CONFIRM_PHRASE}</strong>
              </p>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={CONFIRM_PHRASE}
                className="font-mono uppercase"
              />
              {error && <p className="text-xs text-red-500">{error}</p>}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => { setStep("idle"); setConfirmText(""); setError(""); }}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1"
                >
                  {deleting ? "Excluindo..." : "Confirmar Exclusão"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}