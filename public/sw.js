/* Service worker do player: mantem a pagina e seus scripts em cache para abrir sem internet.
   As midias da playlist sao guardadas pelo proprio player (Cache API). */
const SHELL = 'yd-shell-v2';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(
  // apaga versoes antigas do cache da pagina e assume o controle
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('yd-shell-') && k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
));

// o player manda a lista da propria pagina (scripts, estilos, logos) para guardar ja no primeiro uso
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'warm' || !Array.isArray(data.urls)) return;
  event.waitUntil(caches.open(SHELL).then((c) => Promise.all(data.urls.map((u) => {
    const key = new URL(u, self.location.origin);
    if (key.origin !== self.location.origin) return null;
    return fetch(key.href, { credentials: 'same-origin' }).then((res) => (res.ok ? c.put(key.pathname === '/player' ? '/player' : key.href, res) : null)).catch(() => null);
  }))));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // pagina do player: rede primeiro; sem conexao, usa a ultima copia
  if (req.mode === 'navigate' && url.pathname === '/player') {
    event.respondWith(
      fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put('/player', copy)); }
        return res;
      }).catch(() => caches.match('/player').then((hit) => hit || Response.error())),
    );
    return;
  }
  // scripts e estilos tem nome unico por versao (e os logos da abertura): cache primeiro
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/brand/')) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); }
        return res;
      })),
    );
  }
});
