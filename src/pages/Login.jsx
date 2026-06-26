import { useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, LogIn, Map } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e?.preventDefault();
    setLoading(true);
    setError("");
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err) {
      setError("E-mail ou senha inválidos.");
      setLoading(false);
      return;
    }
    // Recarrega para o AuthContext reavaliar a sessão e abrir o painel
    window.location.assign("/");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8 space-y-5">
        <div className="text-center">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Map className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Entrevista Pro</h1>
          <p className="text-sm text-gray-500 mt-1">Acesso ao painel de gestão</p>
        </div>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-gray-500 mb-1 block">E-mail</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com" autoComplete="email" required />
          </div>
          <div>
            <Label className="text-xs text-gray-500 mb-1 block">Senha</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" required />
          </div>
          {error && <p className="text-sm text-red-500 text-center">{error}</p>}
          <Button type="submit" className="w-full h-11 bg-blue-600 hover:bg-blue-700" disabled={loading || !email || !password}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><LogIn className="w-4 h-4 mr-2" /> Entrar</>}
          </Button>
        </div>
        <p className="text-xs text-gray-400 text-center">
          É entrevistador de campo? <a href="/FieldApp" className="text-blue-600 hover:underline">Acesse o App de Campo</a> com seu código.
        </p>
      </form>
    </div>
  );
}
