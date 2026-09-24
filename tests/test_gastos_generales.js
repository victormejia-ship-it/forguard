/* Segunda fase del rediseño de Resultados (24-sep-2026, mismo pedido de
   Victor que ya dio pie a Nómina): su "Cierre de mes" real trae varios
   rubros más —Gasolinas, Trampas de grasa, Extracciones, Renders, gastos
   administrativos/corporativos— que hasta ahora dejaban los tres renglones
   sin nómina de "Gastos de Estructura Forguard" fijos en $0 (ver
   calcularResultadosPorPilar). Mismo molde exacto que Nómina: un registro
   simple de mes + monto + concepto, sin recibo ni detalle por proveedor.

   Esta prueba cubre el módulo de captura en sí (alta, edición, borrado, los
   3 indicadores, la clasificación por categoría) y que sea invisible/
   inaccesible para cualquier rol que no sea Owner o Admin — la integración
   con calcularResultadosPorPilar() se cubre en test_resultados_pilares.js. */
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
      resultado[rol] = modulosPermitidos().includes('gastos-generales');
    });
    sesion.rol = 'owner'; // se deja como Owner para el resto de la prueba
    return resultado;
  });
  chkF('Owner ve el módulo Gastos generales', gating.owner === true);
  chkF('Admin ve el módulo Gastos generales', gating.admin === true);
  chkF('Analyst NO ve el módulo Gastos generales', gating.analyst === false);
  chkF('Viewer NO ve el módulo Gastos generales', gating.viewer === false);
  chkF('Técnico NO ve el módulo Gastos generales', gating.tecnico === false);
  chkF('Reportero NO ve el módulo Gastos generales', gating.reportero === false);

  const exigirComoAnalyst = await page.evaluate(() => {
    sesion.rol = 'analyst';
    const permitido = exigirAdmin('registrar un gasto general');
    sesion.rol = 'owner';
    return permitido;
  });
  chkF('exigirAdmin() bloquea a un Analyst aunque se invoque directo (defensa en profundidad)', exigirComoAnalyst === false);

  // --------- 2) Estado vacío ---------
  await page.evaluate(() => { irAModulo('gastos-generales'); });
  await page.waitForTimeout(150);
  const vacio = await page.evaluate(() => ({
    titulo: document.querySelector('h2').textContent,
    traeBotonVacio: document.querySelector('[data-accion="nuevo-gasto-general"]') !== null,
  }));
  chkF('El título de la pantalla es "Gastos generales"', vacio.titulo === 'Gastos generales');
  chkF('Con la lista vacía, se ofrece el botón de registrar', vacio.traeBotonVacio);

  // --------- 3) Registrar el primer gasto (categoría por default) ---------
  await page.click('[data-accion="nuevo-gasto-general"]');
  await page.waitForTimeout(150);
  await page.fill('#ggConcepto', 'Gasolina');
  await page.fill('#ggMonto', '12000');
  await page.click('#modalPie [data-modal="guardar"]');
  await page.waitForTimeout(150);
  const tras1 = await page.evaluate(() => ({
    total: datos.gastosGenerales.length,
    reg: datos.gastosGenerales[0],
  }));
  chkF('Se agrega el registro con el concepto capturado', tras1.total === 1 && tras1.reg.concepto === 'Gasolina');
  chkF('El monto se guarda tal cual se capturó', tras1.reg.monto === 12000);
  chkF('La fecha queda como el primer día del mes elegido', tras1.reg.fecha.endsWith('-01'));
  chkF('Por default, la categoría es "otro" (nunca se adivina una más específica)', tras1.reg.categoria === 'otro');

  const kpisTras1 = await page.evaluate(() => ({
    esteMes: document.querySelectorAll('.kpi .k-valor')[0].textContent,
    esteAnio: document.querySelectorAll('.kpi .k-valor')[1].textContent,
    promedio: document.querySelectorAll('.kpi .k-valor')[2].textContent,
  }));
  chkF('El KPI "Este mes" refleja el monto capturado', kpisTras1.esteMes.includes('12,000'));
  chkF('El KPI "Este año" también lo incluye (es el único registro)', kpisTras1.esteAnio.includes('12,000'));
  chkF('El promedio mensual es igual al único mes capturado', kpisTras1.promedio.includes('12,000'));

  // --------- 4) Un segundo registro, mismo mes, categoría específica ---------
  await page.click('[data-accion="nuevo-gasto-general"]');
  await page.waitForTimeout(150);
  await page.fill('#ggConcepto', 'Trampas de grasa');
  await page.fill('#ggMonto', '5000');
  await page.selectOption('#ggCategoria', 'administrativo');
  await page.click('#modalPie [data-modal="guardar"]');
  await page.waitForTimeout(150);
  const tras2 = await page.evaluate(() => ({
    total: datos.gastosGenerales.length,
    trampas: datos.gastosGenerales.find(g => g.concepto === 'Trampas de grasa'),
  }));
  chkF('Se puede clasificar un registro en una categoría específica (Gastos administrativos)', tras2.trampas && tras2.trampas.categoria === 'administrativo');
  const columnaCategoria = await page.evaluate(() => document.querySelector('.tabla tbody tr').textContent);
  chkF('La columna "Categoría" de la lista muestra el nombre completo de la categoría', /Gastos administrativos|Otros gastos de estructura/.test(columnaCategoria));
  chkF('El segundo registro se agrega aparte, sin reemplazar el primero', tras2.total === 2);
  chkF('...con el monto distinto capturado', tras2.trampas && tras2.trampas.monto === 5000);

  const esteMesTras2 = await page.evaluate(() => document.querySelectorAll('.kpi .k-valor')[0].textContent);
  chkF('"Este mes" ahora suma los dos registros del mismo mes (17,000)', esteMesTras2.includes('17,000'));

  // --------- 5) Un concepto vacío cae en "Gasto general" (mismo criterio que Nómina) ---------
  await page.click('[data-accion="nuevo-gasto-general"]');
  await page.waitForTimeout(150);
  await page.fill('#ggMonto', '3000');
  await page.click('#modalPie [data-modal="guardar"]');
  await page.waitForTimeout(150);
  const tras3 = await page.evaluate(() => datos.gastosGenerales.find(g => g.monto === 3000));
  chkF('Un concepto vacío cae en el default "Gasto general"', tras3 && tras3.concepto === 'Gasto general');

  // --------- 6) Editar un registro ---------
  const idPrimero = await page.evaluate(() => datos.gastosGenerales.find(g => g.concepto === 'Gasolina').id);
  await page.click('[data-accion="editar-gasto-general"][data-gasto-general="' + idPrimero + '"]');
  await page.waitForTimeout(150);
  await page.fill('#ggMonto', '15000');
  await page.click('#modalPie [data-modal="guardar"]');
  await page.waitForTimeout(150);
  const trasEditar = await page.evaluate(id => datos.gastosGenerales.find(g => g.id === id).monto, idPrimero);
  chkF('El monto editado se actualiza en el mismo registro', trasEditar === 15000);

  // --------- 7) Borrar un registro ---------
  await page.click('[data-accion="borrar-gasto-general"][data-gasto-general="' + idPrimero + '"]');
  await page.waitForTimeout(150);
  await page.click('#modalPie [data-modal="guardar"]');
  await page.waitForTimeout(150);
  const trasBorrar = await page.evaluate(() => ({
    total: datos.gastosGenerales.length,
    siguePresente: datos.gastosGenerales.some(g => g.concepto === 'Gasolina'),
  }));
  chkF('El registro borrado desaparece de la lista', trasBorrar.total === 2 && trasBorrar.siguePresente === false);

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
