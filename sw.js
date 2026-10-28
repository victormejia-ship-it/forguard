/* Service worker mínimo: solo existe para que el navegador (sobre todo
   Android/Chrome) ofrezca "Instalar app"/"Agregar a pantalla de inicio" y
   para dar algo de resiliencia en conexiones móviles inestables.
   Estrategia: red primero, caché solo como respaldo si no hay internet.
   A propósito NO se cachea nada "a la primera visita" ni se sirve el caché
   cuando SÍ hay red: la app se actualiza seguido (git push despliega solo),
   y una app que sirviera una versión vieja del caché por error sería peor
   que no tener caché. Cada visita con internet reemplaza el caché con la
   versión más reciente que se acaba de descargar.

   28-oct-2026 (Victor reportó que varias computadoras se quedaron viendo
   una versión de hace semanas, y que ni Ctrl+Shift+R lo arreglaba): el
   `fetch(ev.request)` de abajo reenviaba el Request TAL CUAL llegó al
   service worker, con su modo de caché normal ("default") — ese modo
   SÍ puede devolver una respuesta ya guardada en el caché HTTP del disco
   sin tocar la red si el servidor mandó encabezados que lo permiten, y un
   Ctrl+Shift+R del usuario no llega a afectar esta llamada interna (esa
   semántica de "recarga forzada" es del navegador hacia SU request
   original, no se hereda al fetch que hace el propio service worker). Se
   fuerza `cache:'no-store'` para que esta llamada SIEMPRE toque la red de
   verdad cuando hay internet, sin importar qué haya quedado guardado. */
const CACHE = 'forguard-shell-v6';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', ev => {
  /* clients.claim() hace que ESTE service worker tome el control de las
     pestañas ya abiertas sin que haga falta cerrarlas — eso dispara
     "controllerchange" del lado de index.html, que ahí decide recargarse
     sola (antes nadie escuchaba ese evento: la pestaña se podía quedar
     corriendo el JS viejo indefinidamente hasta que alguien la cerraba y
     volvía a abrir por su cuenta). */
  ev.waitUntil(
    caches.keys()
      .then(nombres => Promise.all(nombres.filter(n => n !== CACHE).map(n => caches.delete(n))))
      .then(() => clients.claim())
  );
});

self.addEventListener('fetch', ev => {
  if(ev.request.method !== 'GET') return;
  ev.respondWith(
    fetch(ev.request, { cache: 'no-store' }).then(res => {
      const copia = res.clone();
      caches.open(CACHE).then(c => c.put(ev.request, copia)).catch(()=>{});
      return res;
    }).catch(() => caches.match(ev.request))
  );
});
