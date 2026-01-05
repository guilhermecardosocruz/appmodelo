/* Next.js-friendly Service Worker
   - NÃO cacheia HTML de rotas (evita "chunks mismatch" no mobile)
   - Navegação: network-first (fallback offline simples)
   - Assets: stale-while-revalidate
*/

const CACHE_VERSION = "v3";
const STATIC_CACHE = `auth-pwa-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `auth-pwa-runtime-${CACHE_VERSION}`;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      // Criamos caches vazios para garantir existência
      await caches.open(STATIC_CACHE);
      await caches.open(RUNTIME_CACHE);
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((k) => {
          if (k !== STATIC_CACHE && k !== RUNTIME_CACHE) return caches.delete(k);
          return undefined;
        })
      );
      await self.clients.claim();
    })()
  );
});

function isNextStaticAsset(url) {
  return url.pathname.startsWith("/_next/static/");
}

function isFileAsset(url) {
  return (
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/images/") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".jpeg") ||
    url.pathname.endsWith(".webp") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".json") ||
    url.pathname.endsWith(".txt") ||
    url.pathname.endsWith(".woff") ||
    url.pathname.endsWith(".woff2")
  );
}

function offlineHtml() {
  return new Response(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Offline</title></head><body style="font-family:system-ui;background:#0b1220;color:#e5e7eb;padding:24px"><h1>Você está offline</h1><p>Conecte-se à internet e tente novamente.</p></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // NÃO intercepta outras origens
  if (url.origin !== self.location.origin) return;

  // 1) Navegação (HTML): network-first (não cachear HTML de páginas)
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          return fresh;
        } catch {
          // Sem rede: devolve uma página offline simples (sem cache)
          return offlineHtml();
        }
      })()
    );
    return;
  }

  // 2) Assets do Next e arquivos: stale-while-revalidate
  if (isNextStaticAsset(url) || isFileAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(req);

        const fetchPromise = fetch(req)
          .then((res) => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => null);

        // se tiver cache, usa cache e atualiza em background
        if (cached) {
          event.waitUntil(fetchPromise);
          return cached;
        }

        // se não tiver cache, tenta rede
        const fresh = await fetchPromise;
        if (fresh) return fresh;

        // sem cache e sem rede
        return new Response("", { status: 504 });
      })()
    );
    return;
  }

  // 3) Default: passa direto pra rede (sem cache)
});
