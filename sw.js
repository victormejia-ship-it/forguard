/* Service worker mínimo: solo existe para que el navegador (sobre todo
   Android/Chrome) ofrezca "Instalar app"/"Agregar a pantalla de inicio" y
   para dar algo de resiliencia en conexiones móviles inestables.
   Estrategia: red primero, caché solo como respaldo si no hay internet.
   A propósito NO se cachea nada "a la primera visita" ni se sirve el caché
   cuando SÍ hay red: la app se actualiza seguido (git push despliega solo),
   y una app que sirviera una versión vieja del caché por error sería peor
   que no tener caché. Cada visita con internet reemplaza el caché con la
   versión más reciente que se acaba de descargar. */
const CACHE = 'forguard-shell-v4';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches.keys()
      .then(nombres => Promise.all(nombres.filter(n => n !== CACHE).map(n => caches.delete(n))))
      .then(() => clients.claim())
  );
});

self.addEventListener('fetch', ev => {
  if(ev.request.method !== 'GET') return;
  ev.respondWith(
    fetch(ev.request).then(res => {
      const copia = res.clone();
      caches.open(CACHE).then(c => c.put(ev.request, copia)).catch(()=>{});
      return res;
    }).catch(() => caches.match(ev.request))
  );
});
