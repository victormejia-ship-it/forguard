/* Regresión: los ajustes a modalPoliza() para duplicarPoliza() (ver
   test_poliza_duplicar.js) tocaron varios bindings (facturación, cargoA,
   cargoAInterno, tipo de ajuste/descuento, usaPreciosGrupo) que también se
   usan en los caminos NORMALES de crear y editar una póliza (sin
   duplicar). Este test cubre que esos dos caminos siguen intactos. */
const { chromium } = require('playwright');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
const chk = (label, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' - ' + label); return cond; };
let fallas = 0;
const chkF = (label, cond) => { if(!chk(label, cond)) fallas++; };

(async () => {
  const browser = await chromium.launch(OPCIONES_NAVEGADOR);
  const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });
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
      estatus:'activa', facturacion:'anual', cargoA:'interno', cargoAInterno:'Plato Express',
      descuento:-15, usaPreciosGrupo:true, notas:'Nota existente',
      fechaInicio:'2026-01-01', fechaCotizacion:'2026-01-01', fechaCierre:'2026-01-01',
      partidas: [{ id:'x1', concepto:'Equipo A', cantidad:1, precioUnitario:1000, frecuencia:1, mesesServicio:[0] }],
      cobros:[true]
    })];
    irAModulo('polizas');
  });
  await page.waitForTimeout(200);

  // --------- Nueva cotización de cero: defaults intactos ---------
  await page.click('[data-accion="nueva-poliza"]');
  await page.waitForTimeout(150);
  chkF('Título "Nueva cotización de póliza" (no lo confunde con duplicado/Excel)', (await page.textContent('#modalTitulo')) === 'Nueva cotización de póliza');
  chkF('Facturación default: mensual', await page.locator('#pFacturacion').inputValue() === 'mensual');
  chkF('Cargo a default: cliente', await page.locator('#pCargoA').inputValue() === 'cliente');
  chkF('cargoAInterno vacío', await page.inputValue('#pCargoAInterno') === '');
  chkF('Tipo de ajuste default: descuento', await page.locator('#pTipoAjuste').inputValue() === 'descuento');
  chkF('Descuento vacío', await page.inputValue('#pDescuento') === '');
  chkF('usaPreciosGrupo sin marcar', !(await page.isChecked('#pUsaPreciosGrupo')));
  await page.click('[data-modal="cancelar"]');
  await page.waitForTimeout(150);

  // --------- Editar una póliza existente: todo se sigue leyendo de la póliza real ---------
  await page.click('[data-editar-poliza="p1"]');
  await page.waitForTimeout(150);
  chkF('Título "Editar póliza"', (await page.textContent('#modalTitulo')) === 'Editar póliza');
  chkF('Facturación viene de la póliza (anual)', await page.locator('#pFacturacion').inputValue() === 'anual');
  chkF('Cargo a viene de la póliza (interno)', await page.locator('#pCargoA').inputValue() === 'interno');
  chkF('cargoAInterno viene de la póliza (Plato Express)', await page.inputValue('#pCargoAInterno') === 'Plato Express');
  chkF('Tipo de ajuste viene de la póliza (aumento, descuento negativo)', await page.locator('#pTipoAjuste').inputValue() === 'aumento');
  chkF('Descuento viene de la póliza (15)', await page.inputValue('#pDescuento') === '15');
  chkF('usaPreciosGrupo viene de la póliza (marcado)', await page.isChecked('#pUsaPreciosGrupo'));
  chkF('El folio SÍ se conserva al editar (POL-001)', await page.inputValue('#pFolio') === 'POL-001');
  chkF('La vigencia SÍ se conserva al editar (2026-01-01)', await page.inputValue('#pInicio') === '2026-01-01');

  // Cambiar algo y guardar para confirmar que el guardado normal sigue intacto.
  await page.fill('#pNotas', 'Nota editada');
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);
  const pDespues = await page.evaluate(() => polizaPorId('p1'));
  chkF('Guardar edición normal sigue funcionando (notas actualizadas)', pDespues.notas === 'Nota editada');
  chkF('El resto de la póliza no se alteró (folio sigue POL-001)', pDespues.folio === 'POL-001');
  chkF('Sigue habiendo solo 1 póliza (no se duplicó por accidente)', (await page.evaluate(() => datos.polizas.length)) === 1);

  console.log('Errores:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
