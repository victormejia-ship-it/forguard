/* Fase 4 de la certificación RATIONAL (08-oct-2026, mismo pedido de Victor:
   "Fase 4: un botón para exportar el reporte en PDF, parecido al de
   Euromex"). Mismo patrón que el resto de documentos de Forguard
   (armarPayload.../abrirDocumento..., ver test_poliza_imprimir_calendario.js):
   el botón deja el payload en sessionStorage y abre docs/plantilla_
   certificacion_rational.html en una pestaña aparte.

   El botón "Exportar PDF de certificación" SOLO aparece cuando el servicio/
   hallazgo YA ESTÁ GUARDADO (yaHecho en Pólizas, `hz` en Levantamientos):
   exporta la última versión guardada, no evidenciasTmp/checklistTmp sin
   guardar del formulario abierto — mismo criterio que el resto de
   documentos de Forguard, que siempre documentan lo ya persistido. */
const { chromium } = require('playwright');
const path = require('path');
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
  await page.route('**firebasestorage.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"name":"fake"}' }));
  await page.goto(URL_BASE + '/index.html');
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    sesion.correo='owner@a.com'; sesion.uid='u-owner'; sesion.idToken='FAKE'; sesion.refreshToken='F2';
    sesion.expira=Date.now()+3600000; sesion.rol='owner'; sesion.nombre='Victor Owner';
    ocultarAcceso();
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'BORGWARNER' })];
    datos.polizas = [normalizarPoliza({
      id:'p1', clienteId:'c1', folio:'POL-070', sitioNombre:'BorgWarner',
      estatus:'activa', facturacion:'anual', fechaInicio:'2024-01-01', fechaCotizacion:'2024-01-01',
      partidas: [
        { id:'x1', concepto:'Horno Rational', marca:'Rational', modelo:'iCOMBIPRO', serie:'E22SJ24073155686', cantidad:1, precioUnitario:1000, frecuencia:3, mesesServicio:[9] }
      ],
      cobros:[true]
    })];
    datos.levantamientos = [normalizarLevantamiento({
      id:'l1', clienteId:'c1', sitioNombre:'BorgWarner', fecha:'2026-09-01', realizoNombre:'Edgar',
      hallazgos: [
        { id:'h1', ubicacion:'Cocina caliente', equipoNombre:'Horno Rational', marca:'Rational', modelo:'iCOMBIPRO', serie:'E22SJ24073155686', hallazgo:'Fuga de vapor en la puerta', accion:'correctivo', prioridad:'alta' }
      ]
    })];
    render();
  });
  await page.waitForTimeout(300);

  // --------- 1) modalServicioPoliza: SIN guardar todavía, el botón no existe ---------
  await page.evaluate(() => modalServicioPoliza('p1', 'x1', 9, false));
  await page.waitForTimeout(150);
  chkF('Servicio SIN registrar: no hay botón de exportar (nada que exportar aún)', await page.locator('#svBtnExportarCertificacionRational').count() === 0);

  // Se marca 1 punto del checklist, se sube una foto a "Placa del equipo" y se guarda.
  await page.locator('#svChecklistRational input[type="checkbox"]').first().check();
  const fixturePath = path.join(__dirname, 'fixtures', 'foto_prueba.png');
  const [fc] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('[data-agregar-categoria-rational="placa"]')
  ]);
  await fc.setFiles(fixturePath);
  await page.waitForTimeout(300);
  await page.fill('#svCuando', '2026-09-15');
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(300);

  // --------- 2) Reabrir YA guardado: el botón aparece, y exporta lo guardado ---------
  await page.evaluate(() => modalServicioPoliza('p1', 'x1', 9, false));
  await page.waitForTimeout(150);
  chkF('Servicio YA registrado: el botón de exportar SÍ aparece', await page.locator('#svBtnExportarCertificacionRational').count() === 1);

  const [docSv] = await Promise.all([
    context.waitForEvent('page'),
    page.click('#svBtnExportarCertificacionRational')
  ]);
  docSv.on('pageerror', e => errores.push('PAGEERROR (doc póliza): ' + e.message));
  await docSv.waitForLoadState();
  await docSv.waitForTimeout(400);

  chkF('Doc póliza: NO muestra el error de "Sin datos"', await docSv.locator('.error-doc').count() === 0);
  chkF('Doc póliza: trae el nombre del equipo, marca, modelo y serie', (await docSv.locator('.h1').textContent()).includes('Horno Rational') && (await docSv.locator('.h1').textContent()).includes('iCOMBIPRO') && (await docSv.locator('.h1').textContent()).includes('E22SJ24073155686'));
  chkF('Doc póliza: trae el cliente y el sitio correctos', (await docSv.locator('.metabar').textContent()).includes('BORGWARNER') && (await docSv.locator('.metabar').textContent()).includes('BorgWarner'));
  chkF('Doc póliza: trae los 36 puntos del checklist', await docSv.locator('.chk-item').count() === 36);
  chkF('Doc póliza: marca 1 de 36 (el que se checó antes de guardar)', (await docSv.locator('.resumen-marcados').textContent()).includes('1 de 36'));
  chkF('Doc póliza: la foto de "Placa del equipo" aparece en su categoría', (await docSv.locator('.categoria-tit').allTextContents()).some(t => t.includes('Placa')));
  chkF('Doc póliza: trae exactamente 1 foto (la que se subió)', await docSv.locator('.categoria-fotos img').count() === 1);
  await docSv.close();

  await page.click('[data-modal="cancelar"]');

  // --------- 3) modalHallazgo: mismo botón, mismo criterio (solo si ya existe) ---------
  await page.evaluate(() => modalHallazgo('l1', 'h1'));
  await page.waitForTimeout(150);
  chkF('Hallazgo YA guardado: el botón de exportar SÍ aparece', await page.locator('#hzBtnExportarCertificacionRational').count() === 1);

  const [docHz] = await Promise.all([
    context.waitForEvent('page'),
    page.click('#hzBtnExportarCertificacionRational')
  ]);
  docHz.on('pageerror', e => errores.push('PAGEERROR (doc levantamiento): ' + e.message));
  await docHz.waitForLoadState();
  await docHz.waitForTimeout(400);

  chkF('Doc levantamiento: NO muestra el error de "Sin datos"', await docHz.locator('.error-doc').count() === 0);
  chkF('Doc levantamiento: trae el equipo del hallazgo (no el de la póliza)', (await docHz.locator('.h1').textContent()).includes('Horno Rational'));
  chkF('Doc levantamiento: trae el sitio del levantamiento', (await docHz.locator('.metabar').textContent()).includes('BorgWarner'));
  chkF('Doc levantamiento: trae los 36 puntos del checklist (ninguno marcado, no se tocó)', await docHz.locator('.chk-item').count() === 36 && (await docHz.locator('.resumen-marcados').textContent()).includes('0 de 36'));
  chkF('Doc levantamiento: sin fotos categorizadas, muestra el aviso correspondiente', await docHz.locator('.sin-evidencia').count() === 1);
  await docHz.close();

  await page.click('[data-modal="cancelar"]');

  // --------- 4) Hallazgo NUEVO (sin guardar): el botón no existe todavía ---------
  await page.evaluate(() => modalHallazgo('l1', null));
  await page.waitForTimeout(150);
  await page.fill('#hzMarca', 'Rational');
  await page.waitForTimeout(100);
  chkF('Hallazgo nuevo (sin guardar): no hay botón de exportar', await page.locator('#hzBtnExportarCertificacionRational').count() === 0);
  await page.click('[data-modal="cancelar"]');

  // --------- 5) Abrir la plantilla directo, sin pasar por el botón: error claro ---------
  const [docDirecto] = await Promise.all([
    context.waitForEvent('page'),
    page.evaluate(() => {
      sessionStorage.removeItem('forguard.documento.certificacionRational');
      window.open('docs/plantilla_certificacion_rational.html', '_blank');
    })
  ]);
  await docDirecto.waitForLoadState();
  await docDirecto.waitForTimeout(300);
  chkF('Abrir la plantilla sin datos muestra el error de "Sin datos"', await docDirecto.locator('.error-doc').count() === 1);
  chkF('El mensaje de error explica cómo generarlo de verdad', (await docDirecto.locator('.error-doc').textContent()).includes('Exportar PDF de certificación'));
  await docDirecto.close();

  chkF('No hubo errores de página en todo el escenario', errores.length === 0);
  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
