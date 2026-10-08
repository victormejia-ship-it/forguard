/* Menú de módulos responsivo con ícono de hamburguesa (08-oct-2026, pedido
   de Victor con una captura real del encabezado en pantalla angosta
   mostrando SOLO "Resultados" y "Más", el resto de las pestañas
   desaparecido: "modifica que todo los menus puedan apilarse en las
   pestañas de mas o coloca un simbolo de lineas para mostrar mas,
   dependiendo del tamaño de la pantalla").

   Causa real: #selectorModulo (la fila de pestañas del encabezado) tenía
   overflow-x:auto con la barra de scroll escondida A PROPÓSITO (comentario
   ya existente en el HTML) — con 14+ módulos posibles, el sobrante se iba en
   scroll horizontal SIN ninguna pista visual de que hubiera más, quedando
   invisible de facto en pantallas angostas. No había ni JS que midiera el
   ancho disponible ni lógica de colapso: puro overflow-scroll silencioso.

   Arreglo (CSS + HTML, sin tocar pintarCabecera() — el forEach que ya
   esconde botones sin permiso con el selector
   "#selectorModulo [data-modulo], #panelMasModulos [data-modulo]" alcanza
   sin cambios porque usa un combinador descendiente, y el listener de clic
   de #panelMasModulos también usa closest('[data-modulo]'), así que
   cualquier botón nuevo adentro —sin importar cuán anidado— ya funciona):
   bajo los 840px (el breakpoint donde el encabezado YA se reorganizaba),
   #selectorModulo se esconde entero, el botón "Más" cambia su ícono de
   "Más ▾" a tres líneas horizontales (hamburguesa), y un grupo nuevo de
   botones DUPLICADOS (mismo data-modulo, mismo orden que la fila de
   pestañas) se revela dentro de #panelMasModulos vía display:contents —
   así "Más"/hamburguesa pasa a tener los 15 módulos, no solo los 6 de
   siempre. Arriba de 840px nada cambia: la fila de pestañas sigue siendo
   la navegación principal y "Más" sigue agrupando solo esos 6.

   De paso se corrigió un bug de posicionamiento que este mismo cambio
   introdujo: .mas-panel se ancla con right:0 contra .modulos-zona, que
   antes ocupaba casi todo el encabezado (su borde derecho caía cerca del
   borde derecho de la pantalla) — al encogerse a solo el botón de
   hamburguesa, pegado al logo, ese right:0 sacaba el panel entero de la
   pantalla por la izquierda. Bajo los 840px ahora se ancla con left:0. */
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
      sesion.correo='owner@a.com'; sesion.uid='u-owner'; sesion.idToken='FAKE'; sesion.refreshToken='F2';
      sesion.expira=Date.now()+3600000; sesion.rol='owner'; sesion.nombre='Victor Owner';
      ocultarAcceso();
    });
    await page.waitForTimeout(300);
    return page;
  }
  // Único helper confiable para "¿esto se ve de verdad?": un display:none en
  // el propio elemento, en un ancestro, o display:contents en el padre sin
  // que el elemento mismo se renderice, todos terminan aquí en 0 rects —
  // a diferencia de getComputedStyle(el).display, que no sabe nada de los
  // ancestros.
  const visibles = (page, selector) => page.$$eval(selector, els => els.filter(e => e.getClientRects().length > 0).map(e => e.dataset.modulo));

  // --------- 1) Pantalla ANCHA: todo igual que siempre ---------
  const ancho = await arrancar(1400);
  chkF('Ancho: la fila de pestañas SIGUE visible', await ancho.locator('#selectorModulo').isVisible());
  chkF('Ancho: el botón "Más" sigue diciendo "Más" (no el ícono de hamburguesa)', await ancho.locator('.mod-mas-txt').isVisible());
  chkF('Ancho: el ícono de hamburguesa NO se ve', !(await ancho.locator('.mod-mas-hamburguesa').isVisible()));
  await ancho.click('#btnMasModulos');
  await ancho.waitForTimeout(150);
  const modulosAncho = await visibles(ancho, '#panelMasModulos [data-modulo]');
  chkF('Ancho: "Más" sigue agrupando SOLO los 6 de siempre (sin el grupo duplicado)',
    modulosAncho.length === 6 && modulosAncho.includes('activos') && modulosAncho.includes('ayuda') && !modulosAncho.includes('resultados'));
  await ancho.close();

  // --------- 2) Pantalla ANGOSTA: la fila se esconde, "Más" se vuelve hamburguesa con TODO adentro ---------
  const angosto = await arrancar(390);
  chkF('Angosto: la fila de pestañas YA NO se ve (antes quedaba cortada sin avisar)', !(await angosto.locator('#selectorModulo').isVisible()));
  chkF('Angosto: el botón "Más" sigue existiendo y visible (ahora como hamburguesa)', await angosto.locator('#btnMasModulos').isVisible());
  chkF('Angosto: el texto "Más" se esconde...', !(await angosto.locator('.mod-mas-txt').isVisible()));
  chkF('...y el ícono de hamburguesa (3 líneas) lo reemplaza', await angosto.locator('.mod-mas-hamburguesa').isVisible());
  await angosto.click('#btnMasModulos');
  await angosto.waitForTimeout(150);
  const modulosAngosto = await visibles(angosto, '#panelMasModulos [data-modulo]');
  chkF('Angosto: los 9 módulos que antes vivían SOLO en la fila (invisible) ahora están en el panel',
    ['resultados','clientes','forpass','reportes','cocinas','levantamientos','visitas','polizas','cotizaciones'].every(m => modulosAngosto.includes(m)));
  chkF('Angosto: los 6 de siempre ("Más") SIGUEN ahí también', ['activos','proveedores','organigrama','imagen','equipos','ayuda'].every(m => modulosAngosto.includes(m)));
  chkF('Angosto: en total son los 15 módulos de MODULOS, ninguno de más ni de menos', modulosAngosto.length === 15);
  // El panel no debe quedar cortado contra el borde izquierdo de la pantalla
  // (bug real que introdujo este mismo cambio, ya corregido con left:0).
  const cajaPanel = await angosto.locator('#panelMasModulos').boundingBox();
  chkF('Angosto: el panel abierto no se sale de la pantalla por la izquierda', cajaPanel && cajaPanel.x >= 0);
  // Clic real en un módulo que antes era inalcanzable en esta pantalla: navega de verdad.
  // (Acotado a #panelMasModulos: el mismo data-modulo existe DOS veces en el
  // DOM — el original en #selectorModulo, oculto, y el duplicado de este
  // arreglo — un locator sin acotar agarraría el oculto por ser el primero.)
  await angosto.click('#panelMasModulos [data-modulo="clientes"]');
  await angosto.waitForTimeout(200);
  const moduloActivo = await angosto.evaluate(() => estado.modulo);
  chkF('Angosto: clic real en "Clientes" (antes inalcanzable sin esto) sí navega ahí', moduloActivo === 'clientes');
  await angosto.close();

  console.log('Errores capturados:', JSON.stringify(errores));
  chkF('No hubo errores de página en ningún ancho', errores.length === 0);
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
