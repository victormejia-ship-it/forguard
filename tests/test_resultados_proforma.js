/* Segundo intento de Resultados (24-sep-2026, pedido explícito de Victor:
   "necesito que comencemos el estado financiero desde cero, seguimos
   confundiendo las cosas") — esta vez calcado renglón por renglón del
   Excel real que comparte con su equipo ("Framework Proforma Forguard
   V2.xlsx"), en vez de construirlo a ciegas en fases sueltas.

   Por ahora es SOLO el armazón: los 4 pilares de negocio (ni uno más ni
   uno menos — "el total deben ser 4 secciones", pidió Victor), cada uno
   con sus renglones de Ingresos/Costos directos mes a mes, todos en $0 a
   propósito porque todavía no se decide de dónde saca su número cada
   renglón (eso viene después, paso a paso). Esta prueba cubre solo que el
   armazón pinte bien — la integración real con cada módulo se prueba
   aparte, conforme se vaya wireando cada renglón. */
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

  // --------- 1) Resultados es el módulo con el que arranca la app (pedido de Victor, 10-sep-2026) ---------
  const arranque = await page.evaluate(() => { cargar(); cargarModulo(); render(); return { modulo: estado.modulo, titulo: document.querySelector('h2').textContent }; });
  chkF('La app arranca en el módulo "resultados"', arranque.modulo === 'resultados');
  chkF('El título de la pantalla es "Resultados"', arranque.titulo === 'Resultados');

  // --------- 2) Gating por rol: reportero/técnico/control_activos no lo ven, el resto sí ---------
  const gating = await page.evaluate(() => {
    const resultado = {};
    ['owner','admin','analyst','viewer','tecnico','reportero','control_activos'].forEach(rol=>{
      sesion.rol = rol;
      resultado[rol] = modulosPermitidos().includes('resultados');
    });
    sesion.rol = 'owner';
    return resultado;
  });
  chkF('Owner ve Resultados', gating.owner === true);
  chkF('Admin ve Resultados', gating.admin === true);
  chkF('Analyst ve Resultados', gating.analyst === true);
  chkF('Viewer ve Resultados', gating.viewer === true);
  chkF('Técnico NO ve Resultados', gating.tecnico === false);
  chkF('Reportero NO ve Resultados', gating.reportero === false);
  chkF('control_activos NO ve Resultados', gating.control_activos === false);

  // --------- 3) EXACTAMENTE 4 secciones — un pilar de negocio cada una, en el orden del Excel ---------
  await page.evaluate(() => { irAModulo('resultados'); });
  await page.waitForTimeout(150);
  const secciones = await page.evaluate(() => Array.from(document.querySelectorAll('#vista h3')).map(h => h.textContent));
  chkF('Son EXACTAMENTE 4 secciones (pedido explícito: "el total deben ser 4 secciones")', secciones.length === 4);
  chkF('En el orden y con el nombre exacto del Excel "Framework Proforma Forguard V2"',
    JSON.stringify(secciones) === JSON.stringify(['Servicios Técnicos', 'Servicios Operativos', 'Proyectos e Infraestructura', 'Tecnología y Control']));

  // --------- 4) Cada sección trae sus renglones de Ingresos/Costos, calcados del Excel ---------
  const textoVista = await page.evaluate(() => document.getElementById('vista').textContent);
  const renglonesEsperados = [
    'Pólizas de mantenimiento', 'Trabajos correctivos / preventivo',
    'Limpieza', 'Fumigación', 'Transporte de personal',
    'Aperturas', 'Remodelaciones', 'Venta / renta de equipos',
    'FORPASS – renta / licenciamiento', 'FORPASS – venta de equipos',
    'Nómina directa del pilar', 'Refacciones y materiales', 'Materiales e insumos',
    'Contratistas / proveedores', 'Hardware / equipos FORPASS'
  ];
  renglonesEsperados.forEach(r => chkF('Trae el renglón "' + r + '"', textoVista.includes(r)));

  // --------- 5) Todavía sin datos: cada renglón en $0, nunca un número inventado ---------
  const primeraFilaMonto = await page.evaluate(() => {
    const fila = Array.from(document.querySelectorAll('#vista table.tabla-proforma tbody tr')).find(tr => tr.textContent.includes('Pólizas de mantenimiento') && !tr.textContent.includes('incluidas'));
    return fila.querySelector('td.num').textContent;
  });
  chkF('El primer renglón (Pólizas de mantenimiento) está en $0 — todavía no se decidió su fuente', primeraFilaMonto.trim() === '$0');

  // --------- 6) Avisa que es un armazón sin datos, no lo esconde ---------
  chkF('Explica que es el armazón, todavía sin datos reales', textoVista.includes('armazón') && textoVista.includes('$0 a propósito'));

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
