// Geração de texto por IA (insights do dashboard e análise dos relatórios).
// Substitui o base44 InvokeLLM, chamando a API da Anthropic.
//
// Entrada:  { prompt: string, model?: string }
// Saída:    { text: string }
import { corsHeaders, json, callerClient } from "../_shared/utils.ts";

// Mapeia nomes vindos do código antigo para IDs atuais da Anthropic
function mapModel(m?: string) {
  if (!m) return "claude-sonnet-4-6";
  if (m.includes("opus")) return "claude-opus-4-8";
  if (m.includes("haiku")) return "claude-haiku-4-5-20251001";
  return "claude-sonnet-4-6";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    // Só usuários autenticados do painel podem gerar IA
    const { data: { user } } = await callerClient(req).auth.getUser();
    if (!user) return json({ error: "Não autenticado." }, 401);

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "Chave da Anthropic não configurada no servidor." }, 500);

    const { prompt, model } = await req.json().catch(() => ({}));
    if (!prompt || typeof prompt !== "string") return json({ error: "Prompt ausente." }, 400);

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: mapModel(model),
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await resp.json();
    if (!resp.ok) return json({ error: data?.error?.message || "Falha na IA." }, 502);

    const text = (data?.content || []).map((b: { text?: string }) => b.text || "").join("").trim();
    return json({ text });
  } catch (error) {
    return json({ error: (error as Error).message || "Erro interno." }, 500);
  }
});
