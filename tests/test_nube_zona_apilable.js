/* Botones del encabezado (tema, nombre, permiso, nube, notificaciones,
   pendientes, "Ver como…", Admin, Mi cuenta, Log out) se apilan en vez de
   desbordar la página en celular (08-oct-2026, mismo día y mismo pedido que
   test_menu_responsivo_hamburguesa.js: tras revisar el menú de módulos ya
   arreglado, Victor mandó una captura de esa misma fila de botones y
   preguntó "revisa cómo se ve ahora en el sitio web, y mismo caso crees que
   esos se puedan apilar de manera que se vea adecuado a la vista?").

   Causa real: `.nube-zona` (la fila completa de la derecha del encabezado)
   tenía `flex-shrink:0` SIN `flex-wrap` — el comentario original explicaba
   que "quien absorbe el apretón de espacio es .modulos, con su propio
   scroll", es decir, el diseño asumía que el menú de módulos de la
   izquierda se encargaba de absorber cualquier falta de espacio. Eso dejó
   de ser cierto el mismo día, cuando el menú de módulos pasó a colapsar a
   hamburguesa en vez de scrollear (ver test_menu_responsivo_hamburguesa.js)
   — desde ese momento, si esta fila de la derecha no cabía, YA NADA absorbía
   el apretón: en un celular angosto de verdad (390px, probado con los datos
   reales de Victor: nombre "Víctor Mejía Chávez", rol Owner) el botón
   "Log out" terminaba empujado fuera del borde derecho de la pantalla, sin
   scroll horizontal visible ni ningún aviso — comprobado con
   bodyScrollWidth (432px) > bodyClientWidth (390px) y la caja de #btnSalir
   arrancando en x=394, ya fuera de los 390px de ancho real.

   Arreglo, solo CSS: `.nube-zona` ahora tiene `flex-wrap:wrap` (sus propios
   botones pasan a una fila de abajo si no caben, en vez de desbordar) y
   `justify-content:flex-end` (cada fila se alinea a la derecha, igual que
   antes). Eso solo no bastaba: como único elemento de su propia línea
   dentro de `header.app`, `.nube-zona` se queda con el ancho que le pidan
   sus botones en vez del ancho real disponible, así que su propio
   `flex-wrap` no tenía contra qué romper línea — hacía falta además
   `flex-basis:100%` para que sí ocupara el ancho real de su renglón.

   SEGUNDA VUELTA el mismo día (Victor mandó otra captura mostrando esta
   misma fila, ahora con "Ver como…"/"Admin"/"Mi cuenta" con su texto
   completo —o sea, en una ventana de ESCRITORIO, no celular— y dijo
   "nuevamente revisa la apilacion de esta seccion porque se estan apilando
   de manera erronea"): el primer arreglo puso `flex-wrap` en `header.app` y
   `flex-basis:100%` en `.nube-zona` SOLO dentro de `@media(max-width:840px)`
   — el mismo error de fondo que ya se había corregido en el menú de
   módulos (ver test_menu_responsivo_hamburguesa.js): un ancho fijo, no el
   desborde real. Entre 841px y ~990px (comprobado con nombre+permiso+nube+
   notificaciones con número+pendientes con número+3 botones de texto) la
   fila de la cuenta YA NO cabía en una sola línea, pero `header.app` seguía
   en `nowrap` (nada por debajo de 840px) y `.nube-zona` sin su
   `flex-basis:100%` — mismo bug original: desborde horizontal silencioso,
   sin aviso, en una ventana de escritorio en vez de un celular.

   Arreglo real: la clase `.header-apilada` (mismo patrón que
   `.nav-colapsada`) la pone/quita `actualizarColapsoNav()` por desborde
   real de `header.app` (`scrollWidth` contra `clientWidth`, medido DESPUÉS
   de resolver si el menú de módulos ya colapsó a hamburguesa, porque eso
   cambia cuánto espacio le queda a la fila de la cuenta) — el `flex-wrap`
   de `header.app` y el `flex-basis:100%` de `.nube-zona` ahora cuelgan de
   esa clase en vez del media query de 840px, así que el apilado ocurre al
   ancho EXACTO donde la fila deja de caber, sea celular o una ventana de
   escritorio de cualquier tamaño. */
const { chromium } = require('playwright');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
const chk = (label, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' - ' + label); return cond; };
let fallas = 0;
const chkF = (label, cond) => { if(!chk(label, cond)) fallas++; };

(async () => {
  const browser = await chromium.launch(OPCIONES_NAVEGADOR);
  const errores = [];

  async function arrancar(width, opciones){
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.on('pageerror', e => errores.push('PAGEERROR (' + width + 'px): ' + e.message));
    await page.route('**identitytoolkit.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.route('**securetoken.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.route('**firestore.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.goto(URL_BASE + '/index.html');
    await page.waitForTimeout(400);
    await page.evaluate((conBadges) => {
      sesion.correo='victor.mejia@platoexpress.com'; sesion.uid='u-owner'; sesion.idToken='FAKE'; sesion.refreshToken='F2';
      sesion.expira=Date.now()+3600000; sesion.rol='owner'; sesion.nombre='Víctor Mejía Chávez';
      ocultarAcceso();
      render(); // ocultarAcceso() por sí sola no vuelve a pintar la cabecera.
      // Nombre largo + notificaciones/pendientes CON número son justo lo que
      // le faltaba de ancho a la fila real de Victor en la segunda vuelta.
      if(conBadges){
        const pn = document.getElementById('puntoNotificaciones'); if(pn){ pn.hidden = false; pn.textContent = '3'; }
        const pp = document.getElementById('puntoPendientes'); if(pp){ pp.hidden = false; pp.textContent = '5'; }
      }
    }, (opciones && opciones.conBadges) || false);
    await page.waitForTimeout(400);
    return page;
  }
  const sinDesborde = (page) => page.evaluate(() => document.body.scrollWidth <= window.innerWidth);

  // --------- 1) Pantalla ANCHA (1400px): todo en una sola fila, igual que siempre ---------
  const ancho = await arrancar(1400);
  chkF('Ancho: sin desborde horizontal de la página', await sinDesborde(ancho));
  const cajaNubeAncho = await ancho.locator('.nube-zona').boundingBox();
  chkF('Ancho: todos los botones de la derecha caben en una sola fila (altura ~una fila)', cajaNubeAncho && cajaNubeAncho.height < 45);
  chkF('Ancho: "Log out" se ve de verdad', await ancho.locator('#btnSalir').isVisible());
  await ancho.close();

  // --------- 2) Pantalla ANGOSTA (390px): el bug real reportado por Victor
  // --------- "crees que esos se puedan apilar de manera que se vea adecuado
  // --------- a la vista?" — antes esto desbordaba la página entera sin aviso.
  const angosto = await arrancar(390);
  chkF('Angosto (390px): YA NO hay desborde horizontal de la página (antes "Log out" se salía sin scroll)', await sinDesborde(angosto));
  chkF('Angosto: "Log out" sigue siendo alcanzable y visible (apilado, no cortado)', await angosto.locator('#btnSalir').isVisible());
  const cajaSalirAngosto = await angosto.locator('#btnSalir').boundingBox();
  chkF('Angosto: "Log out" queda DENTRO del ancho de la pantalla', cajaSalirAngosto && cajaSalirAngosto.x >= 0 && (cajaSalirAngosto.x + cajaSalirAngosto.width) <= 390);
  const cajaNubeAngosto = await angosto.locator('.nube-zona').boundingBox();
  chkF('Angosto: los botones SÍ se apilaron en más de una fila (más alto que una sola fila de ~30px)', cajaNubeAngosto && cajaNubeAngosto.height > 45);
  // Clic real en "Log out": antes de este arreglo, aunque el botón existiera
  // en el DOM, probar que de verdad se puede tocar (no solo "existe" fuera
  // de pantalla) es lo que importa para un usuario real en su celular.
  await angosto.click('#btnSalir');
  await angosto.waitForTimeout(150);
  const siguioLogueado = await angosto.evaluate(() => haySesion());
  chkF('Angosto: el clic en "Log out" (ya apilado) sí se registra — dispara el flujo de salir', !siguioLogueado);
  await angosto.close();

  // --------- 3) Pantalla donde YA cabían en una fila (480px): no se apila de más ---------
  const media = await arrancar(480);
  chkF('480px: sin desborde horizontal', await sinDesborde(media));
  const cajaNubeMedia = await media.locator('.nube-zona').boundingBox();
  chkF('480px: a este ancho ya cabían todos en una sola fila, y se queda en una (no se apila sin necesidad)', cajaNubeMedia && cajaNubeMedia.height < 45);
  await media.close();

  // --------- 4) Extremo (320px, el celular más angosto común): sigue sin desbordar ---------
  const extremo = await arrancar(320);
  chkF('320px: sin desborde horizontal ni en el caso más angosto común', await sinDesborde(extremo));
  chkF('320px: "Log out" sigue visible (apilado en una tercera fila si hace falta)', await extremo.locator('#btnSalir').isVisible());
  await extremo.close();

  // --------- 5) Ventana de ESCRITORIO mediana (950px), con notificaciones y
  // --------- pendientes con número: el caso real reportado por Victor en la
  // --------- segunda vuelta — más ancho que el viejo breakpoint de 840px,
  // --------- con texto completo en los botones, pero sin espacio real para
  // --------- toda la fila junta en una sola línea. ---------
  const escritorioMedio = await arrancar(950, { conBadges: true });
  chkF('950px (escritorio, no celular): sin desborde horizontal — antes se salía en silencio', await sinDesborde(escritorioMedio));
  chkF('950px: el encabezado SÍ se apiló (header-apilada), el menú de módulos ya era hamburguesa por su cuenta',
    await escritorioMedio.evaluate(() => document.querySelector('header.app').classList.contains('header-apilada')));
  chkF('950px: "Log out" sigue siendo alcanzable y visible', await escritorioMedio.locator('#btnSalir').isVisible());
  const cajaSalirMedio = await escritorioMedio.locator('#btnSalir').boundingBox();
  chkF('950px: "Log out" queda DENTRO del ancho de la ventana', cajaSalirMedio && (cajaSalirMedio.x + cajaSalirMedio.width) <= 950);
  await escritorioMedio.close();

  // --------- 6) Resize EN VIVO a esa misma zona (sin recargar la página) ---------
  const resizeMedio = await arrancar(1400);
  chkF('Resize: arranca ancha, sin apilar', !(await resizeMedio.evaluate(() => document.querySelector('header.app').classList.contains('header-apilada'))));
  await resizeMedio.setViewportSize({ width: 950, height: 900 });
  await resizeMedio.waitForTimeout(400);
  chkF('Resize: al angostar a 950px (sin recargar), se apila sola', await resizeMedio.evaluate(() => document.querySelector('header.app').classList.contains('header-apilada')));
  chkF('Resize: sin desborde horizontal tras el resize', await sinDesborde(resizeMedio));
  await resizeMedio.close();

  console.log('Errores capturados:', JSON.stringify(errores));
  chkF('No hubo errores de página en ningún ancho', errores.length === 0);
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
