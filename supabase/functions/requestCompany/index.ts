// Autocadastro de empresa pela tela de login (público/anônimo).
// Cria a empresa com status 'pending' e o usuário responsável como admin
// INATIVO (active=false). O acesso só é liberado quando o super-admin aprova.
//
// Entrada: { name, owner_email, password, full_name?, phone?, cnpj? }
// Saída:   { ok: true }
import { corsHeaders, json, serviceClient } from "../_shared/utils.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const svc = serviceClient();
    const { name, owner_email, password, full_name, phone, cnpj } = await req.json().catch(() => ({}));

    const email = String(owner_email || "").trim().toLowerCase();
    if (!name || String(name).trim().length < 2) return json({ error: "Informe o nome da empresa." }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Informe um e-mail válido." }, 400);
    if (!password || String(password).length < 6) return json({ error: "A senha deve ter ao menos 6 caracteres." }, 400);

    // Cria o usuário no Auth (senha definida na hora; e-mail já confirmado).
    const { data: created, error: cErr } = await svc.auth.admin.createUser({
      email,
      password: String(password),
      email_confirm: true,
      user_metadata: { full_name: full_name || name },
    });
    if (cErr || !created?.user) {
      const msg = /already|exists|registered/i.test(cErr?.message || "")
        ? "Já existe um cadastro com este e-mail."
        : (cErr?.message || "Falha ao criar o cadastro.");
      return json({ error: msg }, 409);
    }

    // Cria a empresa pendente.
    const { data: company, error: coErr } = await svc.from("companies").insert({
      name: String(name).trim(),
      owner_email: email,
      phone: phone ? String(phone) : null,
      cnpj: cnpj ? String(cnpj) : null,
      plan: "basico",
      max_interviewers: 5,
      status: "pending",
    }).select("id").single();
    if (coErr || !company) {
      // desfaz o usuário para não deixar órfão
      try { await svc.auth.admin.deleteUser(created.user.id); } catch { /* ignore */ }
      return json({ error: coErr?.message || "Falha ao registrar a empresa." }, 500);
    }

    // Perfil: admin da empresa, porém INATIVO até a aprovação. Nunca super-admin.
    const { error: uErr } = await svc.from("users").upsert({
      id: created.user.id,
      email,
      full_name: full_name || name,
      role: "admin",
      company_id: company.id,
      active: false,
      is_super_admin: false,
    });
    if (uErr) return json({ error: uErr.message }, 500);

    return json({ ok: true });
  } catch (error) {
    return json({ error: (error as Error).message || "Erro interno." }, 500);
  }
});
