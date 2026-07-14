import { useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, LogIn, Map, Building2, CheckCircle2 } from "lucide-react";
import { maskPhoneBR, maskCpfCnpj } from "@/lib/masks";
import { OWNER, ownerWhatsappLink } from "@/lib/brand";

// Declarado FORA do componente: se ficasse dentro, era recriado a cada tecla
// e o React remontava os inputs, fazendo o foco se perder a cada caractere.
function Shell({ subtitle, children }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8 space-y-5">
        <div className="text-center">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Map className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Entrevista Pro</h1>
          <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function Login() {
  const [mode, setMode] = useState("login"); // login | register | recover
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Cadastro de empresa
  const [reg, setReg] = useState({ name: "", full_name: "", email: "", phone: "", cnpj: "", password: "", confirm: "" });
  const [done, setDone] = useState(false);

  // Recuperação de senha
  const [recoverEmail, setRecoverEmail] = useState("");
  const [recoverSent, setRecoverSent] = useState(false);

  const submitRecover = async (e) => {
    e?.preventDefault();
    setError("");
    setLoading(true);
    // O link do e-mail volta para o app; a tela "Definir senha" trata o token.
    const { error: err } = await supabase.auth.resetPasswordForEmail(recoverEmail.trim(), {
      redirectTo: window.location.origin,
    });
    setLoading(false);
    if (err) { setError("Não foi possível enviar. Verifique o e-mail e tente novamente."); return; }
    setRecoverSent(true);
  };

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
        phone: reg.phone, cnpj: reg.cnpj, password: reg.password,
      });
      setDone(true);
    } catch (err) {
      setError(err?.message || "Não foi possível enviar o cadastro. Tente novamente.");
    }
    setLoading(false);
  };

  if (done) {
    return (
      <Shell subtitle="Cadastro de nova empresa">
        <div className="text-center space-y-3">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
          <p className="text-sm text-gray-700 font-medium">Cadastro enviado para análise!</p>
          <p className="text-xs text-gray-500">
            Sua empresa foi registrada e está <strong>aguardando aprovação</strong>. Fale com a plataforma pelo WhatsApp abaixo para liberar o acesso — é por esse canal que se faz a <strong>negociação do plano de adesão e todos os fechamentos</strong>. Assim que aprovado, entre com o e-mail e a senha cadastrados.
          </p>
          <a
            href={ownerWhatsappLink(`Olá! Cadastrei a empresa "${reg.name || ""}" e gostaria de liberar o acesso / negociar o plano.`)}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg py-2.5"
          >
            Falar no WhatsApp {OWNER.whatsappDisplay}
          </a>
          <Button variant="outline" className="w-full" onClick={() => { setDone(false); setMode("login"); }}>Voltar ao login</Button>
          <p className="text-[10px] text-gray-400">{OWNER.name} · CNPJ {OWNER.cnpj}</p>
        </div>
      </Shell>
    );
  }

  if (mode === "register") {
    return (
      <Shell subtitle="Cadastro de nova empresa">
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
            <Input value={reg.phone} onChange={e => setReg(p => ({ ...p, phone: maskPhoneBR(e.target.value) }))} placeholder="(11) 99999-9999" inputMode="numeric" maxLength={15} />
          </div>
          <div>
            <Label className="text-xs text-gray-500 mb-1 block">CNPJ ou CPF</Label>
            <Input value={reg.cnpj} onChange={e => setReg(p => ({ ...p, cnpj: maskCpfCnpj(e.target.value) }))} placeholder="00.000.000/0001-00 ou 000.000.000-00" inputMode="numeric" maxLength={18} />
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

  if (mode === "recover") {
    return (
      <Shell subtitle="Recuperar senha">
        {recoverSent ? (
          <div className="text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
            <p className="text-sm text-gray-700 font-medium">E-mail enviado!</p>
            <p className="text-xs text-gray-500">
              Se houver uma conta com <strong>{recoverEmail}</strong>, você receberá um link para <strong>definir uma nova senha</strong>. Verifique também a caixa de spam.
            </p>
            <Button variant="outline" className="w-full" onClick={() => { setMode("login"); setRecoverSent(false); setError(""); }}>Voltar ao login</Button>
          </div>
        ) : (
          <form onSubmit={submitRecover} className="space-y-3">
            <p className="text-xs text-gray-500">Digite seu e-mail. Enviaremos um link para você criar uma nova senha.</p>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">E-mail</Label>
              <Input type="email" value={recoverEmail} onChange={e => setRecoverEmail(e.target.value)} placeholder="voce@empresa.com" autoComplete="email" required />
            </div>
            {error && <p className="text-sm text-red-500 text-center">{error}</p>}
            <Button type="submit" className="w-full h-11 bg-blue-600 hover:bg-blue-700" disabled={loading || !recoverEmail}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar link de recuperação"}
            </Button>
            <button type="button" onClick={() => { setMode("login"); setError(""); }} className="w-full text-xs text-gray-400 hover:text-blue-600">
              Voltar ao login
            </button>
          </form>
        )}
      </Shell>
    );
  }

  return (
    <Shell subtitle="Acesso ao painel de gestão">
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
        <button type="button" onClick={() => { setMode("recover"); setRecoverEmail(email); setError(""); }} className="w-full text-xs text-gray-500 hover:text-blue-600">
          Esqueci minha senha
        </button>
      </form>
      <div className="space-y-2">
        <button onClick={() => { setMode("register"); setError(""); }} className="w-full text-sm font-medium text-blue-600 hover:underline flex items-center justify-center gap-1">
          <Building2 className="w-4 h-4" /> Cadastrar empresa
        </button>
        <p className="text-xs text-gray-400 text-center">
          É entrevistador de campo? <a href="/FieldApp" className="text-blue-600 hover:underline">Acesse o App de Campo</a> com seu código.
        </p>
        <div className="pt-2 border-t text-center space-y-0.5">
          <p className="text-[11px] text-gray-500">
            Adesão e negociação de planos:{" "}
            <a href={ownerWhatsappLink("Olá! Quero contratar/conhecer a plataforma de pesquisas.")} target="_blank" rel="noopener noreferrer" className="text-green-600 font-medium hover:underline">
              WhatsApp {OWNER.whatsappDisplay}
            </a>
          </p>
          <p className="text-[10px] text-gray-400">{OWNER.name} · CNPJ {OWNER.cnpj}</p>
        </div>
      </div>
    </Shell>
  );
}
