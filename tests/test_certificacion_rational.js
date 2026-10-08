/* Certificación RATIONAL: checklist editable + evidencia categorizada
   (08-oct-2026, pedido de Victor con un PDF real —reporte de Euromex Service
   para un iCombi Pro, serie E22SJ24073155686— y el mensaje: "estamos
   buscando certificarnos ante un proveedor llamado RATIONAL, el cual nos
   pide una inspección especifica con ciertos parámetros y evidencias...
   Requiero que podamos hacer algo similar para podernos certificar ante
   este proveedor").

   Decisión de alcance (confirmada con Victor vía preguntas antes de
   construir): aplica a CUALQUIER equipo con marca "Rational" (detección
   automática, sin lista de modelos a mano), el checklist es el del PDF
   transcrito tal cual PERO editable desde una pantalla de administración
   (por si RATIONAL cambia sus requisitos), y el resultado debe tanto quedar
   guardado en Forguard como —más adelante— exportarse en PDF.

   Esta primera entrega cubre: 1) el checklist en sí —datos.checklistRational,
   un documento único en Firestore (mismo molde que /catalogo), editable por
   Admin/Owner desde Pólizas → "Checklist RATIONAL", con los 36 puntos del
   PDF como semilla; y 2) su aparición condicional en modalServicioPoliza()
   —SOLO cuando x.marca es "Rational" (esMarcaRational), en cualquier otro
   equipo el modal se queda exactamente igual que siempre— con checklist de
   checkboxes y evidencia fotográfica POR CATEGORÍA (orden de servicio,
   placa, panel eléctrico, mediciones, pruebas iCareSystem/válvulas, calidad
   del agua), cada categoría con su propio cupo (EVIDENCIA_MAX_POR_CATEGORIA_
   RATIONAL) aparte de las "Fotos de evidencia" generales de siempre. Ni el
   checklist marcado ni esas fotos viajan al portal de clientes —son control
   interno para el certificador, misma lógica que modelo/serie/código (ver
   datosClientePoliza).

   Pendiente para una entrega posterior (ya en el radar, no en esta prueba):
   el mismo checklist+evidencia reusado en Levantamientos (modalHallazgo,
   que ya tiene su propio campo `marca` estructurado) y un botón de exportar
   PDF con un formato parecido al reporte de Euromex. */
const { chromium } = require('playwright');
const path = require('path');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
const chk = (label, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' - ' + label); return cond; };
let fallas = 0;
const chkF = (label, cond) => { if(!chk(label, cond)) fallas++; };

(async () => {
  const browser = await chromium.launch(OPCIONES_NAVEGADOR);
  const page = await browser.newPage({ viewport: { width: 1200, height: 1400 } });
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
        { id:'x1', concepto:'Horno Rational', marca:'Rational', modelo:'iCOMBIPRO', serie:'E22SJ24073155686', cantidad:1, precioUnitario:1000, frecuencia:3, mesesServicio:[9] },
        { id:'x2', concepto:'Refrigerador', marca:'True', modelo:'T-49', serie:'ABC123', cantidad:1, precioUnitario:1000, frecuencia:3, mesesServicio:[9] }
      ],
      cobros:[true]
    })];
    render();
  });
  await page.waitForTimeout(300);

  // --------- 1) El checklist, como admin: ver, editar, agregar, borrar ---------
  // Módulo propio "RATIONAL" desde el 08-oct-2026 (antes vivía dentro de
  // Pólizas) — su pantalla de arranque YA ES el checklist.
  await page.evaluate(() => irAModulo('rational'));
  await page.waitForTimeout(150);
  chkF('El checklist arranca con los 36 puntos del PDF de Euromex (semilla)', await page.locator('#cuerpoChecklistRational tr').count() === 36);
  const primerPunto = await page.locator('#cuerpoChecklistRational input[data-texto-checklist]').first().inputValue();
  chkF('El primer punto coincide con el PDF', primerPunto === 'Ajuste de temperatura - tiempo');

  await page.locator('#cuerpoChecklistRational input[data-texto-checklist]').first().fill('Punto editado de prueba');
  await page.locator('#cuerpoChecklistRational input[data-texto-checklist]').first().blur();
  await page.click('[data-accion="agregar-punto-checklist-rational"]');
  await page.waitForTimeout(100);
  await page.locator('#cuerpoChecklistRational input[data-texto-checklist]').last().fill('Punto nuevo de prueba');
  await page.locator('#cuerpoChecklistRational input[data-texto-checklist]').last().blur();
  await page.click('[data-accion="guardar-checklist-rational-cambios"]');
  await page.waitForTimeout(150);
  const trasGuardar = await page.evaluate(() => ({
    total: datos.checklistRational.length,
    primero: datos.checklistRational[0].texto,
    ultimo: datos.checklistRational[datos.checklistRational.length - 1].texto
  }));
  chkF('Editar + agregar + guardar deja 37 puntos', trasGuardar.total === 37);
  chkF('El punto editado se guardó de verdad', trasGuardar.primero === 'Punto editado de prueba');
  chkF('El punto nuevo se guardó de verdad', trasGuardar.ultimo === 'Punto nuevo de prueba');

  await page.click('#cuerpoChecklistRational tr:last-child [data-accion="borrar-checklist-rational"]');
  await page.waitForTimeout(100);
  chkF('Quitar un punto lo saca de la tabla', await page.locator('#cuerpoChecklistRational tr').count() === 36);
  // El borrado vive en el borrador hasta que se guarda de nuevo — si no, el
  // checklist VIGENTE (el que usará modalServicioPoliza) se queda en 37.
  await page.click('[data-accion="guardar-checklist-rational-cambios"]');
  await page.waitForTimeout(150);
  chkF('Guardar tras borrar deja el checklist vigente en 36 (no en 37)', (await page.evaluate(() => datos.checklistRational.length)) === 36);

  // --------- 2) El modal de servicio del equipo RATIONAL ---------
  await page.evaluate(() => modalServicioPoliza('p1', 'x1', 9, false));
  await page.waitForTimeout(150);
  chkF('El equipo con marca "Rational" SÍ muestra la sección de certificación', await page.locator('#svZonaRational').count() === 1);
  chkF('El checklist dentro del modal trae los 36 puntos vigentes', await page.locator('#svChecklistRational input[type="checkbox"]').count() === 36);
  chkF('Hay 7 categorías de evidencia (orden de servicio, placa, panel eléctrico, mediciones, iCareSystem, válvulas, calidad del agua)',
    await page.locator('#svEvidenciaRationalWrap .fotos-unidad').count() === 7);

  const checks = page.locator('#svChecklistRational input[type="checkbox"]');
  await checks.nth(0).check();
  await checks.nth(1).check();
  await checks.nth(2).check();
  chkF('El contador de puntos marcados se actualiza en vivo', (await page.locator('#svChecklistRational .pista').textContent()).includes('3 de'));

  const fixturePath = path.join(__dirname, 'fixtures', 'foto_prueba.png');
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('[data-agregar-categoria-rational="placa"]')
  ]);
  await fileChooser.setFiles(fixturePath);
  await page.waitForTimeout(300);
  const fotosPlaca = await page.locator('#svEvidenciaRationalWrap').evaluate(el => {
    const bloque = Array.from(el.querySelectorAll('.fotos-unidad')).find(b => b.querySelector('.fotos-unidad-titulo').textContent.includes('Placa'));
    return bloque ? bloque.querySelectorAll('.evidencia-foto').length : -1;
  });
  chkF('La foto subida cae en la categoría correcta ("Placa del equipo"), no en la galería general', fotosPlaca === 1);
  chkF('Esa foto NO aparece en la galería general de "Fotos de evidencia"', await page.locator('#svFotosWrap .evidencia-foto').count() === 0);

  await page.fill('#svCuando', '2026-09-15');
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(400);

  const guardado = await page.evaluate(() => {
    const det = datos.polizas.find(x=>x.id==='p1').hechos['x1']['9'];
    return { marcados: Object.keys(det.checklistRational).length, categorias: det.evidencias.map(e => e.categoriaRational) };
  });
  chkF('Se guardaron los 3 puntos marcados del checklist', guardado.marcados === 3);
  chkF('Se guardó la foto con su categoría ("placa")', guardado.categorias.includes('placa'));

  // --------- 3) Un equipo que NO es Rational: el modal se queda igual que siempre ---------
  await page.evaluate(() => modalServicioPoliza('p1', 'x2', 9, false));
  await page.waitForTimeout(150);
  chkF('Un equipo de otra marca (True) NO muestra la sección de certificación', await page.locator('#svZonaRational').count() === 0);
  await page.click('[data-modal="cancelar"]');

  // --------- 4) El checklist y la evidencia categorizada son control interno: no viajan al portal ---------
  const portal = await page.evaluate(() => {
    const p = datos.polizas.find(x=>x.id==='p1');
    const copia = datosClientePoliza(p);
    const det = copia.hechos['x1']['9'];
    return { checklist: det.checklistRational, evidencias: det.evidencias.length };
  });
  chkF('La copia del portal de clientes NO trae el checklist marcado', Object.keys(portal.checklist).length === 0);
  chkF('...ni la foto categorizada (es control interno para el certificador)', portal.evidencias === 0);

  chkF('No hubo errores de página en todo el escenario', errores.length === 0);
  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
