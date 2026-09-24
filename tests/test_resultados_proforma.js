/* Segundo intento de Resultados (24-sep-2026, pedido explícito de Victor:
   "necesito que comencemos el estado financiero desde cero, seguimos
   confundiendo las cosas") — esta vez calcado renglón por renglón del
   Excel real que comparte con su equipo ("Framework Proforma Forguard
   V2.xlsx"), en vez de construirlo a ciegas en fases sueltas.

   Los 4 pilares de negocio (ni uno más ni uno menos — "el total deben ser
   4 secciones", pidió Victor) se van conectando renglón por renglón,
   confirmando con él el criterio exacto antes de tocar código —esta
   prueba cubre el armazón en general (que sigue sin inventar números en
   los renglones aún no conectados) y el primer renglón ya wireado:
   Pólizas de mantenimiento / …incluidas en precio / Refacciones y
   materiales (ver montosPorMesPolizas() en index.html para el criterio
   exacto, confirmado con Victor vía AskUserQuestion). */
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

  // --------- 5) Un renglón sin fuente decidida todavía sigue en $0, nunca inventa un número ---------
  const filaSinConectar = await page.evaluate(() => {
    const fila = Array.from(document.querySelectorAll('#vista table.tabla-proforma tbody tr')).find(tr => tr.textContent.includes('Trabajos correctivos / preventivo'));
    return fila.querySelector('td.num').textContent;
  });
  chkF('"Trabajos correctivos / preventivo" (todavía sin conectar) sigue en $0', filaSinConectar.trim() === '$0');

  // --------- 6) Avisa que el armazón se conecta en vivo, no esconde lo que falta ---------
  chkF('Explica que se conecta renglón por renglón y nunca inventa un número', textoVista.includes('armazón') && textoVista.includes('nunca inventa un número'));

  // --------- 7) Pólizas de mantenimiento / …incluidas en precio / Refacciones y materiales (primer renglón conectado) ---------
  const anioActual = await page.evaluate(() => hoyISO().slice(0,4));
  await page.evaluate((anio) => {
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'NGK' })];
    datos.sitios = [normalizarSitio({ id:'s1', clienteId:'c1', nombre:'NGK' })];
    datos.polizas = [
      // Cargo a cliente, activa: SÍ cuenta en "Pólizas de mantenimiento".
      normalizarPoliza({ id:'p1', clienteId:'c1', sitioId:'s1', folio:'POL-1', sitioNombre:'NGK',
        estatus:'activa', facturacion:'mensual', cargoA:'cliente', fechaInicio: anio+'-01-01', fechaCotizacion: anio+'-01-01',
        partidas: [{ id:'x1', concepto:'Equipo', cantidad:1, precioUnitario:12000, costoUnitario:6000, frecuencia:1, mesesServicio:[0], alcance:'forguard' }],
        cobros: Array(12).fill(false) }),
      // Cargo interno (absorbida, facturada aparte, p.ej. a Plato Express), activa: cuenta en "...incluidas en precio".
      normalizarPoliza({ id:'p2', clienteId:'c1', sitioId:'s1', folio:'POL-2', sitioNombre:'NGK',
        estatus:'activa', facturacion:'mensual', cargoA:'interno', cargoAInterno:'Plato Express', descuento:-10, fechaInicio: anio+'-01-01', fechaCotizacion: anio+'-01-01',
        partidas: [{ id:'x1', concepto:'Equipo', cantidad:1, precioUnitario:9999, costoUnitario:4800, frecuencia:1, mesesServicio:[0], alcance:'forguard' }],
        cobros: Array(12).fill(false) }),
      // Todavía en cotización (no activa): NO debe contar en nada.
      normalizarPoliza({ id:'p3', clienteId:'c1', sitioId:'s1', folio:'POL-3', sitioNombre:'NGK',
        estatus:'cotizacion', facturacion:'mensual', cargoA:'cliente', fechaInicio: anio+'-01-01', fechaCotizacion: anio+'-01-01',
        partidas: [{ id:'x1', concepto:'Equipo', cantidad:1, precioUnitario:999999, costoUnitario:999999, frecuencia:1, mesesServicio:[0], alcance:'forguard' }],
        cobros: Array(12).fill(false) })
    ];
    render();
  }, anioActual);
  await page.waitForTimeout(150);

  const pilarTecnicos = await page.evaluate(() => {
    const pilar = PILARES_PROFORMA.find(p => p.id === 'tecnicos');
    const anio = hoyISO().slice(0,4);
    return {
      cliente: pilar.ingresos.find(c => c.id === 'polizas-cliente').montosPorMes(anio),
      interno: pilar.ingresos.find(c => c.id === 'polizas-interno').montosPorMes(anio),
      refacciones: pilar.costos.find(c => c.id === 'refacciones-materiales').montosPorMes(anio)
    };
  });
  chkF('"Pólizas de mantenimiento" (cargo cliente): $1,000/mes (12,000 ÷ 12), la de cotización NO se cuela', pilarTecnicos.cliente.every(m => m === 1000));
  chkF('"…incluidas en precio" (cargo interno): $440/mes (4,800 de costo + 10% de aumento = 5,280 ÷ 12)', pilarTecnicos.interno.every(m => m === 440));
  chkF('"Refacciones y materiales": suma el costo de AMBAS pólizas ($500 + $400 = $900/mes)', pilarTecnicos.refacciones.every(m => m === 900));

  const vistaConDatos = await page.evaluate(() => document.getElementById('vista').textContent);
  chkF('El ingreso ya wireado se refleja en la tabla ($1,000)', vistaConDatos.includes('$1,000'));
  chkF('El ingreso "incluidas en precio" ya wireado se refleja en la tabla ($440)', vistaConDatos.includes('$440'));
  chkF('El costo de Refacciones y materiales ya wireado se refleja en la tabla ($900)', vistaConDatos.includes('$900'));

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
