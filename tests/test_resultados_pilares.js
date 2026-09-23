/* Framework de Proforma (23-sep-2026, pedido de Victor): "acabamos de
   cambiar el formato para el cierre de indicadores y estados financieros
   basados en este formato" — un Excel que organiza todo por PILAR de
   negocio (Servicios Técnicos, Servicios Operativos, Proyectos e
   Infraestructura, Tecnología y Control) en vez de por fuente de ingreso,
   con Nómina repartida entre "directa del pilar" y "transversal" (Gastos
   de Estructura, sin prorratear). Se agregó una 4a forma de ver Resultados
   ("Por pilares") que reorganiza los mismos números de calcularResultados()
   más la nómina ya clasificada — ver calcularResultadosPorPilar().

   Esta prueba sobreescribe window.calcularResultados con valores fijos
   conocidos (la lógica de ESA función ya la cubren otras pruebas) para
   probar en aislado solo lo nuevo: que calcularResultadosPorPilar() meta
   cada número en el pilar correcto, que la nómina se sume por pilar y
   respete el periodo, y que la vista "Por pilares" lo pinte bien. */
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

    window.calcularResultados = () => ({
      ingresoPolizasCliente: 100000, ingresoPolizasInterno: 20000, ingresoCotizaciones: 50000,
      costoPolizas: 30000, costoCotizaciones: 15000,
      imagenMateriales: 8000, imagenManoObra: 4000,
      ingresoForpass: 60000,
      ingresoTotal: 230000, costoTotal: 45000, utilidadBruta: 185000, margenPct: 80.4,
      numPagosForpass:0, numCobrosPolizas:0, numPolizasNegociadasNoCobradas:0, numServiciosPolizas:0, numCotizaciones:0,
      rankingClientes:[], rankingSitios:[], rankingTecnicos:[], numProyectosImagen:0, imagenTotal:12000
    });

    datos.nomina = [
      normalizarRegistroNomina({ id:'n1', fecha:'2026-09-01', monto:200000, pilar:'tecnicos' }),
      normalizarRegistroNomina({ id:'n2', fecha:'2026-09-01', monto:50000, pilar:'operativos' }),
      normalizarRegistroNomina({ id:'n3', fecha:'2026-09-01', monto:70000, pilar:'proyectos' }),
      normalizarRegistroNomina({ id:'n4', fecha:'2026-09-01', monto:30000, pilar:'tecnologia' }),
      normalizarRegistroNomina({ id:'n5', fecha:'2026-09-01', monto:400000, pilar:'transversal' }),
      /* Fuera del periodo de prueba (agosto) — NO debe contarse en nada. */
      normalizarRegistroNomina({ id:'n6', fecha:'2026-08-01', monto:999999, pilar:'tecnicos' })
    ];
  });

  // --------- 1) calcularResultadosPorPilar(): cada número en su pilar ---------
  const pr = await page.evaluate(() => calcularResultadosPorPilar('2026-09-01', '2026-09-30', ''));
  const [tecnicos, operativos, proyectos, tecnologia] = pr.pilares;

  chkF('Servicios Técnicos: ingresos = pólizas cliente + interno + cotizaciones (170,000)', tecnicos.totalIngresos === 170000);
  chkF('Servicios Técnicos: costos = nómina del pilar + costo pólizas + costo cotizaciones (245,000)', tecnicos.totalCostos === 245000);
  chkF('...la nómina de agosto (fuera de periodo) NO se cuenta', tecnicos.costos.find(c => c.label === 'Nómina directa del pilar').monto === 200000);

  chkF('Servicios Operativos: sin ingresos capturados todavía (0)', operativos.totalIngresos === 0);
  chkF('Servicios Operativos: el único costo real es su nómina (50,000)', operativos.totalCostos === 50000);

  chkF('Proyectos e Infraestructura: sin ingreso propio todavía (0)', proyectos.totalIngresos === 0);
  chkF('Proyectos e Infraestructura: costos = nómina + materiales + mano de obra de Imagen (82,000)', proyectos.totalCostos === 82000);

  chkF('Tecnología y Control: el ingreso es el de FORPASS (60,000)', tecnologia.totalIngresos === 60000);
  chkF('Tecnología y Control: el costo es su nómina, FORPASS no tiene costo capturado (30,000)', tecnologia.totalCostos === 30000);

  chkF('Resumen Forguard: ingresos = suma de los 4 pilares (230,000)', pr.resumen.totalIngresos === 230000);
  chkF('Resumen Forguard: costos = suma de los 4 pilares (407,000)', pr.resumen.totalCostos === 407000);
  chkF('Resumen Forguard: utilidad bruta correcta (-177,000)', pr.resumen.utilidadBruta === -177000);

  chkF('Gastos de estructura: solo la nómina transversal cuenta hoy (400,000)', pr.totalEstructura === 400000);
  chkF('Utilidad operativa = utilidad bruta - gastos de estructura (-577,000)', pr.utilidadOperativa === -577000);

  // --------- 2) La vista "Por pilares" lo pinta correctamente ---------
  await page.evaluate(() => {
    estado.periodoResultados = 'personalizado';
    estado.resultadosDesde = '2026-09-01';
    estado.resultadosHasta = '2026-09-30';
    irAModulo('resultados');
  });
  await page.waitForTimeout(150);
  await page.click('[data-accion="vista-lista"][data-modo="pilares"]');
  await page.waitForTimeout(150);

  const vista = await page.evaluate(() => document.getElementById('vista').textContent);
  chkF('Se ven los 4 pilares por su nombre', ['Servicios Técnicos','Servicios Operativos','Proyectos e Infraestructura','Tecnología y Control'].every(n => vista.includes(n)));
  chkF('Se ve "Resumen Forguard" y "Gastos de estructura Forguard"', vista.includes('Resumen Forguard') && vista.includes('Gastos de estructura Forguard'));
  chkF('Se ve la utilidad operativa final', vista.includes('Utilidad operativa Forguard'));
  chkF('Avisa cuáles renglones siguen en $0 por falta de captura', /Servicios Operativos completo/.test(vista));

  const botonPresionado = await page.evaluate(() =>
    document.querySelector('[data-accion="vista-lista"][data-modo="pilares"]').getAttribute('aria-pressed'));
  chkF('El botón "Por pilares" queda marcado como activo', botonPresionado === 'true');

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
