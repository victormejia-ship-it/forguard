/* Fase 1 del rediseño de Resultados (23-sep-2026, pedido de Victor): su
   "Cierre de mes" real mostró que Nómina es, de lejos, el gasto más grande
   del negocio (70-80% del costo total cada mes) y la app no lo capturaba
   en ningún lado. Este módulo nuevo (Owner/Admin exclusivo, ver
   modulosPermitidos() y firestore.rules) es el primer paso: un registro
   simple de mes + monto + concepto, sin detalle por empleado.

   Todavía NO se prueba su integración con calcularResultados() —esa es la
   fase final del rediseño, cuando estén los demás rubros (Gasolinas,
   Trampas, Extracciones, Renders, Gastos generales)— esta prueba cubre
   solo el módulo de captura en sí: alta, edición, borrado, los 3
   indicadores, y que sea invisible/inaccesible para cualquier rol que no
   sea Owner o Admin. */
const { chromium } = require('playwright');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
const chk = (label, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' - ' + label); return cond; };
let fallas = 0;
const chkF = (label, cond) => { if(!chk(label, cond)) fallas++; };

(async () => {
  const browser = await chromium.launch(OPCIONES_NAVEGADOR);
  const page = await browser.newPage();
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
  });

  // --------- 1) Gating por rol: solo Owner/Admin ven y pueden usar el módulo ---------
  const gating = await page.evaluate(() => {
    const resultado = {};
    ['owner','admin','analyst','viewer','tecnico','reportero'].forEach(rol=>{
      sesion.rol = rol;
      resultado[rol] = modulosPermitidos().includes('nomina');
    });
    sesion.rol = 'owner'; // se deja como Owner para el resto de la prueba
    return resultado;
  });
  chkF('Owner ve el módulo Nómina', gating.owner === true);
  chkF('Admin ve el módulo Nómina', gating.admin === true);
  chkF('Analyst NO ve el módulo Nómina', gating.analyst === false);
  chkF('Viewer NO ve el módulo Nómina', gating.viewer === false);
  chkF('Técnico NO ve el módulo Nómina', gating.tecnico === false);
  chkF('Reportero NO ve el módulo Nómina', gating.reportero === false);

  const exigirComoAnalyst = await page.evaluate(() => {
    sesion.rol = 'analyst';
    const permitido = exigirAdmin('registrar nómina');
    sesion.rol = 'owner';
    return permitido;
  });
  chkF('exigirAdmin() bloquea a un Analyst aunque se invoque directo (defensa en profundidad)', exigirComoAnalyst === false);

  // --------- 2) Estado vacío ---------
  await page.evaluate(() => { irAModulo('nomina'); });
  await page.waitForTimeout(150);
  const vacio = await page.evaluate(() => ({
    titulo: document.querySelector('h2').textContent,
    traeBotonVacio: document.querySelector('[data-accion="nueva-nomina"]') !== null,
  }));
  chkF('El título de la pantalla es "Nómina"', vacio.titulo === 'Nómina');
  chkF('Con la lista vacía, se ofrece el botón de registrar', vacio.traeBotonVacio);

  // --------- 3) Registrar el primer mes ---------
  await page.click('[data-accion="nueva-nomina"]');
  await page.waitForTimeout(150);
  const hoyYYYYMM = await page.evaluate(() => hoyISO().slice(0,7));
  await page.fill('#nomMonto', '850000');
  await page.click('#modalPie [data-modal="guardar"]');
  await page.waitForTimeout(150);
  const tras1 = await page.evaluate(() => ({
    total: datos.nomina.length,
    reg: datos.nomina[0],
  }));
  chkF('Se agrega el registro con el concepto por default "Nómina"', tras1.total === 1 && tras1.reg.concepto === 'Nómina');
  chkF('El monto se guarda tal cual se capturó', tras1.reg.monto === 850000);
  chkF('La fecha queda como el primer día del mes elegido', tras1.reg.fecha.endsWith('-01'));

  const kpisTras1 = await page.evaluate(() => ({
    esteMes: document.querySelectorAll('.kpi .k-valor')[0].textContent,
    esteAnio: document.querySelectorAll('.kpi .k-valor')[1].textContent,
    promedio: document.querySelectorAll('.kpi .k-valor')[2].textContent,
  }));
  chkF('El KPI "Este mes" refleja el monto capturado', kpisTras1.esteMes.includes('850,000'));
  chkF('El KPI "Este año" también lo incluye (es el único registro)', kpisTras1.esteAnio.includes('850,000'));
  chkF('El promedio mensual es igual al único mes capturado', kpisTras1.promedio.includes('850,000'));

  // --------- 4) Un segundo registro, mismo mes, concepto distinto (aguinaldo) ---------
  await page.click('[data-accion="nueva-nomina"]');
  await page.waitForTimeout(150);
  await page.fill('#nomConcepto', 'Aguinaldo');
  await page.fill('#nomMonto', '150000');
  await page.click('#modalPie [data-modal="guardar"]');
  await page.waitForTimeout(150);
  const tras2 = await page.evaluate(() => ({
    total: datos.nomina.length,
    aguinaldo: datos.nomina.find(n => n.concepto === 'Aguinaldo'),
  }));
  chkF('El segundo registro se agrega aparte, sin reemplazar el primero', tras2.total === 2);
  chkF('...con el concepto distinto capturado', tras2.aguinaldo && tras2.aguinaldo.monto === 150000);

  const esteMesTras2 = await page.evaluate(() => document.querySelectorAll('.kpi .k-valor')[0].textContent);
  chkF('"Este mes" ahora suma los dos registros del mismo mes (1,000,000)', esteMesTras2.includes('1,000,000'));

  // --------- 5) Editar un registro ---------
  const idPrimero = await page.evaluate(() => datos.nomina.find(n => n.concepto === 'Nómina').id);
  await page.click('[data-accion="editar-nomina"][data-nomina="' + idPrimero + '"]');
  await page.waitForTimeout(150);
  await page.fill('#nomMonto', '900000');
  await page.click('#modalPie [data-modal="guardar"]');
  await page.waitForTimeout(150);
  const trasEditar = await page.evaluate(id => datos.nomina.find(n => n.id === id).monto, idPrimero);
  chkF('El monto editado se actualiza en el mismo registro', trasEditar === 900000);

  // --------- 6) Borrar un registro ---------
  await page.click('[data-accion="borrar-nomina"][data-nomina="' + idPrimero + '"]');
  await page.waitForTimeout(150);
  await page.click('#modalPie [data-modal="guardar"]');
  await page.waitForTimeout(150);
  const trasBorrar = await page.evaluate(() => ({
    total: datos.nomina.length,
    siguePresente: datos.nomina.some(n => n.concepto === 'Nómina'),
  }));
  chkF('El registro borrado desaparece de la lista', trasBorrar.total === 1 && trasBorrar.siguePresente === false);

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
