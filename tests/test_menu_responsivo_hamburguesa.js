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

   Arreglo (sin tocar pintarCabecera() — el forEach que ya esconde botones
   sin permiso con el selector "#selectorModulo [data-modulo],
   #panelMasModulos [data-modulo]" alcanza sin cambios porque usa un
   combinador descendiente, y el listener de clic de #panelMasModulos
   también usa closest('[data-modulo]'), así que cualquier botón nuevo
   adentro —sin importar cuán anidado— ya funciona): #selectorModulo se
   esconde entero, el botón "Más" cambia su ícono de "Más ▾" a tres líneas
   horizontales (hamburguesa), y un grupo nuevo de botones DUPLICADOS (mismo
   data-modulo, mismo orden que la fila de pestañas) se revela dentro de
   #panelMasModulos vía display:contents — así "Más"/hamburguesa pasa a
   tener los 15 módulos, no solo los 6 de siempre.

   SEGUNDA VUELTA (mismo día, Victor probó en celular —ya andaba bien tras
   limpiar caché— y reportó "en celular si, en el sitio web no me aparece de
   esa manera"): el primer arreglo colapsaba con un media query fijo a
   840px, el mismo ancho donde el encabezado YA se reorganizaba por otras
   razones. Entre ese punto y el ancho real que hacía falta para que
   cupieran las 10 pestañas (comprobado: 890px de contenido), la fila seguía
   con el mismo bug original —scroll horizontal escondido, pestañas
   invisibles de facto— nada más que a un ancho de ESCRITORIO, no de
   celular. Arreglo: actualizarColapsoNav() mide el desborde real de
   #selectorModulo (scrollWidth contra clientWidth, con un
   requestAnimationFrame de por medio porque medir en el mismo tick
   síncrono de pintarCabecera() —a mitad de un login que todavía iba a
   tocar más cosas del encabezado— daba un ancho todavía no definitivo) y
   pone/quita la clase .nav-colapsada en #zonaModulos, de la que ahora
   dependen las reglas CSS (ya no del media query de 840px). Se llama al
   cargar, en cada resize (debounced) y al final de pintarCabecera() —cambiar
   qué pestañas están permitidas por rol también cambia cuánto espacio hace
   falta. El resultado es que el colapso ocurre al ancho EXACTO donde las
   pestañas dejan de caber, sea celular, una ventana angosta de escritorio,
   o cualquier punto intermedio donde el encabezado no se haya compactado
   todavía (ver el caso de 900px abajo: no cabe, aunque 840px sí cabía, por
   el resto del encabezado sin compactar a ese ancho).

   De paso, mismo pedido: "De igual manera acomodalos en orden alfabetico,
   con la excepcion de que resultados siempre sea el primero" — las 10
   pestañas principales (y su duplicado en el panel) quedan con "Mi agenda"
   (técnico) y "Resultados" fijos primero —nunca compiten por el mismo
   lugar, modulosPermitidos() jamás los da juntos a una misma cuenta— y el
   resto alfabético: Clientes, Cocinas, Cotizaciones, Forpass,
   Levantamientos, Pólizas, Reportes, Visitas. Los 6 de "Más" de siempre
   también alfabético: Activos, Ayuda, Catálogo de equipos, Imagen /
   Aperturas, Organigrama, Proveedores.

   Bug de posicionamiento ya corregido en la primera vuelta, ahora atado a
   .nav-colapsada en vez del media query: .mas-panel se ancla con right:0
   contra .modulos-zona, que con la fila de pestañas visible ocupaba casi
   todo el encabezado (su borde derecho caía cerca del borde derecho de la
   pantalla) — al encogerse a solo el botón de hamburguesa, pegado al logo,
   ese right:0 sacaba el panel entero de la pantalla por la izquierda.
   Colapsada, se ancla con left:0. */
const { chromium } = require('playwright');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
const chk = (label, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' - ' + label); return cond; };
let fallas = 0;
const chkF = (label, cond) => { if(!chk(label, cond)) fallas++; };

const ORDEN_PRINCIPAL = ['mi-agenda','resultados','clientes','cocinas','cotizaciones','forpass','levantamientos','polizas','reportes','visitas'];
const ORDEN_GRUPO_MAS = ['activos','ayuda','equipos','imagen','organigrama','proveedores'];

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
    await page.waitForTimeout(400);
    return page;
  }
  // Único helper confiable para "¿esto se ve de verdad?": un display:none en
  // el propio elemento, en un ancestro, o display:contents en el padre sin
  // que el elemento mismo se renderice, todos terminan aquí en 0 rects —
  // a diferencia de getComputedStyle(el).display, que no sabe nada de los
  // ancestros.
  const visibles = (page, selector) => page.$$eval(selector, els => els.filter(e => e.getClientRects().length > 0).map(e => e.dataset.modulo));
  const colapsada = (page) => page.evaluate(() => document.getElementById('zonaModulos').classList.contains('nav-colapsada'));

  // --------- 1) Pantalla ANCHA (1400px): todo igual que siempre ---------
  const ancho = await arrancar(1400);
  chkF('Ancho: #zonaModulos NO está colapsada (todo cabe)', !(await colapsada(ancho)));
  chkF('Ancho: la fila de pestañas SIGUE visible', await ancho.locator('#selectorModulo').isVisible());
  chkF('Ancho: el botón "Más" sigue diciendo "Más" (no el ícono de hamburguesa)', await ancho.locator('.mod-mas-txt').isVisible());
  chkF('Ancho: el ícono de hamburguesa NO se ve', !(await ancho.locator('.mod-mas-hamburguesa').isVisible()));
  const ordenPrincipalAncho = await ancho.$$eval('#selectorModulo [data-modulo]', els => els.map(e=>e.dataset.modulo));
  chkF('Ancho: la fila de pestañas está en orden alfabético (Resultados primero)', JSON.stringify(ordenPrincipalAncho) === JSON.stringify(ORDEN_PRINCIPAL));
  await ancho.click('#btnMasModulos');
  await ancho.waitForTimeout(150);
  const modulosAncho = await visibles(ancho, '#panelMasModulos [data-modulo]');
  chkF('Ancho: "Más" sigue agrupando SOLO los 6 de siempre (sin el grupo duplicado)',
    modulosAncho.length === 6 && modulosAncho.includes('activos') && modulosAncho.includes('ayuda') && !modulosAncho.includes('resultados'));
  chkF('Ancho: esos 6 de "Más" están en orden alfabético', JSON.stringify(modulosAncho) === JSON.stringify(ORDEN_GRUPO_MAS));
  await ancho.close();

  // --------- 2) Pantalla MEDIANA (900px): el bug real reportado por Victor
  // ---------  "en celular si, en el sitio web no me aparece de esa
  // manera" — a este ancho las 10 pestañas (890px de contenido) ya no caben,
  // pero 900px > 840px, así que el media query viejo NUNCA habría colapsado
  // acá: con el arreglo por desborde real sí debe colapsar.
  const medio = await arrancar(900);
  chkF('Medio (900px): SÍ está colapsada (el bug original: no cabían, sin aviso)', await colapsada(medio));
  chkF('Medio: la fila de pestañas ya no se ve', !(await medio.locator('#selectorModulo').isVisible()));
  chkF('Medio: "Más" pasó a ser el ícono de hamburguesa', await medio.locator('.mod-mas-hamburguesa').isVisible());
  await medio.click('#btnMasModulos');
  await medio.waitForTimeout(150);
  const cajaPanelMedio = await medio.locator('#panelMasModulos').boundingBox();
  chkF('Medio: el panel abierto no se sale de la pantalla por la izquierda', cajaPanelMedio && cajaPanelMedio.x >= 0);
  await medio.close();

  // --------- 3) Pantalla ANGOSTA (390px): la fila se esconde, "Más" se vuelve hamburguesa con TODO adentro ---------
  const angosto = await arrancar(390);
  chkF('Angosto: #zonaModulos está colapsada', await colapsada(angosto));
  chkF('Angosto: la fila de pestañas YA NO se ve (antes quedaba cortada sin avisar)', !(await angosto.locator('#selectorModulo').isVisible()));
  chkF('Angosto: el botón "Más" sigue existiendo y visible (ahora como hamburguesa)', await angosto.locator('#btnMasModulos').isVisible());
  chkF('Angosto: el texto "Más" se esconde...', !(await angosto.locator('.mod-mas-txt').isVisible()));
  chkF('...y el ícono de hamburguesa (3 líneas) lo reemplaza', await angosto.locator('.mod-mas-hamburguesa').isVisible());
  await angosto.click('#btnMasModulos');
  await angosto.waitForTimeout(150);
  const modulosAngosto = await visibles(angosto, '#panelMasModulos [data-modulo]');
  chkF('Angosto: los 9 módulos que antes vivían SOLO en la fila (invisible) ahora están en el panel',
    ['resultados','clientes','forpass','reportes','cocinas','levantamientos','visitas','polizas','cotizaciones'].every(m => modulosAngosto.includes(m)));
  chkF('Angosto: los 6 de siempre ("Más") SIGUEN ahí también', ORDEN_GRUPO_MAS.every(m => modulosAngosto.includes(m)));
  chkF('Angosto: en total son los 15 módulos de MODULOS, ninguno de más ni de menos', modulosAngosto.length === 15);
  // El Owner no tiene "mi-agenda" permitido (es técnico-only, ver
  // modulosPermitidos()), así que de los 10 del grupo duplicado solo 9 se
  // ven — mismo orden alfabético, nada más sin ese primero.
  const ordenPrincipalSinAgenda = ORDEN_PRINCIPAL.filter(m => m !== 'mi-agenda');
  chkF('Angosto: el grupo duplicado respeta el mismo orden alfabético que la fila principal',
    JSON.stringify(modulosAngosto.slice(0, ordenPrincipalSinAgenda.length)) === JSON.stringify(ordenPrincipalSinAgenda));
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

  // --------- 4) Resize EN VIVO (sin recargar): el listener de resize debe
  // volver a medir y colapsar/descolapsar solo, no nada más al cargar. ---------
  const resize = await arrancar(1400);
  chkF('Resize: arranca ancha, sin colapsar', !(await colapsada(resize)));
  await resize.setViewportSize({ width: 390, height: 900 });
  await resize.waitForTimeout(400); // debounce de actualizarColapsoNav() + requestAnimationFrame
  chkF('Resize: al achicar la ventana a 390px, se colapsa SOLA (sin recargar la página)', await colapsada(resize));
  await resize.setViewportSize({ width: 1400, height: 900 });
  await resize.waitForTimeout(400);
  chkF('Resize: al volver a ensanchar, se descolapsa sola', !(await colapsada(resize)));
  await resize.close();

  console.log('Errores capturados:', JSON.stringify(errores));
  chkF('No hubo errores de página en ningún ancho', errores.length === 0);
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
