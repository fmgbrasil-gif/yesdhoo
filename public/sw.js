/* Service worker do player: mantem a pagina e seus scripts em cache para abrir sem internet.
   As midias da playlist sao guardadas pelo proprio player (Cache API). */
const SHELL = 'yd-shell-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

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
  // scripts e estilos tem nome unico por versao: cache primeiro
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); }
        return res;
      })),
    );
  }
});
