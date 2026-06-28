// ============================================================================
// Camada de compatibilidade: expõe o MESMO objeto `base44` que o app já usava,
// mas implementado sobre o Supabase. Assim as páginas/componentes continuam
// chamando base44.entities.X / base44.auth / base44.functions sem alteração.
//
// Migração Base44 -> Supabase (Postgres + Auth + Edge Functions + Storage).
// ============================================================================
import { supabase } from "@/api/supabaseClient";

// Mapeia o nome de entidade do código para a tabela do Postgres
const TABLES = {
  Company: "companies",
  User: "users",
  FieldUser: "field_users",
  Survey: "surveys",
  SurveyVersion: "survey_versions",
  Interview: "interviews",
  Notification: "notifications",
};

function wrapError(error) {
  const e = new Error(error?.message || "Erro na requisição.");
  e.status = error?.status || error?.code;
  e.cause = error;
  return e;
}

function entity(name) {
  const table = TABLES[name];
  return {
    // filter({campo: valor, ...}, sort?, limit?) — sort "-campo" = desc
    async filter(query = {}, sort, limit) {
      let q = supabase.from(table).select("*");
      for (const [k, v] of Object.entries(query || {})) q = q.eq(k, v);
      if (sort) {
        const desc = sort.startsWith("-");
        q = q.order(desc ? sort.slice(1) : sort, { ascending: !desc });
      }
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw wrapError(error);
      return data || [];
    },
    list(sort, limit) {
      return this.filter({}, sort, limit);
    },
    async create(data) {
      const { data: row, error } = await supabase.from(table).insert(data).select().single();
      if (error) throw wrapError(error);
      return row;
    },
    async update(id, data) {
      const { data: row, error } = await supabase.from(table).update(data).eq("id", id).select().single();
      if (error) throw wrapError(error);
      return row;
    },
    async delete(id) {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw wrapError(error);
      return { id };
    },
    // Tempo real (usado só por Notification). Retorna função para cancelar.
    subscribe(cb) {
      const channel = supabase
        .channel(`rt-${table}-${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
          cb({ data: payload.new || payload.old, eventType: payload.eventType });
        })
        .subscribe();
      return () => supabase.removeChannel(channel);
    },
  };
}

const entities = Object.fromEntries(Object.keys(TABLES).map((n) => [n, entity(n)]));

// Invoca uma Edge Function preservando o contrato de erro (e.status / e.message)
async function invokeFunction(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body: body || {} });
  if (error) {
    let status = error?.context?.status;
    let message = error?.message;
    try {
      const j = await error?.context?.json?.();
      if (j?.error) message = j.error;
    } catch { /* ignore */ }
    const e = new Error(message || "Falha na função.");
    e.status = status;
    throw e;
  }
  return data;
}

const auth = {
  async me() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      const e = new Error("Não autenticado.");
      e.status = 401;
      throw e;
    }
    const { data: profile } = await supabase.from("users").select("*").eq("id", user.id).single();
    return { id: user.id, email: user.email, ...(profile || {}) };
  },
  async logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  },
  redirectToLogin() {
    window.location.href = "/login";
  },
};

const integrations = {
  Core: {
    async InvokeLLM(args) {
      const data = await invokeFunction("invokeLLM", args);
      return data?.text ?? "";
    },
    async UploadFile({ file }) {
      const path = `uploads/${crypto.randomUUID()}-${file.name || "file"}`;
      const { error } = await supabase.storage.from("audio").upload(path, file, {
        contentType: file.type || "application/octet-stream",
      });
      if (error) throw wrapError(error);
      const { data } = supabase.storage.from("audio").getPublicUrl(path);
      return { file_url: data.publicUrl };
    },
  },
};

const users = {
  // companyId só é respeitado quando o chamador é super-admin (validado no servidor);
  // para admins de empresa, o backend força a própria empresa.
  inviteUser(email, role, companyId) {
    return invokeFunction("inviteUser", { email, role, company_id: companyId });
  },
};

export const base44 = {
  entities,
  auth,
  functions: { invoke: invokeFunction },
  integrations,
  users,
};
