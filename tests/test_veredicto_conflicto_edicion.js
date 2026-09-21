/* Veredicto de auditoría (21-sep-2026), hallazgo crítico (15 d-p, Datos):
   "Dos personas capturando el mismo registro: el último en guardar borra el
   trabajo del otro, sin aviso". Antes, guardarReporte() (y equivalentes)
   no comparaban nada: quien guardaba último ganaba en silencio.

   Este test cubre el caso insignia (Reportes): dos "sesiones" abren el
   mismo reporte, una guarda primero, la sincronización trae ese cambio
   (registrarVersiones(), vía bajarDeLaNube), y cuando la SEGUNDA sesión
   intenta guardar, debe salir el aviso de conflicto — y solo se guarda si
   la persona decide "Guardar de todos modos"; si cancela, no se toca nada. */
const { chromium } = require('playwright');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
const chk = (label, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' - ' + label); return cond; };
let fallas = 0;
const chkF = (label, cond) => { if(!chk(label, cond)) fallas++; };

(async () => {
  const browser = await chromium.launch(OPCIONES_NAVEGADOR);
  const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });
  const errores = [];
  page.on('pageerror', e => errores.push('PAGEERROR: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error' && !/404/.test(msg.text())) errores.push('CONSOLE: ' + msg.text()); });
  await page.goto(URL_BASE + '/index.html');
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    sesion.correo='owner@a.com'; sesion.uid='u-owner'; sesion.idToken='FAKE'; sesion.refreshToken='F2';
    sesion.expira=Date.now()+3600000; sesion.rol='owner'; sesion.nombre='Victor Owner';
    ocultarAcceso();
    /* Firestore de mentiras, igual que en test_veredicto_sync_incremental.js. */
    window.pedirNube = async (ruta, opciones) => {
      if(ruta.indexOf('/meta/sync') === 0) return {}; // no hace falta para este test
      return { documents: [] };
    };
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'NGK' })];
    datos.sitios = [normalizarSitio({ id:'s1', clienteId:'c1', nombre:'Planta 1' })];
    datos.reportes = [normalizarReporte({ id:'r1', folio:'TK-0001', sitioId:'s1', sitioNombre:'Planta 1',
      titulo:'Fuga de gas', descripcion:'Original' })];
    /* Simula que la última sincronización conoció este reporte con un
       actualizadoEn — como si bajarDeLaNube() ya lo hubiera traído. */
    versiones = { reportes: { r1: '2026-09-21T10:00:00.000Z' } };
  });

  // --------- Escenario 1: SIN conflicto (nadie más lo tocó) ---------
  await page.evaluate(() => { irAModulo('reportes'); modalReporte('r1'); });
  await page.waitForTimeout(150);
  await page.fill('#rDescripcion', 'Editado sin conflicto');
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);
  const sinConflicto = await page.evaluate(() => ({
    descripcion: reportePorId('r1').descripcion,
    modalDeConflictoAbierto: document.getElementById('modalTitulo').textContent.includes('Alguien más')
  }));
  chkF('Sin conflicto: el guardado normal pasa directo, sin aviso', sinConflicto.descripcion === 'Editado sin conflicto');
  chkF('Sin conflicto: no aparece el modal de conflicto', sinConflicto.modalDeConflictoAbierto === false);

  // --------- Escenario 2: CON conflicto — alguien más ya guardó, y se CANCELA ---------
  /* Orden real: esta sesión abre el modal (congela versionAlAbrir con la
     versión de ESE momento) y lo deja abierto un rato — mientras tanto,
     "Ana" guarda desde otra sesión y ese cambio llega por sync (mismo
     objeto en memoria porque esto corre en una sola pestaña de prueba;
     en la vida real sería un `datos.reportes` reemplazado por
     bajarDeLaNube(), pero para huboConflictoDeEdicion() lo único que
     importa es que `versiones.reportes.r1` cambió desde que se abrió). */
  await page.evaluate(() => { modalReporte('r1'); });
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    reportePorId('r1').descripcion = 'Cambiado por Ana desde otra sesión';
    versiones.reportes.r1 = '2026-09-21T10:05:00.000Z';
  });
  await page.fill('#rDescripcion', 'Intento de sobrescribir sin saber del cambio ajeno');
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);
  const huboAviso = await page.evaluate(() => document.getElementById('modalTitulo').textContent);
  chkF('Con conflicto: SÍ aparece el aviso "Alguien más ya guardó cambios aquí"', huboAviso.includes('Alguien más'));

  await page.click('#btnConflictoCancelar');
  await page.waitForTimeout(150);
  const trasCancelar = await page.evaluate(() => reportePorId('r1').descripcion);
  chkF('Al cancelar, el cambio ajeno NO se pisa', trasCancelar === 'Cambiado por Ana desde otra sesión');

  // --------- Escenario 3: CON conflicto — se decide "Guardar de todos modos" ---------
  await page.evaluate(() => { modalReporte('r1'); });
  await page.waitForTimeout(150);
  await page.evaluate(() => { versiones.reportes.r1 = '2026-09-21T10:10:00.000Z'; }); // otro cambio ajeno más, mientras este modal sigue abierto
  await page.fill('#rDescripcion', 'Se guarda de todos modos, a propósito');
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);
  await page.click('#btnConflictoGuardar');
  await page.waitForTimeout(200);
  const trasSobrescribir = await page.evaluate(() => reportePorId('r1').descripcion);
  chkF('Al elegir "Guardar de todos modos", el guardado SÍ procede', trasSobrescribir === 'Se guarda de todos modos, a propósito');

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
