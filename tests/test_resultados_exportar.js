/* Exportar Resultados a Excel y PDF (25-sep-2026, pedido explícito de
   Victor): "ahora necesito que podamos exportar en 3 aspectos excel o pdf
   en los formatos de forguard" — confirmado con él: Resumen general +
   Cumplimiento de pólizas + Detalle por pilar, AMBOS formatos disponibles
   para todo.

   Excel (rehecho el mismo día, pedido de Victor tras ver la primera
   versión: "necesito que el excel siga el formato del framework proforma
   que te comparti, los mismos colores y cálculos"): UNA sola hoja
   "Framework Proforma" calcada de su archivo real
   (Framework_Proforma_Forguard_V2.xlsx) — los 4 pilares apilados uno debajo
   del otro (no una hoja por pilar), más RESUMEN FORGUARD y GASTOS DE
   ESTRUCTURA FORGUARD al final, mismos colores (navy/slate/azul claro) y
   las mismas fórmulas vivas (=SUM(B6:B8), =B9-B15, =IFERROR(B16/B9,0)…) en
   vez de números ya calculados — armado a mano con el mismo motor XLSX que
   ya usa descargarExcel() (armarZip/filaXml/cT-cN-cX), sin ninguna
   librería externa. Cumplimiento de pólizas —que no existe en el Excel de
   Victor, es aporte de esta app— se queda como una segunda hoja aparte.
   Se prueba llamando directo a construirHojaFrameworkProforma()/
   hojaCumplimientoPolizasXlsx() e inspeccionando el XML crudo.

   PDF: docs/plantilla_resultados_forguard.html, SIEMPRE horizontal (las
   tablas de 14 columnas no caben en vertical), copiada de
   plantilla_orden_compra.html (misma identidad Forguard). Cumplimiento de
   pólizas se repartía por un CONTEO FIJO de filas por hoja —un primer
   intento que con datos reales (más de 20 pólizas activas) se salía del
   área imprimible y el pie (posición absoluta) quedaba ENCIMADO con las
   últimas filas visibles, veredicto de Victor: "se empalman las tablas"—
   y ahora se MIDE de verdad (mismo principio que plantilla_orden_compra.html):
   se prueba con una sola póliza (cabe en 1 hoja) Y con muchas (para forzar
   varias hojas) confirmando que el pie NUNCA se traslapa con la tabla.

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

  // --------- 2) Excel: una sola hoja "Framework Proforma", calcada de la de Victor ---------
  const excelOwner = await page.evaluate(() => {
    const anio = hoyISO().slice(0,4);
    return {
      framework: construirHojaFrameworkProforma(anio),
      cumplimiento: hojaCumplimientoPolizasXlsx(),
      folio: polizaPorId('p1').folio
    };
  });
  const fw = excelOwner.framework;
  chkF('Framework Proforma: trae el título calcado de su Excel', fw.includes('FORGUARD | FRAMEWORK DE PROFORMA'));
  chkF('Framework Proforma: el título va en una sola celda fusionada (A1:N1)', /mergeCell ref="A1:N1"/.test(fw));
  chkF('Framework Proforma: el pilar va en MAYÚSCULAS, calcado de su Excel', fw.includes('>SERVICIOS TÉCNICOS<') || fw.includes('SERVICIOS TÉCNICOS'));
  chkF('Framework Proforma: trae "TOTAL INGRESOS SERVICIOS TÉCNICOS"', fw.includes('TOTAL INGRESOS SERVICIOS TÉCNICOS'));
  chkF('Framework Proforma: la fórmula de "Total ingresos" suma el rango de renglones de Ingresos (=SUM(B6:B8))', fw.includes('SUM(B6:B8)'));
  chkF('Framework Proforma: "Utilidad bruta" resta Total costos de Total ingresos por columna (=B9-B16)', fw.includes('B9-B16'));
  chkF('Framework Proforma: "Margen bruto" usa IFERROR igual que su Excel', fw.includes('IFERROR(B17/B9,0)'));
  chkF('Framework Proforma: trae "Nómina directa del pilar" con el sueldo real (owner)', fw.includes('30000'));
  chkF('Framework Proforma: trae "RESUMEN FORGUARD"', fw.includes('RESUMEN FORGUARD'));
  chkF('Framework Proforma: "TOTAL INGRESOS FORGUARD" suma los 4 "TOTAL INGRESOS" de los pilares', /TOTAL INGRESOS FORGUARD[\s\S]*?B9\+B26\+B43\+B60/.test(fw));
  chkF('Framework Proforma: trae "GASTOS DE ESTRUCTURA FORGUARD" (en $0, sin fuente conectada todavía)', fw.includes('GASTOS DE ESTRUCTURA FORGUARD'));
  chkF('Framework Proforma: trae "UTILIDAD OPERATIVA FORGUARD" y "MARGEN OPERATIVO"', fw.includes('UTILIDAD OPERATIVA FORGUARD') && fw.includes('MARGEN OPERATIVO'));
  chkF('Framework Proforma: trae la nota de criterio de nómina, fusionada', /Criterio de nómina[\s\S]*?mergeCell/.test(fw) || (fw.includes('Criterio de nómina') && fw.includes('mergeCell')));
  chkF('Hoja "Cumplimiento de pólizas": trae el folio de la póliza activa', excelOwner.cumplimiento.includes(excelOwner.folio));
  chkF('Hoja "Cumplimiento de pólizas": "NGK" no se repite dos veces (sitio = nombre del cliente, se deduplica)', !excelOwner.cumplimiento.includes('NGK — NGK'));

  // --------- 3) Excel: como Analyst, "Nómina directa del pilar" no se filtra pero SÍ sale en $0 ---------
  const excelAnalyst = await page.evaluate(() => {
    sesion.rol = 'analyst';
    const xml = construirHojaFrameworkProforma(hoyISO().slice(0,4));
    sesion.rol = 'owner';
    return xml;
  });
  chkF('Analyst: el Excel SIGUE trayendo el renglón "Nómina directa del pilar"', excelAnalyst.includes('Nómina directa del pilar'));
  chkF('Analyst: "Nómina directa del pilar" ya NO trae 30000 (se ve en $0, mismo candado que la pantalla)', !excelAnalyst.includes('30000'));

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
  chkF('El payload del PDF deduplica "Cliente / Sitio" (no "NGK — NGK")', !payloadPdf.cumplimiento.some(it => it.clienteSitio === 'NGK — NGK'));

  // --------- 6) La plantilla PDF de verdad, con UNA sola póliza: cabe en 1 hoja de Cumplimiento ---------
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

  // --------- 7) La plantilla PDF con MUCHAS pólizas activas: Cumplimiento se
  // reparte en varias hojas, MEDIDAS, y el pie nunca se traslapa con la tabla
  // (veredicto de Victor, 25-sep-2026, con datos reales: "se empalman las
  // tablas" — un conteo fijo de filas por hoja se quedaba corto). ---------
  await page.evaluate(() => {
    const muchas = [];
    for(let i = 0; i < 45; i++){
      muchas.push(normalizarPoliza({
        id: 'pm' + i, clienteId: 'c1', sitioId: 's1', folio: 'POL-' + (100 + i), sitioNombre: 'Sitio ' + i,
        estatus: 'activa', facturacion: 'mensual', cargoA: 'cliente',
        fechaInicio: '2026-01-01', fechaCotizacion: '2026-01-01',
        partidas: [{ id: 'x', concepto: 'Equipo', cantidad: 1, precioUnitario: 500, frecuencia: 1, mesesServicio: [0], descripcion: 'Revisión' }],
        cobros: [false]
      }));
    }
    datos.polizas = datos.polizas.concat(muchas);
  });

  const [docMuchas] = await Promise.all([
    context.waitForEvent('page'),
    page.evaluate(() => {
      sessionStorage.setItem('forguard.documento.resultados', JSON.stringify(armarPayloadResultados()));
      window.open('docs/plantilla_resultados_forguard.html', '_blank');
    })
  ]);
  const erroresMuchas = [];
  docMuchas.on('pageerror', e => erroresMuchas.push('PAGEERROR (pdf muchas polizas): ' + e.message));
  await docMuchas.waitForLoadState();
  await docMuchas.waitForTimeout(500);

  const totalPaginasMuchas = await docMuchas.locator('.page').count();
  chkF('PDF con 46 pólizas activas: Cumplimiento ya no cabe en 1 sola hoja (más de 6 páginas en total)', totalPaginasMuchas > 6);

  const filasCumplTotales = await docMuchas.locator('.page .cuerpo table.cumpl tbody tr').count();
  chkF('PDF con 46 pólizas activas: TODAS las filas de Cumplimiento se imprimen (ninguna se pierde al paginar)', filasCumplTotales === 46);

  // El pie (.footwrap) es posición absoluta al fondo de la hoja: si el
  // reparto midió mal, la última fila de la tabla se dibuja MÁS ABAJO que
  // el techo del pie y ambos se ven encimados en el PDF real.
  const paginasConCumpl = await docMuchas.locator('.page').all();
  let hojasConTablaCumpl = 0;
  for(const pg of paginasConCumpl){
    const filas = pg.locator('table.cumpl tbody tr');
    const nFilas = await filas.count();
    if(!nFilas) continue;
    hojasConTablaCumpl++;
    const ultimaFila = filas.last();
    const pie = pg.locator('.footwrap');
    const boxFila = await ultimaFila.boundingBox();
    const boxPie = await pie.boundingBox();
    chkF('PDF con muchas pólizas: la última fila de cada hoja de Cumplimiento termina ANTES de donde empieza el pie (sin traslape)', boxFila.y + boxFila.height <= boxPie.y + 1);
  }
  chkF('PDF con muchas pólizas: Cumplimiento sí se repartió en más de una hoja', hojasConTablaCumpl > 1);

  chkF('No hubo errores de página con muchas pólizas activas', erroresMuchas.length === 0);
  await docMuchas.close();

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
