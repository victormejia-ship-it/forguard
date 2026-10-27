/* Manual de uso / guía descargable (27-oct-2026, pedido de Victor: "revisa
   que todo esté reflejado también en el manual o guía descargable", justo
   después de que se completara el Centro de Ayuda en pantalla).

   No es un documento aparte que alguien redacta a mano y que se va
   desactualizando — es un export en PDF de los MISMOS TEMAS_AYUDA que ya se
   ven dentro de la app (una sola fuente de verdad, dos formas de leerla).
   Esta prueba confirma: el botón existe en Ayuda, armarPayloadManualAyuda()
   resuelve tanto los temas de contenido fijo (string) como el de contenido
   dinámico (función, ej. "Introducción" con Object.keys(ROLES)), y la
   plantilla nueva abre y pinta sin errores con contenido reconocible de
   varios temas distintos. */
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

  // --------- 1) El botón "Descargar guía completa" aparece en Ayuda ---------
  await page.evaluate(() => irAModulo('ayuda'));
  await page.waitForTimeout(150);
  chkF('El botón "Descargar guía completa" aparece en el Centro de Ayuda', (await page.locator('[data-accion="exportar-manual-ayuda"]').count()) === 1);

  // --------- 2) armarPayloadManualAyuda() resuelve TODOS los temas, incluido el de función ---------
  const { payload, totalTemas } = await page.evaluate(() => ({ payload: armarPayloadManualAyuda(), totalTemas: TEMAS_AYUDA.length }));
  chkF('El payload trae un tema por cada entrada de TEMAS_AYUDA', payload.temas.length === totalTemas);
  const introduccion = payload.temas.find(t => t.id === 'introduccion');
  chkF('El tema "Introducción" (contenido es FUNCIÓN, usa Object.keys(ROLES)) se resolvió a HTML, no quedó como función', !!introduccion && typeof introduccion.contenidoHTML === 'string' && introduccion.contenidoHTML.includes('Quién puede ver y hacer qué'));
  const polizas = payload.temas.find(t => t.id === 'polizas');
  chkF('Un tema de contenido fijo (string), como Pólizas, también llegó con su HTML completo', !!polizas && polizas.contenidoHTML.includes('Apilar por cliente'));
  chkF('El payload trae el texto de fecha de generación', typeof payload.generadoTexto === 'string' && payload.generadoTexto.length > 0);

  // --------- 3) Exportar PDF: la plantilla nueva abre y pinta sin errores ---------
  const [pestañaManual] = await Promise.all([
    context.waitForEvent('page'),
    page.click('[data-accion="exportar-manual-ayuda"]')
  ]);
  await pestañaManual.waitForLoadState();
  await pestañaManual.waitForTimeout(400);
  const erroresManual = [];
  pestañaManual.on('pageerror', e => erroresManual.push(String(e)));
  const textoDoc = (await pestañaManual.evaluate(() => document.body.innerText)).toLowerCase();
  chkF('El documento exportado tiene la portada "Manual de uso"', textoDoc.includes('manual de uso'));
  chkF('El documento trae un índice con los temas', textoDoc.includes('índice'));
  chkF('El documento incluye el contenido del tema Introducción (rol/permiso)', textoDoc.includes('quién puede ver y hacer qué'));
  chkF('El documento incluye el contenido del tema Pólizas (apilar por cliente)', textoDoc.includes('apilar por cliente'));
  chkF('El documento incluye el contenido del tema Cotizaciones (reporte de cierre)', textoDoc.includes('reporte de cierre'));
  chkF('No hubo errores de JS en la pestaña del manual', erroresManual.length === 0);
  await pestañaManual.close();

  chkF('No hubo errores de página en todo el escenario', errores.length === 0);
  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
