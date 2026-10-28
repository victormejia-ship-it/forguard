/* Service worker: fuerza red real y se recarga solo al detectar versión
   nueva (28-oct-2026, Victor reportó que varias computadoras se quedaron
   viendo una versión de semanas atrás y ni Ctrl+Shift+R lo arreglaba).

   Dos cambios, probados aquí:
   1) sw.js ahora pide la red con {cache:'no-store'} — antes el
      fetch(ev.request) interno podía resolverse con el caché HTTP del
      disco sin tocar la red, algo que un Ctrl+Shift+R del usuario no
      alcanza a corregir (esa recarga forzada es sobre el request del
      navegador, no sobre el fetch interno del propio service worker).
   2) index.html ahora escucha "controllerchange" y se recarga solo UNA
      vez cuando un service worker nuevo toma el control — pero SOLO si ya
      había un controlador antes de registrar (si no, cualquier primera
      visita se recargaría sola de pura casualidad, por pasar de "sin
      controlador" a "con controlador"). */
const { chromium } = require('playwright');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
const chk = (label, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' - ' + label); return cond; };
let fallas = 0;
const chkF = (label, cond) => { if(!chk(label, cond)) fallas++; };

(async () => {
  const browser = await chromium.launch(OPCIONES_NAVEGADOR);
  const context = await browser.newContext();
  const page = await context.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push('PAGEERROR: ' + e.message));

  // location.reload() no se puede sustituir de forma confiable (el objeto
  // Location de Chromium ignora el override incluso con
  // Object.defineProperty, por las mismas protecciones de navegación que
  // aplican entre orígenes) — en vez de interceptarlo, se cuenta cuántas
  // veces la página de verdad recarga con el evento 'load' de Playwright.
  let recargas = -1; // la primera carga (page.goto) no cuenta como "recarga sola"
  page.on('load', () => { recargas++; });

  // --------- 1) Primera visita: el service worker se instala, pero NO se recarga solo ---------
  await page.goto(URL_BASE + '/index.html');

  // sw.js en sí: trae la versión nueva y el fetch con no-store.
  const swTexto = await page.evaluate(async () => (await fetch('sw.js')).text());
  chkF('sw.js subió de versión de caché (forguard-shell-v6)', swTexto.includes("forguard-shell-v6"));
  chkF('sw.js pide la red con cache:\'no-store\' (no se conforma con el caché HTTP del disco)', swTexto.includes("cache: 'no-store'") || swTexto.includes('cache:\'no-store\''));

  await page.waitForFunction(() => navigator.serviceWorker.controller != null, null, { timeout: 15000 });
  await page.waitForTimeout(200);
  chkF('En la primera visita (sin controlador previo), instalar el service worker NO dispara una recarga sola', recargas === 0);

  // --------- 2) Segunda carga: YA hay controlador activo al entrar ---------
  recargas = -1; // esta recarga es manual (la hace la prueba), no cuenta
  await page.reload();
  await page.waitForTimeout(200);
  const yaControlaba = await page.evaluate(() => navigator.serviceWorker.controller != null);
  chkF('En una segunda carga, el service worker YA controla la página desde el inicio', yaControlaba);
  chkF('Esa segunda carga tampoco se recargó sola (nada cambió de verdad todavía)', recargas === 0);

  // --------- 3) Simular que un service worker NUEVO toma el control: debe recargarse UNA vez ---------
  // Se dispara el evento DOS veces seguidas, sin esperar entre una y otra —
  // es justo el caso que protege la bandera yaRecargando: sin ella, las dos
  // llamadas a location.reload() podrían encimarse antes de que la primera
  // navegación alcance a arrancar.
  recargas = 0;
  await Promise.all([
    page.waitForEvent('load', { timeout: 5000 }),
    page.evaluate(() => {
      navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
      navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
    })
  ]);
  await page.waitForTimeout(300);
  chkF('Al cambiar de controlador (versión nueva al mando) la página se recarga, y solo UNA vez pese a dispararse el aviso dos veces seguidas (bandera yaRecargando)', recargas === 1);

  chkF('No hubo errores de página en todo el escenario', errores.length === 0);
  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
