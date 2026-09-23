/* Segundo pilar del Framework de Proforma (23-sep-2026, pedido de Victor):
   Limpieza, Fumigación y Transporte de personal, hoy en $0 porque ningún
   módulo los capturaba (ver la vista "Por pilares" de Resultados). Un solo
   módulo con 3 pestañas —no 3 módulos separados— y dos modelos de negocio
   distintos, ambos confirmados con Victor vía AskUserQuestion:
     - Limpieza: trabajo SUELTO por evento (como Cotizaciones).
     - Fumigación y Transporte: CONTRATO recurrente por sitio, un solo
       renglón (a diferencia de Pólizas, que desglosa equipo por equipo).

   Esta prueba cubre: alta/edición/borrado de ambos modelos, el toggle de
   cobro de un contrato (sin modal, clic directo en la tira de cobros), el
   gating de módulo por rol, y que calcularResultadosPorPilar() ya jale
   números reales de aquí en vez de los 0 hardcoded originales. */
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
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'ADIANT' })];
    datos.sitios = [normalizarSitio({ id:'s1', clienteId:'c1', nombre:'Valle Oriente' })];
  });

  // --------- 1) Gating por rol ---------
  const gating = await page.evaluate(() => {
    const resultado = {};
    ['owner','admin','analyst','viewer','tecnico','reportero','control_activos'].forEach(rol=>{
      sesion.rol = rol;
      resultado[rol] = modulosPermitidos().includes('servicios-operativos');
    });
    sesion.rol = 'owner';
    return resultado;
  });
  chkF('Owner ve el módulo', gating.owner === true);
  chkF('Admin ve el módulo', gating.admin === true);
  chkF('Analyst ve el módulo (a diferencia de Nómina, no es información sensible)', gating.analyst === true);
  chkF('Viewer ve el módulo (de solo lectura)', gating.viewer === true);
  chkF('Técnico NO ve el módulo (su lista de módulos es corta a propósito)', gating.tecnico === false);
  chkF('Reportero NO ve el módulo', gating.reportero === false);
  chkF('control_activos NO ve el módulo (solo ve Activos)', gating.control_activos === false);

  // --------- 2) Estado vacío ---------
  await page.evaluate(() => { irAModulo('servicios-operativos'); });
  await page.waitForTimeout(150);
  const vacio = await page.evaluate(() => ({
    titulo: document.querySelector('h2').textContent,
    traeBotonVacio: document.querySelector('[data-accion="nueva-servicio-operativo"]') !== null,
    tabActiva: document.querySelector('[data-servop-tab="limpieza"]').getAttribute('aria-selected'),
  }));
  chkF('El título de la pantalla es "Servicios Operativos"', vacio.titulo === 'Servicios Operativos');
  chkF('Con la lista vacía, se ofrece el botón de "Nuevo"', vacio.traeBotonVacio);
  chkF('Arranca en la pestaña Limpieza', vacio.tabActiva === 'true');

  // --------- 3) Alta de un evento (Limpieza) ---------
  await page.click('[data-accion="nueva-servicio-operativo"]');
  await page.waitForTimeout(150);
  await page.selectOption('#soCliente', 'c1');
  await page.selectOption('#soSitio', 's1');
  await page.fill('#soMontoEvento', '5000');
  await page.fill('#soCostoEvento', '2000');
  await page.selectOption('#soEstatusEvento', 'realizado');
  await page.click('#modalPie [data-modal="guardar"]');
  await page.waitForTimeout(150);
  const trasLimpieza = await page.evaluate(() => datos.serviciosOperativos[0]);
  chkF('Se agrega como tipo "limpieza"', trasLimpieza.tipo === 'limpieza');
  chkF('Guarda el sitio y cliente elegidos', trasLimpieza.sitioId === 's1' && trasLimpieza.clienteId === 'c1');
  chkF('Monto y costo se guardan tal cual', trasLimpieza.monto === 5000 && trasLimpieza.costoUnitario === 2000);
  chkF('Un evento solo trae un "cobro" (el propio trabajo) — cuenta por su estatus, no por la casilla', trasLimpieza.cobros.length === 1 && trasLimpieza.estatus === 'realizado');

  const kpiLimpieza = await page.evaluate(() => document.querySelectorAll('.kpi .k-valor')[2].textContent);
  chkF('El KPI "Limpieza realizada este mes" refleja el monto (5,000)', kpiLimpieza.includes('5,000'));

  // --------- 4) Alta de un contrato (Fumigación) ---------
  await page.click('[data-servop-tab="fumigacion"]');
  await page.waitForTimeout(150);
  await page.click('[data-accion="nueva-servicio-operativo"]');
  await page.waitForTimeout(150);
  const tipoPreseleccionado = await page.evaluate(() => document.getElementById('soTipo').value);
  chkF('"Nuevo" desde la pestaña Fumigación preselecciona ese tipo', tipoPreseleccionado === 'fumigacion');
  await page.selectOption('#soCliente', 'c1');
  await page.selectOption('#soSitio', 's1');
  await page.fill('#soMontoContrato', '3000');
  await page.fill('#soCostoContrato', '1200');
  await page.click('#modalPie [data-modal="guardar"]');
  await page.waitForTimeout(150);
  const contrato = await page.evaluate(() => datos.serviciosOperativos.find(s => s.tipo === 'fumigacion'));
  chkF('El contrato queda "activo" por default', contrato.estatus === 'activo');
  chkF('Facturación mensual por default → 12 cobros, ninguno marcado todavía', contrato.facturacion === 'mensual' && contrato.cobros.length === 12 && contrato.cobros.every(c => c === false));
  chkF('Un contrato es UN SOLO renglón (pedido explícito de Victor) — no se desglosa en equipos', contrato.monto === 3000 && contrato.costoUnitario === 1200);

  const traeTiraCobros = await page.evaluate(() => document.querySelectorAll('[data-toggle-cobro-servicio-operativo]').length);
  chkF('La tira de cobros del contrato se ve en la lista (12 casillas)', traeTiraCobros === 12);

  // --------- 5) Toggle de cobro (sin modal) ---------
  await page.click('[data-toggle-cobro-servicio-operativo="' + contrato.id + '"][data-idx="0"]');
  await page.waitForTimeout(150);
  const trasToggle1 = await page.evaluate(id => datos.serviciosOperativos.find(s => s.id === id).cobros[0], contrato.id);
  chkF('Un clic marca el cobro', trasToggle1 === true);
  await page.click('[data-toggle-cobro-servicio-operativo="' + contrato.id + '"][data-idx="0"]');
  await page.waitForTimeout(150);
  const trasToggle2 = await page.evaluate(id => datos.serviciosOperativos.find(s => s.id === id).cobros[0], contrato.id);
  chkF('Un segundo clic lo quita (se puede reabrir para corregir)', trasToggle2 === false);
  // Se deja marcado para la prueba de integración con Resultados de abajo.
  await page.click('[data-toggle-cobro-servicio-operativo="' + contrato.id + '"][data-idx="0"]');
  await page.waitForTimeout(150);

  // --------- 6) Editar y borrar ---------
  const idLimpieza = trasLimpieza.id;
  await page.click('[data-servop-tab="limpieza"]');
  await page.waitForTimeout(150);
  await page.click('[data-accion="editar-servicio-operativo"][data-servicio-operativo="' + idLimpieza + '"]');
  await page.waitForTimeout(150);
  await page.fill('#soMontoEvento', '6000');
  await page.click('#modalPie [data-modal="guardar"]');
  await page.waitForTimeout(150);
  const trasEditar = await page.evaluate(id => datos.serviciosOperativos.find(s => s.id === id).monto, idLimpieza);
  chkF('El monto editado se actualiza en el mismo registro', trasEditar === 6000);

  await page.click('[data-accion="borrar-servicio-operativo"][data-servicio-operativo="' + idLimpieza + '"]');
  await page.waitForTimeout(150);
  await page.click('#modalPie [data-modal="guardar"]');
  await page.waitForTimeout(150);
  const trasBorrar = await page.evaluate(() => ({
    total: datos.serviciosOperativos.length,
    quedaLimpieza: datos.serviciosOperativos.some(s => s.tipo === 'limpieza'),
  }));
  chkF('El registro borrado desaparece (solo queda el contrato de fumigación)', trasBorrar.total === 1 && trasBorrar.quedaLimpieza === false);

  // --------- 7) Integración con Resultados "Por pilares" ---------
  const pr = await page.evaluate(id => {
    const s = datos.serviciosOperativos.find(x => x.id === id);
    const mes = s.fecha.slice(0,7);
    return calcularResultadosPorPilar(mes + '-01', mes + '-31', '');
  }, contrato.id);
  const operativos = pr.pilares.find(p => p.nombre === 'Servicios Operativos');
  chkF('El ingreso de Fumigación entra al pilar "Servicios Operativos" (3,000 del cobro marcado)', operativos.ingresos.find(x => x.label === 'Fumigación').monto === 3000);
  chkF('El costo del contrato entra en "Proveedores / servicios subcontratados" (1,200)', operativos.costos.find(x => x.label === 'Proveedores / servicios subcontratados').monto === 1200);
  chkF('Limpieza y Transporte quedan en 0 (nada capturado en ese periodo/tipo)', operativos.ingresos.find(x => x.label === 'Limpieza').monto === 0 && operativos.ingresos.find(x => x.label === 'Transporte de personal').monto === 0);

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
