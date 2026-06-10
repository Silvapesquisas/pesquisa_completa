/*
 * Service worker do app de campo: permite abrir o aplicativo sem conexão.
 *
 * Estratégia: network-first com fallback para cache. Recursos estáticos
 * (HTML, JS, CSS, fontes, imagens) são cacheados conforme são carregados;
 * quando offline, são servidos do cache. Requisições de API (não-GET ou
 * rotas /api) nunca são cacheadas — os dados offline ficam a cargo do
 * localStorage do próprio app.
 */
const CACHE_NAME = "entrevista-pro-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

const STATIC_DESTINATIONS = new Set(["document", "script", "style", "font", "image", "manifest", "worker"]);

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Nunca cacheia chamadas de API/funções — apenas o shell estático do app
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/functions")) return;
  if (!STATIC_DESTINATIONS.has(request.destination)) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && (url.origin === self.location.origin || response.type === "basic" || response.type === "cors")) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        // Navegação offline sem cache exato: devolve o shell do app (SPA)
        if (request.mode === "navigate") {
          const shell = await caches.match("/index.html") || await caches.match("/");
          if (shell) return shell;
        }
        return Response.error();
      })
  );
});
