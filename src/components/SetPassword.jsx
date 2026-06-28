import { useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, Loader2 } from "lucide-react";

// Tela exibida quando o usuário chega por um link de convite ou de redefinição
// de senha (Supabase). Aqui ele define a senha de acesso ao painel.
export default function SetPassword() {
  const { user, completePasswordSetup } = useAuth();
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (password.length < 6) { setError("A senha deve ter ao menos 6 caracteres."); return; }
    if (password !== confirm) { setError("As senhas não conferem."); return; }
    setSaving(true);
    try {
      const { error: upErr } = await supabase.auth.updateUser({ password });
      if (upErr) throw upErr;
      // Atualiza o nome no perfil, se informado (não bloqueia se falhar).
      if (fullName?.trim()) {
        try {
          const me = await base44.auth.me();
          await base44.entities.User.update(me.id, { full_name: fullName.trim() });
        } catch { /* ignore */ }
      }
      completePasswordSetup();
    } catch (e) {
      setError(e?.message || "Não foi possível definir a senha. Tente novamente.");
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-indigo-700 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8 space-y-5">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <KeyRound className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Definir senha</h1>
          <p className="text-sm text-gray-500 mt-1">
            {user?.email ? <>Bem-vindo(a), <strong>{user.email}</strong>. </> : null}
            Crie uma senha para acessar o painel.
          </p>
        </div>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-gray-500 mb-1 block">Seu nome</Label>
            <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Nome completo" />
          </div>
          <div>
            <Label className="text-xs text-gray-500 mb-1 block">Nova senha</Label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
          </div>
          <div>
            <Label className="text-xs text-gray-500 mb-1 block">Confirmar senha</Label>
            <Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repita a senha"
              onKeyDown={e => e.key === "Enter" && submit()} />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button className="w-full h-11 bg-blue-600 hover:bg-blue-700" onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : "Salvar e entrar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
