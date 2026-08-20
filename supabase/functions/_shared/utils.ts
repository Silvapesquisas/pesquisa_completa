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
