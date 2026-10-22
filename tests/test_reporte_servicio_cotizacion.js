/* Reporte de servicio realizado — Cotizaciones (21-oct-2026, pedido de
   Victor, mismo día en que pidió firmas para la certificación RATIONAL):
   "en las cotizaciones realizadas permite realizar un reporte de servicio
   realizado, donde pueda ingresar los datos relevantes para que el cliente
   este seguro que el trabajo cotizado se realizo" — más "añadiendo que en
   todos nuestros reportes emitidos... puedan incluirse las firmas del
   tecnico y del cliente".

   El botón "Crear/Editar reporte de servicio" SOLO existe cuando la
   cotización ya está en estatus 'realizado'/'realizado_comedor' del tablero
   de 13 etapas — una cotización en borrador o pendiente de aprobar no tiene
   nada que reportar todavía (ver vistaCotizacion()).

   modalReporteServicioCotizacion() es su PROPIO modal (no un panel dentro
   de modalCotizacion): se abre desde vistaCotizacion, de solo lectura, así
   que nunca queda anidado dentro de otro modal ya abierto — evita el bug
   real que activarPadFirma() documenta (abrirModal() reemplaza
   #modalCuerpo entero y borraría el formulario que ya estaba abierto).

   Se prueba: el botón no existe en una cotización NO realizada; sí existe
   en una realizada; capturar evidencia (antes/después/hallazgo con
   descripción), notas y las dos firmas con el pad de dibujo (mismo
   componente que RATIONAL); que firmar NO borra lo demás ya capturado en el
   formulario (nota real de regresión); que el resumen en vistaCotizacion
   refleja lo guardado; exportar el PDF y que trae todo; y que sin ningún
   dato capturado el botón "Exportar PDF" no hace nada (reporteServicio
   vacío = nada que exportar). */
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
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'MERCADO LIBRE' })];
    datos.sitios = [normalizarSitio({ id:'s1', clienteId:'c1', nombre:'Mercado Libre MXCD09' })];
    datos.cotizaciones = [
      normalizarCotizacion({ id:'q1', folio:'COT-001', clienteId:'c1', sitioId:'s1', estatus:'enviada',
        partidas:[{ concepto:'Mantenimiento preventivo', cantidad:1, precioCosto:1000 }] }),
      normalizarCotizacion({ id:'q2', folio:'COT-002', clienteId:'c1', sitioId:'s1', estatus:'realizado',
        partidas:[{ concepto:'Mantenimiento preventivo', cantidad:1, precioCosto:1000 }] })
    ];
    render();
  });
  await page.waitForTimeout(300);

  // --------- 1) Cotización NO realizada: no hay nada de reporte de servicio ---------
  await page.evaluate(() => { irAModulo('cotizaciones'); estado.vista='cotizacion'; estado.cotizacionId='q1'; render(); });
  await page.waitForTimeout(150);
  chkF('Cotización enviada (no realizada): NO aparece el bloque de reporte de servicio', await page.locator('text=Reporte de servicio realizado').count() === 0);

  // --------- 2) Cotización realizada, sin reporte capturado todavía ---------
  await page.evaluate(() => { estado.vista='cotizacion'; estado.cotizacionId='q2'; render(); });
  await page.waitForTimeout(150);
  chkF('Cotización realizada: SÍ aparece el bloque de reporte de servicio', await page.locator('text=Reporte de servicio realizado').count() === 1);
  chkF('Sin reporte capturado: muestra el aviso de "todavía no"', await page.locator('text=Todavía no se ha capturado el reporte').count() === 1);
  chkF('Sin reporte capturado: el botón dice "Crear reporte de servicio"', await page.locator('[data-accion="reporte-servicio-cotizacion"]').textContent().then(t => t.includes('Crear reporte de servicio')));

  // --------- 3) Abrir el modal y capturar todo ---------
  await page.click('[data-accion="reporte-servicio-cotizacion"]');
  await page.waitForTimeout(150);
  await page.fill('#rsQuien', 'Samuel Acosta');
  await page.fill('#rsNotas', 'Se realizó mantenimiento preventivo completo según lo cotizado.');

  // Foto "Antes"
  const fixturePath = require('path').join(__dirname, 'fixtures', 'foto_prueba.png');
  let [fc] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('[data-agregar-item-reporte="antes"]')
  ]);
  await fc.setFiles(fixturePath);
  await page.waitForTimeout(250);

  // Foto "Hallazgo", con descripción
  [fc] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('[data-agregar-item-reporte="hallazgo"]')
  ]);
  await fc.setFiles(fixturePath);
  await page.waitForTimeout(250);
  chkF('Se agregaron las 2 fotos (antes + hallazgo)', await page.locator('#rsItemsWrap .foto-evidencia').count() === 2);

  await page.fill('#rsItemsWrap [data-item-desc]', '');
  const descInputs = page.locator('#rsItemsWrap [data-item-desc]');
  await descInputs.nth(1).fill('Cámara de quemador inundada por filtración de agua.');

  // Firma del técnico
  await page.click('#rsFirmaTecnicoWrap .js-firmar');
  await page.waitForTimeout(150);
  await page.fill('#rsFirmaTecnicoWrap .js-firma-nombre', 'Samuel Acosta');
  await page.locator('#rsFirmaTecnicoWrap .js-firma-lienzo').scrollIntoViewIfNeeded();
  let box = await page.locator('#rsFirmaTecnicoWrap .js-firma-lienzo').boundingBox();
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 90, box.y + 60);
  await page.mouse.up();
  await page.click('#rsFirmaTecnicoWrap .js-firma-guardar');
  await page.waitForTimeout(150);

  // Regresión: firmar NO debe borrar lo ya capturado antes (nota real del mismo pedido)
  chkF('Tras firmar el técnico, "Quién realizó" conserva su valor', (await page.locator('#rsQuien').inputValue()) === 'Samuel Acosta');
  chkF('Tras firmar el técnico, las notas conservan su valor', (await page.locator('#rsNotas').inputValue()).includes('mantenimiento preventivo completo'));
  chkF('Tras firmar el técnico, las 2 fotos siguen ahí', await page.locator('#rsItemsWrap .foto-evidencia').count() === 2);

  // Firma del cliente
  await page.click('#rsFirmaClienteWrap .js-firmar');
  await page.waitForTimeout(150);
  await page.fill('#rsFirmaClienteWrap .js-firma-nombre', 'Jessica Vázquez');
  await page.locator('#rsFirmaClienteWrap .js-firma-lienzo').scrollIntoViewIfNeeded();
  box = await page.locator('#rsFirmaClienteWrap .js-firma-lienzo').boundingBox();
  await page.mouse.move(box.x + 15, box.y + 15);
  await page.mouse.down();
  await page.mouse.move(box.x + 70, box.y + 50);
  await page.mouse.up();
  await page.click('#rsFirmaClienteWrap .js-firma-guardar');
  await page.waitForTimeout(150);

  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(300);

  // --------- 4) El resumen en vistaCotizacion refleja lo guardado ---------
  chkF('Tras guardar: ya NO muestra el aviso de "todavía no"', await page.locator('text=Todavía no se ha capturado el reporte').count() === 0);
  chkF('Tras guardar: el resumen muestra 2 fotos', await page.locator('text=2 fotos').count() === 1);
  chkF('Tras guardar: el resumen muestra las 2 firmas', await page.locator('text=Técnico y Cliente').count() === 1);
  chkF('Tras guardar: el botón ahora dice "Editar reporte"', await page.locator('[data-accion="reporte-servicio-cotizacion"]').textContent().then(t => t.includes('Editar reporte')));

  // Reabrir para confirmar que persistió de verdad (no solo en memoria del modal)
  await page.click('[data-accion="reporte-servicio-cotizacion"]');
  await page.waitForTimeout(150);
  chkF('Al reabrir: "Quién realizó" sigue con el valor guardado', (await page.locator('#rsQuien').inputValue()) === 'Samuel Acosta');
  chkF('Al reabrir: las 2 fotos siguen ahí', await page.locator('#rsItemsWrap .foto-evidencia').count() === 2);
  chkF('Al reabrir: la firma del técnico sigue ahí', await page.locator('#rsFirmaTecnicoWrap .firma-tarjeta-nombre').count() === 1);
  chkF('Al reabrir: la firma del cliente sigue ahí', await page.locator('#rsFirmaClienteWrap .firma-tarjeta-nombre').count() === 1);
  await page.click('[data-modal="cancelar"]');
  await page.waitForTimeout(150);

  // --------- 5) Exportar el PDF y verificar su contenido ---------
  const [docPage] = await Promise.all([
    context.waitForEvent('page'),
    page.click('[data-accion="exportar-reporte-servicio-cotizacion"]')
  ]);
  docPage.on('pageerror', e => errores.push('PAGEERROR (doc): ' + e.message));
  await docPage.waitForLoadState();
  await docPage.waitForTimeout(400);

  chkF('Doc: NO muestra el error de "Sin datos"', await docPage.locator('.error-doc').count() === 0);
  chkF('Doc: trae el folio de la cotización', (await docPage.locator('.h1').textContent()).includes('COT-002'));
  chkF('Doc: trae el cliente y el sitio', (await docPage.locator('.metabar').textContent()).includes('MERCADO LIBRE') && (await docPage.locator('.metabar').textContent()).includes('Mercado Libre MXCD09'));
  chkF('Doc: trae las notas capturadas', (await docPage.locator('.comentarios-texto').first().textContent()).includes('mantenimiento preventivo completo'));
  chkF('Doc: trae las 2 fotos de evidencia', await docPage.locator('.evidencia-item').count() === 2);
  chkF('Doc: una etiqueta de foto dice "Antes"', (await docPage.locator('.evidencia-etiqueta').allTextContents()).some(t => t === 'Antes'));
  chkF('Doc: otra etiqueta dice "Hallazgo"', (await docPage.locator('.evidencia-etiqueta').allTextContents()).some(t => t === 'Hallazgo'));
  chkF('Doc: trae la descripción del hallazgo', (await docPage.locator('.evidencia-item').nth(1).textContent()).includes('Cámara de quemador inundada'));
  chkF('Doc: trae las 2 firmas', await docPage.locator('.firma-casilla').count() === 2);
  chkF('Doc: nombre del técnico en su firma', (await docPage.locator('.firma-casilla .firma-nombre').nth(0).textContent()) === 'Samuel Acosta');
  chkF('Doc: nombre del cliente en su firma', (await docPage.locator('.firma-casilla .firma-nombre').nth(1).textContent()) === 'Jessica Vázquez');
  await docPage.close();

  // --------- 6) Abrir la plantilla directo, sin datos: error claro ---------
  const [docDirecto] = await Promise.all([
    context.waitForEvent('page'),
    page.evaluate(() => {
      sessionStorage.removeItem('forguard.documento.reporteServicioCotizacion');
      window.open('docs/plantilla_reporte_servicio_cotizacion.html', '_blank');
    })
  ]);
  await docDirecto.waitForLoadState();
  await docDirecto.waitForTimeout(300);
  chkF('Abrir la plantilla sin datos muestra el error de "Sin datos"', await docDirecto.locator('.error-doc').count() === 1);
  await docDirecto.close();

  chkF('No hubo errores de página en todo el escenario', errores.length === 0);
  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
