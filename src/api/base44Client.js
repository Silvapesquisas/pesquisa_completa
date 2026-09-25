// ============================================================================
// Camada de compatibilidade: expõe o MESMO objeto `base44` que o app já usava,
// mas implementado sobre o Supabase. Assim as páginas/componentes continuam
// chamando base44.entities.X / base44.auth / base44.functions sem alteração.
//
// Migração Base44 -> Supabase (Postgres + Auth + Edge Functions + Storage).
// ============================================================================
import { supabase } from "@/api/supabaseClient";
import { deviceInfo } from "@/lib/device";

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

// Colunas de data/hora por tabela. Um <input type="date"> vazio devolve "",
// que o Postgres rejeita ("invalid input syntax for type date"). Converter
// para null aqui cobre TODOS os caminhos de gravação (formulário, duplicação,
// restauração de versão).
const DATE_COLUMNS = {
  surveys: ["start_date", "end_date"],
  interviews: ["completed_at"],
};

function normalizeDates(table, data) {
  const cols = DATE_COLUMNS[table];
  if (!cols || !data || typeof data !== "object") return data;
  const out = { ...data };
  for (const c of cols) {
    if (c in out && (out[c] === "" || out[c] === undefined)) out[c] = null;
  }
  return out;
}

// Máximo de linhas que o Supabase devolve por consulta.
const PAGE_SIZE = 1000;

function entity(name) {
  const table = TABLES[name];
  return {
    // filter({campo: valor, ...}, sort?, limit?) — sort "-campo" = desc
    //
    // Sem `limit`, devolve TODOS os registros. O Supabase entrega no máximo
    // 1000 linhas por consulta (e corta o resto em silêncio), então a busca é
    // feita em páginas até acabar. O "id" como desempate deixa a ordem estável
    // entre as páginas.
    async filter(query = {}, sort, limit) {
      const build = (withCount) => {
        let q = supabase.from(table).select("*", withCount ? { count: "exact" } : undefined);
        for (const [k, v] of Object.entries(query || {})) q = q.eq(k, v);
        if (sort) {
          const desc = sort.startsWith("-");
          q = q.order(desc ? sort.slice(1) : sort, { ascending: !desc });
        }
        return q.order("id", { ascending: true });
      };
      const rows = [];
      const seen = new Set();
      let total = null; // total no servidor, informado na primeira página
      let from = 0;
      for (;;) {
        const want = limit ? Math.min(PAGE_SIZE, limit - from) : PAGE_SIZE;
        if (want <= 0) break;
        const { data, error, count } = await build(from === 0).range(from, from + want - 1);
        if (error) throw wrapError(error);
        if (from === 0 && typeof count === "number") total = count;
        if (!data || data.length === 0) break;
        // Um registro criado durante a leitura pode empurrar outro para a página
        // seguinte; o `seen` evita que ele apareça duas vezes.
        for (const r of data) if (!seen.has(r.id)) { seen.add(r.id); rows.push(r); }
        // Avança pelo que de fato veio: se o servidor usar páginas menores que
        // PAGE_SIZE, nada é pulado.
        from += data.length;
        if (total !== null ? from >= total : data.length < want) break;
      }
      return rows;
    },
    list(sort, limit) {
      return this.filter({}, sort, limit);
    },
    async create(data) {
      const { data: row, error } = await supabase.from(table).insert(normalizeDates(table, data)).select().single();
      if (error) throw wrapError(error);
      return row;
    },
    async update(id, data) {
      const { data: row, error } = await supabase.from(table).update(normalizeDates(table, data)).eq("id", id).select().single();
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

// Funções do App de Campo: recebem automaticamente a identidade do aparelho,
// usada para vincular o código a UM celular por vez.
const FIELD_FUNCTIONS = new Set(["fieldLogin", "fieldSubmitInterview"]);

// Invoca uma Edge Function preservando o contrato de erro (e.status / e.message).
// `timeoutMs` cancela a requisição: com sinal fraco ela pode ficar pendurada
// indefinidamente, e o App de Campo precisa seguir em frente (a entrevista já
// está salva no aparelho e o servidor descarta reenvios duplicados).
async function invokeFunction(name, body, { timeoutMs } = {}) {
  const payload = FIELD_FUNCTIONS.has(name)
    ? { ...deviceInfo(), ...(body || {}) }
    : (body || {});
  const controller = timeoutMs ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  let data, error;
  try {
    ({ data, error } = await supabase.functions.invoke(name, {
      body: payload,
      ...(controller ? { signal: controller.signal } : {}),
    }));
  } catch (e) {
    if (controller?.signal.aborted) {
      const te = new Error("Sem resposta do servidor (conexão lenta).");
      te.timeout = true;
      throw te;
    }
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (error && controller?.signal.aborted) {
    const te = new Error("Sem resposta do servidor (conexão lenta).");
    te.timeout = true;
    throw te;
  }
  if (error) {
    let status = error?.context?.status;
    let message = error?.message;
    let code;
    try {
      const j = await error?.context?.json?.();
      if (j?.error) message = j.error;
      if (j?.code) code = j.code;
    } catch { /* ignore */ }
    const e = new Error(message || "Falha na função.");
    e.status = status;
    e.code = code; // ex.: "device_blocked"
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

const stats = {
  // Entrevistas por empresa (mês corrente e total). O RLS decide o alcance:
  // admin vê a própria empresa; super-admin vê todas.
  async companyInterviews() {
    const { data, error } = await supabase.rpc("company_interview_stats");
    if (error) throw wrapError(error);
    const map = {};
    for (const r of data || []) {
      map[r.company_id] = { used: Number(r.used_this_month) || 0, total: Number(r.total) || 0 };
    }
    return map;
  },
};

const answers = {
  // Troca, em todas as entrevistas da pesquisa, as grafias `from` (textos exatos
  // como gravados) pela resposta padrão `to`. Registra no histórico de cada
  // entrevista. Devolve quantas entrevistas mudaram (0 se o usuário não puder
  // editar entrevistas — o RLS decide).
  async standardize({ surveyId, questionIds, from, to }) {
    const { data, error } = await supabase.rpc("standardize_answers", {
      p_survey_id: surveyId, p_question_ids: questionIds, p_from: from, p_to: to,
    });
    if (error) throw wrapError(error);
    return Number(data) || 0;
  },
};

const storage = {
  // Gera uma URL assinada (temporária) para um caminho de áudio no bucket
  // privado. Aceita URLs http antigas por compatibilidade. Retorna null se falhar.
  async signedAudioUrl(pathOrUrl, expiresIn = 3600) {
    if (!pathOrUrl) return null;
    // Entrevistas antigas guardavam a URL pública do bucket, que deixou de
    // funcionar quando ele virou privado: extrai o caminho e assina.
    const legacy = /\/storage\/v1\/object\/(?:public|sign)\/audio\/([^?#]+)/.exec(pathOrUrl);
    if (legacy) pathOrUrl = decodeURIComponent(legacy[1]);
    else if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
    const { data, error } = await supabase.storage.from("audio").createSignedUrl(pathOrUrl, expiresIn);
    if (error) return null;
    return data?.signedUrl || null;
  },
};

const users = {
  // companyId só é respeitado quando o chamador é super-admin (validado no servidor);
  // para admins de empresa, o backend força a própria empresa.
  inviteUser(email, role, companyId) {
    return invokeFunction("inviteUser", { email, role, company_id: companyId });
  },
  // Define uma senha (temporária) para outro usuário — admin/super-admin.
  setPassword(userId, password) {
    return invokeFunction("setUserPassword", { user_id: userId, password });
  },
};

export const base44 = {
  entities,
  auth,
  functions: { invoke: invokeFunction },
  integrations,
  users,
  storage,
  stats,
  answers,
};
