/* Reporte de CIERRE de servicio en Cotizaciones (27-oct-2026, pedido de
   Victor con una plantilla de Word adjunta —
   Plantilla_Reporte_Servicio_Forguard.docx—: "cuando tengamos una
   cotización podamos cerrarla e ingresar los reportes, analice las
   imagenes y pueda emitir un reporte de cierre, para que se pueda generar
   el reporte en representacion impresa como este formato").

   Tres aclaraciones que Victor confirmó al preguntarle (ver el comentario
   grande junto a normalizarReporteCierreCotizacion en index.html):
     1) Se deja APARTE del "Reporte de servicio" simple que ya existía
        (fotos + notas + firma) — "deja los dos por el momento". Esta
        prueba confirma que ambos coexisten sin pisarse.
     2) "Cerrar la cotización" usa la etapa "Servicios Realizados" que YA
        EXISTÍA (estatus 'realizado'/'realizado_comedor') — no se inventó
        un estatus nuevo.
     3) Las fotos se organizan agrupadas por equipo (sin IA) — esta prueba
        confirma que el pie de foto se arma del lado de index.html
        (armarPayloadReporteCierreCotizacion), igual que el resto de
        documentos de Forguard ("la plantilla formatea, no calcula").

   Calca, campo por campo, la estructura de la plantilla de Word: Equipos
   atendidos, Checklist de inspección, Mediciones (opcional), Hallazgos y
   recomendaciones (ordenados Alta→Media→Baja), Refacciones (instaladas
   antes que solicitadas), Conformidad, evidencia agrupada por equipo, y
   las dos secciones de fotos sueltas (hallazgos adicionales / anexo de
   órdenes de servicio). */
const path = require('path');
const { chromium } = require('playwright');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
const chk = (label, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' - ' + label); return cond; };
let fallas = 0;
const chkF = (label, cond) => { if(!chk(label, cond)) fallas++; };
const FOTO_PRUEBA = path.join(__dirname, 'fixtures', 'foto_prueba.png');

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
    /* Mismo truco que test_proyecto_imagen_storage.js: subirEvidenciaStorage()
       llama de verdad a firebasestorage.googleapis.com (fetchConTimeout), que
       ESTE sandbox no puede interceptar con page.route() — se sustituye la
       función completa por una falsa que nombra la URL de forma parecida. */
    window.subirEvidenciaStorage = async (dataUrl, carpeta, idArchivo) =>
      'https://firebasestorage.fake/o/' + encodeURIComponent(carpeta + '/' + idArchivo + '.jpg') + '?alt=media&token=FAKE';
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'Mercado Libre' })];
    datos.cotizaciones = [normalizarCotizacion({
      id:'q1', clienteId:'c1', folio:'COT-001', estatus:'realizado',
      partidas: [{ id:'x1', concepto:'Mantenimiento', cantidad:1, um:'SERV', precioCosto:1000 }]
    })];
  });

  // --------- 1) El botón solo aparece con la cotización "realizada" (misma etapa que el reporte simple) ---------
  await page.evaluate(() => { irAModulo('cotizaciones'); entrarCotizacion('q1'); });
  await page.waitForTimeout(150);
  chkF('El bloque "Reporte de cierre de servicio" aparece en una cotización "realizado"', (await page.locator('h3', { hasText: 'Reporte de cierre de servicio' }).count()) === 1);
  chkF('El reporte simple (ya existente) SIGUE apareciendo también — no se reemplazó, se dejaron los dos', (await page.locator('h3', { hasText: 'Reporte de servicio realizado' }).count()) === 1);

  await page.evaluate(() => { datos.cotizaciones[0].estatus = 'borrador'; render(); });
  await page.waitForTimeout(100);
  chkF('Con la cotización en borrador, el bloque de cierre NO aparece (igual que el reporte simple)', (await page.locator('h3', { hasText: 'Reporte de cierre de servicio' }).count()) === 0);
  await page.evaluate(() => { datos.cotizaciones[0].estatus = 'realizado'; render(); });
  await page.waitForTimeout(100);

  // --------- 2) Abrir el modal y capturar TODAS las secciones ---------
  await page.click('[data-accion="reporte-cierre-cotizacion"]');
  await page.waitForTimeout(150);

  await page.selectOption('#rcTipoServicio', 'preventivo');
  await page.fill('#rcTipoInstalacion', 'cocina industrial');
  await page.fill('#rcFechasTexto', '20 y 21 de octubre 2026');
  await page.fill('#rcFoliosTexto', 'MEX 1006 – MEX 1018');
  await page.fill('#rcTecnicosTexto', 'Juan Pérez');
  await page.fill('#rcCapturoTexto', 'Victor Mejía');
  await page.fill('#rcResumenQueSeHizo', 'Se dio mantenimiento preventivo a 2 equipos de cocina.');
  await page.fill('#rcResumenEstadoCierre', 'Ambos equipos quedan operando; uno en seguimiento.');

  // Botón "Sugerir" del ID de reporte
  await page.click('#btnSugerirIdCierre');
  const idSugerido = await page.$eval('#rcIdReporte', i => i.value);
  // "Mercado Libre" sin espacios/acentos, en mayúsculas y topado a 10 caracteres: "MERCADOLIB".
  chkF('"Sugerir" arma un ID con el patrón FG-...-AAMM a partir del cliente', /^FG-MERCADOLIB-\d{4}$/.test(idSugerido));

  // Equipos atendidos: 2 renglones
  await page.click('#btnAgregarEquipoRC');
  await page.click('#btnAgregarEquipoRC');
  const filasEquipo = page.locator('#rcEquiposWrap tr[data-idx]');
  await filasEquipo.nth(0).locator('[data-campo="folio"]').fill('MEX 1006');
  await filasEquipo.nth(0).locator('[data-campo="equipo"]').fill('Cámara de refrigeración');
  await filasEquipo.nth(0).locator('[data-campo="estatus"]').selectOption('operativo');
  await filasEquipo.nth(1).locator('[data-campo="folio"]').fill('MEX 1007');
  await filasEquipo.nth(1).locator('[data-campo="equipo"]').fill('Horno Rational');
  await filasEquipo.nth(1).locator('[data-campo="estatus"]').selectOption('seguimiento');

  // Checklist: un grupo con 2 actividades, una marcada
  await page.click('#btnAgregarGrupoChecklistRC');
  await page.fill('#rcChecklistWrap [data-campo-grupo="nombre"]', 'Cámara de refrigeración');
  await page.fill('#rcChecklistWrap [data-campo-grupo="folios"]', 'MEX 1006');
  await page.click('#rcChecklistWrap [data-agregar-item-checklist-rc]');
  await page.click('#rcChecklistWrap [data-agregar-item-checklist-rc]');
  const itemsChecklist = page.locator('#rcChecklistWrap [data-i]');
  await itemsChecklist.nth(0).locator('[data-campo-item="texto"]').fill('Revisión de temperatura');
  await itemsChecklist.nth(0).locator('[data-campo-item="hecho"]').check();
  await itemsChecklist.nth(1).locator('[data-campo-item="texto"]').fill('Limpieza de condensador');
  // la segunda queda SIN marcar a propósito, para probar el conteo "1 de 2"

  // Mediciones
  await page.click('#btnAgregarMedicionRC');
  await page.fill('#rcMedicionesWrap [data-campo="equipo"]', 'Cámara de refrigeración');
  await page.fill('#rcMedicionesWrap [data-campo="lectura"]', '13.37 A');
  await page.fill('#rcInstrumentoMediciones', 'Pinza amperimétrica Fluke 323');

  // Hallazgos: Baja capturado primero, Alta después — debe imprimirse Alta primero
  await page.click('#btnAgregarHallazgoRC');
  await page.click('#btnAgregarHallazgoRC');
  const filasHallazgo = page.locator('#rcHallazgosWrap tr[data-idx]');
  await filasHallazgo.nth(0).locator('[data-campo="prioridad"]').selectOption('baja');
  await filasHallazgo.nth(0).locator('[data-campo="hallazgo"]').fill('Diferencia menor de inventario');
  await filasHallazgo.nth(0).locator('[data-campo="recomendacion"]').fill('Ajustar en el próximo corte');
  await filasHallazgo.nth(1).locator('[data-campo="prioridad"]').selectOption('alta');
  await filasHallazgo.nth(1).locator('[data-campo="hallazgo"]').fill('Cable quemado en panel eléctrico, MEX 1007');
  await filasHallazgo.nth(1).locator('[data-campo="recomendacion"]').fill('Cambiar cable de inmediato, riesgo de incendio');

  // Refacciones: solicitada primero, instalada después — debe imprimirse instalada primero
  await page.click('#btnAgregarRefaccionRC');
  await page.click('#btnAgregarRefaccionRC');
  const filasRefaccion = page.locator('#rcRefaccionesWrap tr[data-idx]');
  await filasRefaccion.nth(0).locator('[data-campo="estatus"]').selectOption('solicitada');
  await filasRefaccion.nth(0).locator('[data-campo="descripcion"]').fill('Termostato');
  await filasRefaccion.nth(0).locator('[data-campo="equipoFolio"]').fill('Horno Rational · MEX 1007');
  await filasRefaccion.nth(1).locator('[data-campo="estatus"]').selectOption('instalada');
  await filasRefaccion.nth(1).locator('[data-campo="descripcion"]').fill('Banda de compresor');
  await filasRefaccion.nth(1).locator('[data-campo="equipoFolio"]').fill('Cámara de refrigeración · MEX 1006');

  // Fotos agrupadas por equipo
  await page.click('#btnAgregarGrupoFotosRC');
  await page.fill('#rcFotosGruposWrap [data-campo-grupo-foto="nombre"]', 'Cámara de refrigeración');
  await page.click('#rcFotosGruposWrap [data-agregar-foto-grupo-rc]');
  await page.setInputFiles('#rcArchivoFoto', FOTO_PRUEBA);
  await page.waitForTimeout(150);
  await page.fill('#rcFotosGruposWrap [data-campo-foto-grupo="etiqueta"]', 'Placa del equipo · S/N 8103177790');

  // Hallazgos adicionales (foto suelta)
  await page.click('[data-agregar-foto-suelta-rc="hallazgo"]');
  await page.setInputFiles('#rcArchivoFoto', FOTO_PRUEBA);
  await page.waitForTimeout(150);
  await page.fill('#rcFotosHallazgosWrap [data-campo-foto-suelta="etiqueta"]', 'Clavija quemada · cocina');

  // Anexo de órdenes de servicio (foto suelta)
  await page.click('[data-agregar-foto-suelta-rc="anexo"]');
  await page.setInputFiles('#rcArchivoFoto', FOTO_PRUEBA);
  await page.waitForTimeout(150);
  await page.fill('#rcFotosOrdenesWrap [data-campo-foto-suelta="etiqueta"]', 'MEX 1006');

  // Conformidad: solo la firma del técnico (la de cliente se deja en blanco a propósito)
  await page.click('#rcFirmaTecnicoWrap .js-firmar');
  await page.waitForTimeout(150);
  await page.fill('#rcFirmaTecnicoWrap .js-firma-nombre', 'Juan Pérez');
  await page.locator('#rcFirmaTecnicoWrap .js-firma-lienzo').scrollIntoViewIfNeeded();
  const cajaTecnico = await page.locator('#rcFirmaTecnicoWrap .js-firma-lienzo').boundingBox();
  await page.mouse.move(cajaTecnico.x + 10, cajaTecnico.y + 10);
  await page.mouse.down();
  await page.mouse.move(cajaTecnico.x + 60, cajaTecnico.y + 40);
  await page.mouse.up();
  await page.click('#rcFirmaTecnicoWrap .js-firma-guardar');
  await page.waitForTimeout(100);

  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(250);

  // --------- 3) Lo guardado en datos.cotizaciones[0].reporteCierre es correcto ---------
  const guardado = await page.evaluate(() => {
    const r = datos.cotizaciones.find(q => q.id === 'q1').reporteCierre;
    return {
      idReporte: r.idReporte, equipos: r.equipos.length, checklistHechos: r.checklist[0].items.filter(i=>i.hecho).length,
      checklistTotal: r.checklist[0].items.length, mediciones: r.mediciones.length, hallazgos: r.hallazgos.length,
      refacciones: r.refacciones.length, fotosGrupo: r.fotosGrupos[0].fotos.length,
      fotoGrupoEsUrlStorage: r.fotosGrupos[0].fotos[0].dataUrl.startsWith('https://firebasestorage.fake/'),
      fotoHallazgoEsUrlStorage: r.fotosHallazgosAdicionales[0].dataUrl.startsWith('https://firebasestorage.fake/'),
      fotoAnexoEsUrlStorage: r.fotosOrdenesServicio[0].dataUrl.startsWith('https://firebasestorage.fake/'),
      firmaTecnico: !!r.firmaTecnico, firmaCliente: !!r.firmaCliente
    };
  });
  chkF('El ID de reporte capturado se guardó', guardado.idReporte.startsWith('FG-'));
  chkF('Los 2 equipos capturados se guardaron', guardado.equipos === 2);
  chkF('El checklist guarda 1 de 2 actividades marcadas (la segunda se dejó sin marcar a propósito)', guardado.checklistHechos === 1 && guardado.checklistTotal === 2);
  chkF('La medición capturada se guardó', guardado.mediciones === 1);
  chkF('Los 2 hallazgos se guardaron', guardado.hallazgos === 2);
  chkF('Las 2 refacciones se guardaron', guardado.refacciones === 2);
  chkF('La foto del grupo se subió a Storage (no se quedó como data: embebido)', guardado.fotoGrupoEsUrlStorage);
  chkF('La foto de hallazgos adicionales se subió a Storage', guardado.fotoHallazgoEsUrlStorage);
  chkF('La foto del anexo de órdenes se subió a Storage', guardado.fotoAnexoEsUrlStorage);
  chkF('Se guardó la firma del técnico', guardado.firmaTecnico);
  chkF('NO se guardó firma de cliente (se dejó en blanco a propósito, nunca se inventa una)', !guardado.firmaCliente);

  // --------- 4) armarPayloadReporteCierreCotizacion(): KPIs, título y orden correctos ---------
  const payload = await page.evaluate(() => armarPayloadReporteCierreCotizacion(datos.cotizaciones.find(q => q.id === 'q1')));
  chkF('KPI "Equipos atendidos" = 2', payload.kpis.equiposAtendidos === 2);
  chkF('KPI "Operativos" = 1 (Cámara de refrigeración)', payload.kpis.operativos === 1);
  chkF('KPI "En seguimiento" = 1 (Horno Rational)', payload.kpis.enSeguimiento === 1);
  chkF('KPI "Refacción pendiente" = 0 (ninguno quedó en ese estatus)', payload.kpis.refaccionPendiente === 0);
  chkF('KPI "Hallazgos alta prioridad" = 1 (el cable quemado)', payload.kpis.hallazgosAltaPrioridad === 1);
  chkF('El título se arma solo: "Preventivo · 2 equipos de cocina industrial · Mercado Libre"', payload.titulo === 'Preventivo · 2 equipos de cocina industrial · Mercado Libre');
  chkF('Los hallazgos salen reordenados Alta → Baja (se capturaron Baja primero)', payload.hallazgos[0].prioridad === 'alta' && payload.hallazgos[1].prioridad === 'baja');
  chkF('Las refacciones salen reordenadas: instalada primero, solicitada después (se capturó al revés)', payload.refacciones[0].estatus === 'instalada' && payload.refacciones[1].estatus === 'solicitada');
  chkF('El checklist trae su conteo "hechos" ya calculado (1 de 2)', payload.checklist[0].hechos === 1 && payload.checklist[0].items.length === 2);
  chkF('El pie de foto del grupo llega ya armado (lo que se tecleó en el modal)', payload.fotosGrupos[0].fotos[0].etiqueta === 'Placa del equipo · S/N 8103177790');

  // --------- 5) Exportar PDF: la plantilla nueva abre y pinta sin errores ---------
  const [pestañaPdf] = await Promise.all([
    context.waitForEvent('page'),
    page.click('[data-accion="exportar-reporte-cierre-cotizacion"]')
  ]);
  await pestañaPdf.waitForLoadState();
  await pestañaPdf.waitForTimeout(300);
  const erroresPdf = [];
  pestañaPdf.on('pageerror', e => erroresPdf.push(String(e)));
  /* innerText refleja el CSS ya aplicado — los títulos de sección (.seccion-tit,
     .eyebrow, .barra-control) van en mayúsculas por text-transform:uppercase,
     así que se compara en minúsculas para no depender de esa transformación. */
  const textoDoc = (await pestañaPdf.evaluate(() => document.body.innerText)).toLowerCase();
  chkF('El documento exportado SÍ es el nuevo "Reporte de cierre" (no el simple)', textoDoc.includes('reporte de cierre de servicio'));
  chkF('El documento muestra el título calculado', textoDoc.includes('preventivo · 2 equipos de cocina industrial · mercado libre'));
  chkF('El documento muestra la tabla de Equipos atendidos', textoDoc.includes('equipos atendidos') && textoDoc.includes('cámara de refrigeración'));
  chkF('El documento muestra el hallazgo de Alta prioridad', textoDoc.includes('cable quemado en panel eléctrico'));
  chkF('El documento muestra la sección de Conformidad (hay firma de técnico)', textoDoc.includes('conformidad'));
  chkF('No hubo errores de JS en la pestaña del PDF', erroresPdf.length === 0);
  await pestañaPdf.close();

  chkF('No hubo errores de página en todo el escenario', errores.length === 0);
  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
