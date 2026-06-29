import { useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, LogIn, Map, Building2, CheckCircle2 } from "lucide-react";

export default function Login() {
  const [mode, setMode] = useState("login"); // login | register
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Cadastro de empresa
  const [reg, setReg] = useState({ name: "", full_name: "", email: "", phone: "", password: "", confirm: "" });
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e?.preventDefault();
    setLoading(true); setError("");
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err) { setError("E-mail ou senha inválidos."); setLoading(false); return; }
    window.location.assign("/");
  };

  const submitRegister = async (e) => {
    e?.preventDefault();
    setError("");
    if (reg.password.length < 6) { setError("A senha deve ter ao menos 6 caracteres."); return; }
    if (reg.password !== reg.confirm) { setError("As senhas não conferem."); return; }
    setLoading(true);
    try {
      await base44.functions.invoke("requestCompany", {
        name: reg.name, full_name: reg.full_name, owner_email: reg.email,
        phone: reg.phone, password: reg.password,
      });
      setDone(true);
    } catch (err) {
      setError(err?.message || "Não foi possível enviar o cadastro. Tente novamente.");
    }
    setLoading(false);
  };

  const Shell = ({ children }) => (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8 space-y-5">
        <div className="text-center">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Map className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Entrevista Pro</h1>
          <p className="text-sm text-gray-500 mt-1">{mode === "login" ? "Acesso ao painel de gestão" : "Cadastro de nova empresa"}</p>
        </div>
        {children}
      </div>
    </div>
  );

  if (done) {
    return (
      <Shell>
        <div className="text-center space-y-3">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
          <p className="text-sm text-gray-700 font-medium">Cadastro enviado para análise!</p>
          <p className="text-xs text-gray-500">
            Sua empresa foi registrada e está <strong>aguardando aprovação</strong>. Avise o responsável pela plataforma (WhatsApp) para liberar seu acesso. Assim que aprovado, você entra com o e-mail e a senha cadastrados.
          </p>
          <Button variant="outline" className="w-full" onClick={() => { setDone(false); setMode("login"); }}>Voltar ao login</Button>
        </div>
      </Shell>
    );
  }

  if (mode === "register") {
    return (
      <Shell>
        <form onSubmit={submitRegister} className="space-y-3">
          <div>
            <Label className="text-xs text-gray-500 mb-1 block">Nome da empresa *</Label>
            <Input value={reg.name} onChange={e => setReg(p => ({ ...p, name: e.target.value }))} placeholder="Minha Empresa Ltda" required />
          </div>
          <div>
            <Label className="text-xs text-gray-500 mb-1 block">Seu nome *</Label>
            <Input value={reg.full_name} onChange={e => setReg(p => ({ ...p, full_name: e.target.value }))} placeholder="Responsável pela empresa" required />
          </div>
          <div>
            <Label className="text-xs text-gray-500 mb-1 block">E-mail *</Label>
            <Input type="email" value={reg.email} onChange={e => setReg(p => ({ ...p, email: e.target.value }))} placeholder="voce@empresa.com" required />
          </div>
          <div>
            <Label className="text-xs text-gray-500 mb-1 block">WhatsApp / Telefone</Label>
            <Input value={reg.phone} onChange={e => setReg(p => ({ ...p, phone: e.target.value }))} placeholder="(11) 99999-9999" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Senha *</Label>
              <Input type="password" value={reg.password} onChange={e => setReg(p => ({ ...p, password: e.target.value }))} placeholder="mín. 6" required />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Confirmar *</Label>
              <Input type="password" value={reg.confirm} onChange={e => setReg(p => ({ ...p, confirm: e.target.value }))} placeholder="repita" required />
            </div>
          </div>
          {error && <p className="text-sm text-red-500 text-center">{error}</p>}
          <Button type="submit" className="w-full h-11 bg-blue-600 hover:bg-blue-700" disabled={loading || !reg.name || !reg.email || !reg.password}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Building2 className="w-4 h-4 mr-2" /> Enviar cadastro</>}
          </Button>
          <button type="button" onClick={() => { setMode("login"); setError(""); }} className="w-full text-xs text-gray-400 hover:text-blue-600">
            Já tem conta? Voltar ao login
          </button>
        </form>
      </Shell>
    );
  }

  return (
    <Shell>
      <form onSubmit={submit} className="space-y-3">
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
      </form>
      <div className="space-y-2">
        <button onClick={() => { setMode("register"); setError(""); }} className="w-full text-sm font-medium text-blue-600 hover:underline flex items-center justify-center gap-1">
          <Building2 className="w-4 h-4" /> Cadastrar empresa
        </button>
        <p className="text-xs text-gray-400 text-center">
          É entrevistador de campo? <a href="/FieldApp" className="text-blue-600 hover:underline">Acesse o App de Campo</a> com seu código.
        </p>
      </div>
    </Shell>
  );
}
