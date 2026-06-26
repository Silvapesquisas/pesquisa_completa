// Criação de usuário externo (entrevistador do App de Campo) com o limite por
// empresa aplicado NO SERVIDOR. Chamada por um admin autenticado da plataforma.
//
// O limite (Company.max_interviewers) é definido pelo super-admin e fica entre
// 4 e 25. O código de acesso de 8 dígitos é gerado no servidor, garantindo
// unicidade dentro da empresa.
//
// Entrada:  { name, role?, region?, phone?, notes? }
// Saída:    { fieldUser } ou erro 4xx/5xx
import { createClientFromRequest } from "npm:@base44/sdk";

const MIN_LIMIT = 4;
const MAX_LIMIT = 25;

function generateCode() {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;

    // Precisa ser um usuário autenticado da plataforma
    let me = null;
    try {
      me = await base44.auth.me();
    } catch {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }
    const isSuperAdmin = me?.is_super_admin === true;
    const isAdmin = me?.role === "admin";
    if (!me || (!isAdmin && !isSuperAdmin)) {
      return Response.json({ error: "Apenas administradores podem cadastrar entrevistadores." }, { status: 403 });
    }

    const companyId = me.company_id;
    if (!companyId && !isSuperAdmin) {
      return Response.json({ error: "Seu usuário não está vinculado a uma empresa." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const name = String(body.name || "").trim();
    if (!name) {
      return Response.json({ error: "Informe o nome do entrevistador." }, { status: 400 });
    }

    // Empresa de destino: a do admin (super-admin pode informar company_id)
    const targetCompanyId = isSuperAdmin && body.company_id ? body.company_id : companyId;
    if (!targetCompanyId) {
      return Response.json({ error: "Empresa de destino não informada." }, { status: 400 });
    }
    const companies = await svc.entities.Company.filter({ id: targetCompanyId });
    const company = companies[0];
    if (!company) {
      return Response.json({ error: "Empresa não encontrada." }, { status: 404 });
    }

    // Limite de usuários externos da empresa (entre 4 e 25). Conta apenas ativos.
    const rawLimit = Number(company.max_interviewers) || MIN_LIMIT;
    const limit = Math.min(Math.max(rawLimit, MIN_LIMIT), MAX_LIMIT);
    const existing = await svc.entities.FieldUser.filter({ company_id: targetCompanyId });
    const activeCount = existing.filter((u) => u.active !== false).length;
    if (activeCount >= limit) {
      return Response.json(
        { error: `Limite de ${limit} usuários externos atingido para esta empresa.` },
        { status: 409 },
      );
    }

    // Código de acesso único dentro da empresa
    let code = generateCode();
    for (let i = 0; i < 5; i++) {
      const clash = await svc.entities.FieldUser.filter({ access_code: code });
      if (clash.length === 0) break;
      code = generateCode();
    }

    const role = body.role === "supervisor" ? "supervisor" : "entrevistador";
    const fieldUser = await svc.entities.FieldUser.create({
      name,
      role,
      region: typeof body.region === "string" ? body.region : "",
      phone: typeof body.phone === "string" ? body.phone : "",
      notes: typeof body.notes === "string" ? body.notes : "",
      access_code: code,
      company_id: targetCompanyId,
      company_name: company.name || "",
      active: true,
      assigned_survey_ids: [],
    });

    return Response.json({ fieldUser });
  } catch (error) {
    return Response.json({ error: error.message || "Erro interno." }, { status: 500 });
  }
});
