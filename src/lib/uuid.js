// Gerador de UUID v4 local.
//
// Antes o app importava `uuid` de um CDN (cdn.jsdelivr.net) em tempo de
// execução. Como as páginas são carregadas de forma ansiosa, um CDN
// inacessível derrubava o boot do aplicativo inteiro — inclusive o App de
// Campo, que precisa abrir sem internet. Sem dependência externa isso não
// acontece mais.
export function uuidv4() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  // Navegadores sem randomUUID (contexto não seguro, WebView antiga):
  // monta o v4 a partir de bytes aleatórios criptográficos.
  const b = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40; // versão 4
  b[8] = (b[8] & 0x3f) | 0x80; // variante RFC 4122
  const h = [...b].map(x => x.toString(16).padStart(2, "0"));
  return `${h.slice(0, 4).join("")}-${h.slice(4, 6).join("")}-${h.slice(6, 8).join("")}-${h.slice(8, 10).join("")}-${h.slice(10).join("")}`;
}
