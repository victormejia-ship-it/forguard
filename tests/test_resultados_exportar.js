/* Exportar Resultados a Excel y PDF (25-sep-2026, pedido explícito de
   Victor): "ahora necesito que podamos exportar en 3 aspectos excel o pdf
   en los formatos de forguard" — confirmado con él: Resumen general +
   Cumplimiento de pólizas + Detalle por pilar, AMBOS formatos disponibles
   para todo.

   Excel: un libro de 6 hojas (Resumen general, Cumplimiento de pólizas y
   una por cada uno de los 4 pilares), armado a mano con el mismo motor XLSX
   que ya usa descargarExcel() (armarZip/filaXml/cT-cN-cX/XLSX_ESTILOS) —
   sin ninguna librería externa. Se prueba llamando directamente a las
   funciones de cada hoja (hojaResumenGeneralXlsx/hojaCumplimientoPolizasXlsx/
   hojaPilarXlsx) e inspeccionando el XML crudo: no hace falta descomprimir
   el .zip para confirmar que cada hoja trae los datos correctos, y así
   también se prueba exactamente lo mismo que arma el botón real.

   PDF: nueva plantilla docs/plantilla_resultados_forguard.html, SIEMPRE
   horizontal (las tablas de 14 columnas no caben en vertical), copiada de
   plantilla_orden_compra.html (misma identidad Forguard). Se navega de
   verdad a la plantilla (mismo criterio que test_poliza_imprimir_
   calendario.js) porque el riesgo real es que la plantilla se rompa con
   datos reales, no que el botón llame a la función correcta.

   Los dos formatos reusan las MISMAS funciones que ya usa la pantalla
   (PILARES_PROFORMA, resumenGeneralProforma, polizasActivasParaCumplimiento),
   así que "Nómina directa del pilar" respeta puedeVerNomina() sin ningún
   candado aparte — se prueba explícitamente con un rol Analyst. */
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
      id:'p1', clienteId:'c1', sitioId:'s1', folio:'POL-900', sitioNombre:'NGK',
      estatus:'activa', facturacion:'mensual', cargoA:'cliente',
      fechaInicio:'2026-01-01', fechaCotizacion:'2026-01-01',
      partidas: [{ id:'x1', concepto:'Equipo de prueba', cantidad:1, precioUnitario:1000, frecuencia:1, mesesServicio:[0], descripcion:'Revisión general' }],
      cobros:[false]
    })];
    datos.personal = [normalizarPersona({ id:'per1', nombre:'Ana Técnica', puesto:'Técnico', estatus:'activo', pilarId:'tecnicos' })];
    datos.nominaPersonal = [normalizarNominaPersona({ id:'per1', sueldoMensual:30000 })];
    datos.proveedores = [{ id:'prov1', nombre:'Proveedor de prueba' }];
    datos.gastosProveedor = [normalizarGastoProveedor({ id:'g1', proveedorId:'prov1', pilarId:'tecnicos', estatus:'pagado', fecha:'2026-03-15', monto:8000, concepto:'Refacciones' })];
    estado.vista = 'resultados';
    render();
  });

  // --------- 1) Los botones de exportar están en pantalla, cableados ---------
  chkF('El botón "Descargar Excel" está en el titulo-zona de Resultados', await page.locator('[data-accion="excel-resultados"]').count() === 1);
  chkF('El botón "Generar PDF" está en el titulo-zona de Resultados', await page.locator('[data-accion="pdf-resultados"]').count() === 1);

  // --------- 2) Excel: cada hoja trae los datos correctos (owner) ---------
  const excelOwner = await page.evaluate(() => {
    const anio = hoyISO().slice(0,4);
    const pilarTecnicos = PILARES_PROFORMA.find(p => p.id === 'tecnicos');
    const c = calcularPoliza(polizaPorId('p1'));
    return {
      resumen: hojaResumenGeneralXlsx(anio),
      cumplimiento: hojaCumplimientoPolizasXlsx(),
      tecnicos: hojaPilarXlsx(pilarTecnicos, anio),
      precioAnualPoliza: dinero(c.precioAnual),
      folio: polizaPorId('p1').folio
    };
  });
  chkF('Hoja "Resumen general": trae el título esperado', excelOwner.resumen.includes('Resumen general Forguard'));
  chkF('Hoja "Resumen general": trae "Servicios Técnicos" en el ranking por pilar', excelOwner.resumen.includes('Servicios Técnicos'));
  chkF('Hoja "Cumplimiento de pólizas": trae el folio de la póliza activa', excelOwner.cumplimiento.includes(excelOwner.folio));
  chkF('Hoja del pilar "Servicios Técnicos": trae su propio nombre como título', excelOwner.tecnicos.includes('Servicios Técnicos'));
  chkF('Hoja del pilar "Servicios Técnicos": trae el renglón "Pólizas de mantenimiento"', excelOwner.tecnicos.includes('Pólizas de mantenimiento'));
  chkF('Hoja del pilar "Servicios Técnicos": trae "Nómina directa del pilar" con el sueldo real (owner)', excelOwner.tecnicos.includes('360000') || excelOwner.tecnicos.includes('30000'));
  chkF('Hoja del pilar "Servicios Técnicos": trae el renglón "Proveedores / servicios subcontratados"', excelOwner.tecnicos.includes('Proveedores'));

  // --------- 3) Excel: como Analyst, "Nómina directa del pilar" no se filtra pero SÍ sale en $0 ---------
  const excelAnalyst = await page.evaluate(() => {
    sesion.rol = 'analyst';
    const anio = hoyISO().slice(0,4);
    const xml = hojaPilarXlsx(PILARES_PROFORMA.find(p => p.id === 'tecnicos'), anio);
    sesion.rol = 'owner';
    return xml;
  });
  chkF('Analyst: la hoja del pilar SIGUE trayendo el renglón "Nómina directa del pilar"', excelAnalyst.includes('Nómina directa del pilar'));
  chkF('Analyst: "Nómina directa del pilar" ya NO trae 30000 (se ve en $0, mismo candado que la pantalla)', !excelAnalyst.includes('30000') && !excelAnalyst.includes('360000'));

  // --------- 4) El botón real arma el mismo Excel (blob .xlsx, sin errores) ---------
  const excelBoton = await page.evaluate(() => {
    return new Promise(resolve => {
      let capturado = null;
      const original = window.descargar;
      window.descargar = (blob, nombre) => { capturado = { tipo: blob.type, tam: blob.size, nombre }; };
      document.querySelector('[data-accion="excel-resultados"]').click();
      window.descargar = original;
      resolve(capturado);
    });
  });
  chkF('El botón "Descargar Excel" produce un archivo con el tipo MIME de xlsx', excelBoton && excelBoton.tipo === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  chkF('El botón "Descargar Excel" produce un archivo con contenido real (no vacío)', excelBoton && excelBoton.tam > 2000);
  chkF('El botón "Descargar Excel" nombra el archivo "Resultados_Forguard_..."', excelBoton && excelBoton.nombre.startsWith('Resultados_Forguard_'));

  // --------- 5) El botón real de PDF arma el payload y abre la plantilla ---------
  const payloadPdf = await page.evaluate(() => {
    return new Promise(resolve => {
      const original = window.open;
      window.open = () => { window.open = original; return {}; };
      document.querySelector('[data-accion="pdf-resultados"]').click();
      resolve(JSON.parse(sessionStorage.getItem('forguard.documento.resultados')));
    });
  });
  chkF('El payload del PDF trae los 4 pilares', Array.isArray(payloadPdf.pilares) && payloadPdf.pilares.length === 4);
  chkF('El payload del PDF trae la póliza activa en "cumplimiento"', payloadPdf.cumplimiento.some(it => it.folio === 'POL-900'));
  chkF('El payload del PDF trae el resumen general', !!payloadPdf.resumen && !!payloadPdf.resumen.kpis);

  // --------- 6) La plantilla PDF de verdad: se navega a ella y se revisa el documento ---------
  const [docPdf] = await Promise.all([
    context.waitForEvent('page'),
    page.evaluate(() => {
      sessionStorage.setItem('forguard.documento.resultados', JSON.stringify(armarPayloadResultados()));
      window.open('docs/plantilla_resultados_forguard.html', '_blank');
    })
  ]);
  const erroresPdf = [];
  docPdf.on('pageerror', e => erroresPdf.push('PAGEERROR (pdf resultados): ' + e.message));
  await docPdf.waitForLoadState();
  await docPdf.waitForTimeout(500);

  chkF('PDF: no aparece la pantalla de "Sin datos"', await docPdf.locator('.error-doc').count() === 0);
  chkF('PDF: exactamente 6 hojas (Resumen + 1 de Cumplimiento + 4 pilares, con 1 sola póliza activa)', await docPdf.locator('.page').count() === 6);
  chkF('PDF: la primera hoja es "Resumen general Forguard"', (await docPdf.locator('.page').first().locator('.seccion-titulo').first().textContent()).includes('Resumen general Forguard'));
  chkF('PDF: la hoja de Cumplimiento trae el folio de la póliza activa', (await docPdf.locator('.page').nth(1).textContent()).includes('POL-900'));
  chkF('PDF: hay una hoja para "Servicios Técnicos"', (await docPdf.locator('.page').allTextContents()).some(t => t.includes('Servicios Técnicos')));
  chkF('PDF: hay una hoja para "Tecnología y Control"', (await docPdf.locator('.page').allTextContents()).some(t => t.includes('Tecnología y Control')));

  const paginasPdf = await docPdf.locator('.page').all();
  for(let i = 0; i < paginasPdf.length; i++){
    const box = await paginasPdf[i].boundingBox();
    chkF('PDF: hoja ' + (i+1) + ' es horizontal (ancho > alto)', box.width > box.height);
  }

  chkF('PDF: el título de la pestaña identifica el documento', (await docPdf.title()).includes('Resultados'));
  chkF('No hubo errores de página al abrir el PDF de Resultados', erroresPdf.length === 0);
  await docPdf.close();

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
