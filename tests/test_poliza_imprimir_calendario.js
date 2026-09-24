/* "Imprimir calendario" en Pólizas (24-sep-2026, pedido explícito de
   Victor): "un segmento donde podamos imprimir solamente el calendario,
   sin necesidad de tener que imprimir toda la póliza completa". Misma
   plantilla de siempre (docs/plantilla_poliza_forguard.html), misma hoja
   de Calendario (pageCalendario, reusada tal cual) — nada más un flag
   nuevo en el payload (`vistaDocumento`) que decide si se compone
   Portada + Calendario + Cierre, o el documento completo.

   Esta prueba navega de verdad a la plantilla (como test_documentos_hoja_
   cierre.js) porque el riesgo real no es "el botón llama a la función
   correcta" —eso es trivial—, es que la plantilla NO se rompa cuando
   faltan a propósito la tabla de equipos y la descripción: hay una
   aserción visible (verificarRenglonesImpresos) que compara renglones
   impresos contra esperados, y si no se le avisa del modo "calendario"
   prende la banda roja de "DOCUMENTO MAL FORMADO" sobre un documento
   perfectamente válido. */
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
  page.on('console', msg => { if (msg.type() === 'error' && !/404/.test(msg.text())) errores.push('CONSOLE: ' + msg.text()); });
  await page.route('**identitytoolkit.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**securetoken.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**firestore.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.goto(URL_BASE + '/index.html');
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    sesion.correo='owner@a.com'; sesion.uid='u-owner'; sesion.idToken='FAKE'; sesion.refreshToken='F2';
    sesion.expira=Date.now()+3600000; sesion.rol='owner'; sesion.nombre='Victor Owner';
    ocultarAcceso();
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'NGK' })];
    datos.sitios = [normalizarSitio({ id:'s1', clienteId:'c1', nombre:'NGK' })];
    datos.polizas = [normalizarPoliza({
      id:'p1', clienteId:'c1', sitioId:'s1', folio:'POL-001', sitioNombre:'NGK',
      estatus:'activa', facturacion:'mensual', cargoA:'cliente',
      fechaInicio:'2026-01-01', fechaCotizacion:'2026-01-01',
      partidas: [{ id:'x1', concepto:'Equipo de prueba', cantidad:1, precioUnitario:1000, frecuencia:1, mesesServicio:[0], descripcion:'Revisión general del equipo' }],
      cobros:[false]
    })];
  });

  // --------- 1) Documento COMPLETO (default): trae las 6 hojas de siempre ---------
  const [docCompleto] = await Promise.all([
    context.waitForEvent('page'),
    page.evaluate(() => {
      sessionStorage.setItem('forguard.documento.poliza', JSON.stringify(armarPayloadPoliza(polizaPorId('p1'))));
      window.open('docs/plantilla_poliza_forguard.html', '_blank');
    })
  ]);
  docCompleto.on('pageerror', e => errores.push('PAGEERROR (completo): ' + e.message));
  await docCompleto.waitForLoadState();
  await docCompleto.waitForTimeout(500);

  chkF('Completo: trae la portada azul', await docCompleto.locator('.page').first().evaluate(el => el.classList.contains('cover')));
  chkF('Completo: trae la hoja de la tabla de equipos ("Póliza de Mantenimiento")', (await docCompleto.locator('.page .h1').allTextContents()).some(t => t.includes('Póliza de Mantenimiento')));
  chkF('Completo: trae la hoja de "Descripción de Trabajos"', (await docCompleto.locator('.page .h1').allTextContents()).some(t => t.includes('Descripción de Trabajos')));
  chkF('Completo: trae la hoja del calendario', (await docCompleto.locator('.page .h1').allTextContents()).some(t => t.includes('Calendario')));
  chkF('Completo: trae "Consideraciones Relevantes"', (await docCompleto.locator('.page .h1').allTextContents()).some(t => t.includes('Consideraciones')));
  chkF('Completo: cierra con la hoja de solo-logo', await docCompleto.locator('.page').last().locator('.pagina-cierre').count() === 1);
  chkF('Completo: NO aparece la banda roja de "documento mal formado"', await docCompleto.locator(':text("MAL FORMADO")').count() === 0);
  chkF('Completo: el título de la pestaña es el de siempre (sin "Calendario ·")', !(await docCompleto.title()).startsWith('Calendario ·'));

  await docCompleto.close();

  // --------- 2) Documento SOLO CALENDARIO: nada más Portada + Calendario + Cierre ---------
  const [docCalendario] = await Promise.all([
    context.waitForEvent('page'),
    page.evaluate(() => {
      sessionStorage.setItem('forguard.documento.poliza', JSON.stringify(armarPayloadPoliza(polizaPorId('p1'), true)));
      window.open('docs/plantilla_poliza_forguard.html', '_blank');
    })
  ]);
  docCalendario.on('pageerror', e => errores.push('PAGEERROR (calendario): ' + e.message));
  await docCalendario.waitForLoadState();
  await docCalendario.waitForTimeout(500);

  const titulosCalendario = await docCalendario.locator('.page .h1').allTextContents();
  chkF('Solo calendario: trae la portada azul', await docCalendario.locator('.page').first().evaluate(el => el.classList.contains('cover')));
  chkF('Solo calendario: NO trae la tabla de equipos', !titulosCalendario.some(t => t.includes('Póliza de Mantenimiento')));
  chkF('Solo calendario: NO trae "Descripción de Trabajos"', !titulosCalendario.some(t => t.includes('Descripción de Trabajos')));
  chkF('Solo calendario: SÍ trae la hoja del calendario', titulosCalendario.some(t => t.includes('Calendario')));
  chkF('Solo calendario: NO trae "Consideraciones Relevantes"', !titulosCalendario.some(t => t.includes('Consideraciones')));
  chkF('Solo calendario: cierra con la hoja de solo-logo', await docCalendario.locator('.page').last().locator('.pagina-cierre').count() === 1);
  chkF('Solo calendario: exactamente 3 hojas (Portada + Calendario + Cierre)', await docCalendario.locator('.page').count() === 3);
  chkF('Solo calendario: el título de la pestaña avisa que es solo el calendario', (await docCalendario.title()).startsWith('Calendario ·'));
  /* La razón de ser de esta prueba: sin el ajuste de verificarRenglonesImpresos(),
     la ausencia A PROPÓSITO de la tabla/descripción prendía esta banda por error. */
  chkF('Solo calendario: NO aparece la banda roja de "documento mal formado"', await docCalendario.locator(':text("MAL FORMADO")').count() === 0);

  await docCalendario.close();

  // --------- 3) El botón "Imprimir calendario" del tablero llama con el flag correcto ---------
  const payloadCapturado = await page.evaluate(() => {
    return new Promise(resolve => {
      const original = window.open;
      window.open = () => { window.open = original; return { }; };
      irAModulo('polizas');
      estado.vista = 'poliza'; estado.polizaId = 'p1';
      render();
      document.querySelector('[data-accion="imprimir-calendario-poliza"]').click();
      resolve(JSON.parse(sessionStorage.getItem('forguard.documento.poliza')));
    });
  });
  chkF('El botón "Imprimir calendario" del tablero arma el payload con vistaDocumento:"calendario"', payloadCapturado.vistaDocumento === 'calendario');

  const payloadBotonNormal = await page.evaluate(() => {
    return new Promise(resolve => {
      const original = window.open;
      window.open = () => { window.open = original; return { }; };
      document.querySelector('[data-accion="imprimir-poliza"]').click();
      resolve(JSON.parse(sessionStorage.getItem('forguard.documento.poliza')));
    });
  });
  chkF('El botón "Imprimir" de siempre sigue armando el documento completo (vistaDocumento:"completo")', payloadBotonNormal.vistaDocumento === 'completo');

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
