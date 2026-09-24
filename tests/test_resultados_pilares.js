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
   respete el periodo, que el ingreso de Imagen/Aperturas (agregado
   23-sep-2026: cuenta desde "Aprobado" en adelante, nunca antes — el costo
   sigue igual que siempre, sin esperar ningún estatus) se sume por tipo de
   proyecto, y que la vista "Por pilares" lo pinte bien. */
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

    /* proyectosImagenIngresoPorTipo(): el costo (imagenMateriales/imagenManoObra)
       viene del mock de calcularResultados() de arriba, fijo — estos proyectos
       son solo para probar el INGRESO nuevo (23-sep-2026, pedido de Victor vía
       AskUserQuestion: cuenta desde "Aprobado" en adelante, nunca antes). */
    datos.proyectosImagen = [
      /* Aprobado, dentro del periodo → SÍ cuenta (Aperturas). */
      normalizarProyectoImagen({ id:'pi1', tipo:'apertura', estatus:'aprobado', fecha:'2026-09-05',
        conceptos:[{ concepto:'Barra', cantidad:2, costoUnitario:1000, precioVenta:1500 }] }),
      /* Terminado, dentro del periodo → SÍ cuenta (Remodelaciones). */
      normalizarProyectoImagen({ id:'pi2', tipo:'remodelacion', estatus:'terminado', fecha:'2026-09-10',
        conceptos:[{ concepto:'Piso', cantidad:1, costoUnitario:500, precioVenta:800 }] }),
      /* En obra, dentro del periodo → SÍ cuenta (Otros proyectos: cambio_imagen). */
      normalizarProyectoImagen({ id:'pi3', tipo:'cambio_imagen', estatus:'obra', fecha:'2026-09-15',
        conceptos:[{ concepto:'Rótulo', cantidad:1, costoUnitario:300, precioVenta:400 }] }),
      /* Todavía en diseño → el costo cuenta en otras pruebas, pero el INGRESO
         no: el cliente ni siquiera ha aprobado el presupuesto. */
      normalizarProyectoImagen({ id:'pi4', tipo:'apertura', estatus:'diseno', fecha:'2026-09-20',
        conceptos:[{ concepto:'Mostrador', cantidad:1, costoUnitario:200, precioVenta:999 }] }),
      /* Cancelado → no se invirtió nada de verdad, no cuenta ni ingreso ni costo. */
      normalizarProyectoImagen({ id:'pi5', tipo:'apertura', estatus:'cancelado', fecha:'2026-09-22',
        conceptos:[{ concepto:'Freidora', cantidad:1, costoUnitario:9999, precioVenta:9999 }] }),
      /* Aprobado pero FUERA del periodo (agosto) → no debe contarse. */
      normalizarProyectoImagen({ id:'pi6', tipo:'apertura', estatus:'aprobado', fecha:'2026-08-01',
        conceptos:[{ concepto:'Fuera de periodo', cantidad:1, costoUnitario:9999, precioVenta:9999 }] })
    ];

    /* Gastos generales (24-sep-2026, segunda fase del mismo rediseño):
       gastosGeneralesPorCategoriaEnPeriodo() agrupa por categoría, mismo
       criterio de periodo que la nómina de arriba. */
    datos.gastosGenerales = [
      normalizarGastoGeneral({ id:'gg1', fecha:'2026-09-03', monto:10000, categoria:'administrativo' }),
      normalizarGastoGeneral({ id:'gg2', fecha:'2026-09-12', monto:20000, categoria:'corporativo' }),
      normalizarGastoGeneral({ id:'gg3', fecha:'2026-09-20', monto:5000, categoria:'otro' }),
      /* Fuera del periodo de prueba (agosto) — NO debe contarse en nada. */
      normalizarGastoGeneral({ id:'gg4', fecha:'2026-08-01', monto:999999, categoria:'administrativo' })
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

  chkF('Proyectos e Infraestructura: Aperturas cuenta el proyecto Aprobado (3,000 = 2×1,000 costo → 2×1,500 venta)', proyectos.ingresos.find(x => x.label === 'Aperturas').monto === 3000);
  chkF('...Remodelaciones cuenta el proyecto Terminado (800)', proyectos.ingresos.find(x => x.label === 'Remodelaciones').monto === 800);
  chkF('...Otros proyectos cuenta el "cambio_imagen" En obra (400)', proyectos.ingresos.find(x => x.label === 'Otros proyectos').monto === 400);
  chkF('...Venta/renta de equipos sigue en 0 (sin módulo de captura)', proyectos.ingresos.find(x => x.label === 'Venta / renta de equipos').monto === 0);
  chkF('...En diseño, cancelado y fuera de periodo NO se cuentan (total ingreso = 4,200)', proyectos.totalIngresos === 4200);
  chkF('Proyectos e Infraestructura: costos = nómina + materiales + mano de obra de Imagen (82,000, del mock — el ingreso nuevo no lo toca)', proyectos.totalCostos === 82000);

  chkF('Tecnología y Control: el ingreso es el de FORPASS (60,000)', tecnologia.totalIngresos === 60000);
  chkF('Tecnología y Control: el costo es su nómina, FORPASS no tiene costo capturado (30,000)', tecnologia.totalCostos === 30000);

  chkF('Resumen Forguard: ingresos = suma de los 4 pilares (234,200)', pr.resumen.totalIngresos === 234200);
  chkF('Resumen Forguard: costos = suma de los 4 pilares (407,000)', pr.resumen.totalCostos === 407000);
  chkF('Resumen Forguard: utilidad bruta correcta (-172,800)', pr.resumen.utilidadBruta === -172800);

  chkF('Gastos administrativos: viene del módulo Gastos generales (10,000)', pr.estructura.find(x => x.label === 'Gastos administrativos').monto === 10000);
  chkF('Gastos corporativos asignados: viene del módulo Gastos generales (20,000)', pr.estructura.find(x => x.label === 'Gastos corporativos asignados').monto === 20000);
  chkF('Otros gastos de estructura: viene del módulo Gastos generales (5,000)', pr.estructura.find(x => x.label === 'Otros gastos de estructura').monto === 5000);
  chkF('Gastos de estructura: nómina transversal + los 3 gastos generales del periodo (435,000 — el de agosto NO se cuenta)', pr.totalEstructura === 435000);
  chkF('Utilidad operativa = utilidad bruta - gastos de estructura (-607,800)', pr.utilidadOperativa === -607800);

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
  chkF('Avisa cuáles renglones siguen en $0 por falta de captura', vista.includes('de Proyectos no tiene módulo propio'));

  const botonPresionado = await page.evaluate(() =>
    document.querySelector('[data-accion="vista-lista"][data-modo="pilares"]').getAttribute('aria-pressed'));
  chkF('El botón "Por pilares" queda marcado como activo', botonPresionado === 'true');

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
