/* Mantem a pagina do player em cache para ela abrir mesmo se o aparelho ligar sem internet. */
const SHELL = 'yd-shell-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.mode !== 'navigate') return;
  if (!/\/player(\.php)?$/.test(new URL(req.url).pathname)) return; // so a pagina do player, nunca o painel
  event.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put('player', copy)); }
      return res;
    }).catch(() => caches.match('player').then((hit) => hit || Response.error())),
  );
});
