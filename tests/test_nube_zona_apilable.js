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
   dentro de `header.app` (que ya tiene su flex-wrap desde los 840px),
   `.nube-zona` se queda con el ancho que le pidan sus botones en vez del
   ancho real disponible, así que su propio `flex-wrap` no tenía contra qué
   romper línea. Por eso, dentro del mismo `@media(max-width:840px)` que ya
   reorganiza el resto del encabezado, se agregó `flex-basis:100%` — ahí sí
   ocupa el ancho real de su renglón y el `flex-wrap` de arriba puede
   envolver los botones que sobren a una fila (o dos) de abajo. A 840px
   (donde ya cabían todos en una sola fila) no cambia nada a simple vista:
   flex-basis:100% con contenido que ya cabe se ve igual. */
const { chromium } = require('playwright');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
const chk = (label, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' - ' + label); return cond; };
let fallas = 0;
const chkF = (label, cond) => { if(!chk(label, cond)) fallas++; };

(async () => {
  const browser = await chromium.launch(OPCIONES_NAVEGADOR);
  const errores = [];

  async function arrancar(width){
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.on('pageerror', e => errores.push('PAGEERROR (' + width + 'px): ' + e.message));
    await page.route('**identitytoolkit.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.route('**securetoken.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.route('**firestore.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.goto(URL_BASE + '/index.html');
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      sesion.correo='victor.mejia@platoexpress.com'; sesion.uid='u-owner'; sesion.idToken='FAKE'; sesion.refreshToken='F2';
      sesion.expira=Date.now()+3600000; sesion.rol='owner'; sesion.nombre='Víctor Mejía Chávez';
      ocultarAcceso();
      render(); // ocultarAcceso() por sí sola no vuelve a pintar la cabecera.
    });
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

  console.log('Errores capturados:', JSON.stringify(errores));
  chkF('No hubo errores de página en ningún ancho', errores.length === 0);
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
