/* Reporte de Victor (21-sep-2026, con el plano ya convertido a imagen):
   "ya genero la imgaen solo que ahora esta empalmando y deformando el
   archivo" — una vez que el PDF sí se convertía a imagen (ver
   test_pdf_a_imagen_csp.js), el pie de página (.footwrap) se veía encimado
   sobre la imagen en el documento impreso.

   Causa raíz real: esto pasó justo después de migrar las imágenes de
   Imagen/Aperturas a Firebase Storage (ver test_proyecto_imagen_storage.js)
   — desde ese cambio, im.dataUrl para un proyecto ya guardado NO es un
   data: URI (que el navegador ya trae completo en memoria), sino una URL
   https://firebasestorage.googleapis.com/... que el <img> del documento
   impreso tiene que DESCARGAR por red antes de poder decodificarla. Una
   prueba con un data: URI de pila (se probó primero así) no reproduce el
   problema: un data: URI ya está en memoria y Chromium resuelve su alto
   intrínseco de forma prácticamente síncrona al forzar layout con
   getBoundingClientRect(), sin ventana de carrera real. Con una URL de
   red sí existe una espera real e inevitable — y paginarImagenes() media
   las tarjetas con getBoundingClientRect() ANTES de que esa descarga
   terminara, así que medía ~0 y dejaba pasar más tarjetas de las que
   cabían; cuando la imagen sí terminaba de bajar y pintarse, crecía y se
   encimaba con el pie de esa misma hoja. document.fonts.ready ya
   protegía de este mismo tipo de problema para las fuentes; a las
   imágenes nunca se les esperó igual.

   Esta prueba intercepta la URL de imagen con un retraso artificial (con
   page.route, sin tocar Firebase de verdad) para forzar esa misma espera
   de forma determinística, y verifica en el documento YA renderizado que
   ninguna tarjeta invade el espacio del pie de su propia hoja.

   Nota sobre serviceWorkers:'block' — index.html registra sw.js (soporte
   offline) con alcance en toda la raíz del sitio; una vez activo, ESE
   service worker (no Playwright) es quien resuelve los fetch() de
   cualquier pestaña del mismo origen, incluida la del documento — así
   que page.route()/context.route() nunca llegaban a interceptar la
   imagen mockeada y la petición salía a internet de verdad (bloqueada
   por la política de red de este sandbox). Bloquear el service worker en
   este contexto de prueba evita ese desvío y dejar que el mock sí
   aplique — no es parte del bug de Victor, es una condición para que la
   prueba misma pueda mentirle a la página sobre la red. */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
const chk = (label, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' - ' + label); return cond; };
let fallas = 0;
const chkF = (label, cond) => { if(!chk(label, cond)) fallas++; };

const FOTO_BYTES = fs.readFileSync(path.join(__dirname, '..', 'icons', 'icon-512.png'));
const HOST_FALSO = 'https://firebasestorage.googleapis.com/mock';

(async () => {
  const browser = await chromium.launch(OPCIONES_NAVEGADOR);
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push('PAGEERROR: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error' && !/404/.test(msg.text())) errores.push('CONSOLE: ' + msg.text()); });
  await page.route('**identitytoolkit.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**securetoken.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**firestore.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  // Simula la descarga por red de una imagen ya migrada a Storage, con un
  // retraso real (200ms) — la ventana de carrera que la prueba necesita.
  await context.route(HOST_FALSO + '/**', async route => {
    await new Promise(r => setTimeout(r, 200));
    await route.fulfill({ status: 200, contentType: 'image/png', body: FOTO_BYTES });
  });
  await page.goto(URL_BASE + '/index.html');
  await page.waitForTimeout(400);

  await page.evaluate((HOST_FALSO) => {
    sesion.correo='owner@a.com'; sesion.uid='u-owner'; sesion.idToken='FAKE'; sesion.refreshToken='F2';
    sesion.expira=Date.now()+3600000; sesion.rol='owner'; sesion.nombre='Victor Owner';
    ocultarAcceso();
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'BANREGIO' })];
    const imagenes = [];
    for(let i = 0; i < 6; i++){
      imagenes.push({ id:'im' + i, tipo: i === 0 ? 'plano' : 'foto', formato:'imagen', dataUrl: HOST_FALSO + '/foto' + i + '.png', nombre:'foto' + i + '.png' });
    }
    datos.proyectosImagen = [normalizarProyectoImagen({
      id:'pi1', clienteId:'c1', clienteNombre:'BANREGIO', sitioNombre:'Back Office I',
      nombreProyecto:'Remodelación comedor', tipo:'apertura', estatus:'diseno', fecha:hoyISO(),
      conceptos: [{ concepto:'Panel vinílico', proveedor:'ZODEK', cantidad:2, costoUnitario:1000, precioVenta:1300 }],
      imagenes
    })];
    sessionStorage.setItem('forguard.documento.imagen', JSON.stringify(armarPayloadProyectoImagen(proyectoImagenPorId('pi1'), false)));
  }, HOST_FALSO);

  const [docPage] = await Promise.all([
    context.waitForEvent('page'),
    page.evaluate(() => window.open('docs/plantilla_imagen.html', '_blank'))
  ]);
  docPage.on('pageerror', e => errores.push('PAGEERROR (doc): ' + e.message));
  await docPage.waitForLoadState();
  await docPage.waitForTimeout(900);

  const totalTarjetas = await docPage.locator('.img-card').count();
  chkF('Las 6 imágenes SÍ se colocaron como tarjetas (ninguna se perdió en la paginación)', totalTarjetas === 6);
  chkF('NO aparece la banda roja de "este documento no cuadra"', await docPage.locator('.banda-roja').count() === 0);

  // El síntoma medible del bug: si se mide antes de que la imagen termine
  // de bajar/decodificar, todas las tarjetas "miden" ~0 y la paginación
  // las empaqueta TODAS en una sola hoja (en vez de repartirlas en varias,
  // que es lo que su alto real —2.7in tope— exige para 6 imágenes).
  const hojasConImagenes = await docPage.locator('.page').filter({ has: docPage.locator('.img-card') }).all();
  chkF('Las imágenes se repartieron en más de una hoja, acorde a su alto real (no se subestimó su tamaño)', hojasConImagenes.length >= 2);

  let algunaInvasion = false;
  for(const hoja of hojasConImagenes){
    const pieBox = await hoja.locator('.footwrap').boundingBox();
    const tarjetas = await hoja.locator('.img-card').all();
    for(const tarjeta of tarjetas){
      const cajaTarjeta = await tarjeta.boundingBox();
      if(pieBox && cajaTarjeta && (cajaTarjeta.y + cajaTarjeta.height) > pieBox.y + 1){
        algunaInvasion = true;
      }
    }
  }
  chkF('Ninguna tarjeta de imagen invade el espacio del pie de su propia hoja', !algunaInvasion);

  const alturasImg = await docPage.locator('.img-foto').evaluateAll(els => els.map(el => el.getBoundingClientRect().height));
  chkF('Las imágenes se renderizaron con alto real (> 0), no el ~0 que causaba el sobre-empaquetado', alturasImg.every(h => h > 0));

  chkF('No hubo errores de página (ni el TypeError de tratar la Promise de paginarImagenes() como arreglo)',
    errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
