// Utilidades compartilhadas pelas Edge Functions (Deno).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Cliente com service role: IGNORA o RLS (uso exclusivo do backend confiável).
export function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

// Cliente no contexto do chamador (lê o JWT do header Authorization) para
// identificar o usuário autenticado do painel.
export function callerClient(req: Request) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      auth: { persistSession: false },
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    },
  );
}

// IP de origem da requisição (para rate limiting por IP).
export function clientIp(req: Request) {
  const fwd = req.headers.get("x-forwarded-for") || "";
  return (fwd.split(",")[0] || "").trim() || req.headers.get("cf-connecting-ip") || "desconhecido";
}

type SvcClient = ReturnType<typeof serviceClient>;

// Conta uma tentativa em `key` e diz se ela é permitida. Em caso de falha do
// banco, deixa passar (não derruba o serviço por causa do limitador).
export async function rateLimit(
  svc: SvcClient,
  key: string,
  limit: number,
  windowSeconds: number,
  blockSeconds: number,
): Promise<{ allowed: boolean; retryAfter: number }> {
  try {
    const { data, error } = await svc.rpc("rl_check", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
      p_block_seconds: blockSeconds,
    });
    if (error) return { allowed: true, retryAfter: 0 };
    return { allowed: data?.allowed !== false, retryAfter: Number(data?.retry_after) || 0 };
  } catch {
    return { allowed: true, retryAfter: 0 };
  }
}

// Zera o contador (ex.: após uma tentativa bem-sucedida).
export async function rateLimitReset(svc: SvcClient, key: string) {
  try { await svc.rpc("rl_reset", { p_key: key }); } catch { /* ignore */ }
}

// Resposta padrão de "excedeu o limite" (HTTP 429).
export function tooMany(retryAfter: number, msg?: string) {
  const mins = Math.max(1, Math.ceil(retryAfter / 60));
  return new Response(
    JSON.stringify({ error: msg || `Muitas tentativas. Tente novamente em ${mins} minuto(s).` }),
    {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(retryAfter || 60) },
    },
  );
}

// Início do mês corrente em ISO (UTC).
export function monthStartISO() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

// Código de acesso do App de Campo. Novos códigos têm 12 dígitos; os de 8
// gerados antes continuam válidos (ver ACCESS_CODE_RE).
export const ACCESS_CODE_DIGITS = 12;
export const ACCESS_CODE_RE = /^\d{8,12}$/;

export function generateAccessCode(digits = ACCESS_CODE_DIGITS) {
  // crypto.getRandomValues: aleatoriedade criptográfica (não Math.random).
  const bytes = new Uint32Array(digits);
  crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < digits; i++) code += String(bytes[i] % 10);
  // evita começar com 0 para não perder dígitos em campos numéricos
  if (code[0] === "0") code = "1" + code.slice(1);
  return code;
}

// ── Vínculo de dispositivo ────────────────────────────────────────────────
// Um código só funciona em um aparelho por vez. Devolve:
//   ok            -> pode seguir
//   blocked       -> outro aparelho já está vinculado
//   justBound     -> este aparelho acabou de assumir o vínculo
export type DeviceCheck = { ok: boolean; blocked?: boolean; justBound?: boolean };

export async function checkDeviceBinding(
  svc: ReturnType<typeof serviceClient>,
  fieldUser: Record<string, unknown>,
  deviceId: string,
  deviceLabel?: string,
): Promise<DeviceCheck> {
  const bound = (fieldUser.device_id as string) || null;
  const now = new Date().toISOString();

  if (!deviceId) return { ok: true }; // app antigo, sem device: não trava

  if (!bound) {
    await svc.from("field_users").update({
      device_id: deviceId,
      device_label: (deviceLabel || "").slice(0, 120),
      device_bound_at: now,
      last_seen_at: now,
    }).eq("id", fieldUser.id as string);
    return { ok: true, justBound: true };
  }

  if (bound !== deviceId) return { ok: false, blocked: true };

  await svc.from("field_users").update({ last_seen_at: now }).eq("id", fieldUser.id as string);
  return { ok: true };
}

// Cria uma notificação para todos os gestores (admin/supervisor) da empresa.
export async function notifyCompanyManagers(
  svc: ReturnType<typeof serviceClient>,
  companyId: string,
  n: { type: string; title: string; message: string; link_page?: string; link_id?: string },
) {
  const { data: managers } = await svc
    .from("users").select("email")
    .eq("company_id", companyId).in("role", ["admin", "supervisor"]);
  if (!managers || managers.length === 0) return;
  await svc.from("notifications").insert(
    managers.map((m: { email: string }) => ({
      user_email: m.email,
      company_id: companyId,
      type: n.type,
      title: n.title,
      message: n.message,
      read: false,
      link_page: n.link_page || null,
      link_id: n.link_id || null,
    })),
  );
}

// Evita repetir a mesma notificação para a empresa dentro do mês.
export async function alreadyNotifiedThisMonth(
  svc: ReturnType<typeof serviceClient>,
  companyId: string,
  type: string,
) {
  const { data } = await svc.from("notifications")
    .select("id").eq("company_id", companyId).eq("type", type)
    .gte("created_date", monthStartISO()).limit(1);
  return !!(data && data.length > 0);
}
