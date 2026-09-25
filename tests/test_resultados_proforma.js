/* Segundo intento de Resultados (24-sep-2026, pedido explícito de Victor:
   "necesito que comencemos el estado financiero desde cero, seguimos
   confundiendo las cosas") — esta vez calcado renglón por renglón del
   Excel real que comparte con su equipo ("Framework Proforma Forguard
   V2.xlsx"), en vez de construirlo a ciegas en fases sueltas.

   Los 4 pilares de negocio (ni uno más ni uno menos — "el total deben ser
   4 secciones", pidió Victor) se van conectando renglón por renglón,
   confirmando con él el criterio exacto antes de tocar código —esta
   prueba cubre el armazón en general (que sigue sin inventar números en
   los renglones aún no conectados) y los dos renglones ya wireados:
   Pólizas de mantenimiento / …incluidas en precio / Refacciones y
   materiales (ver montosPorMesPolizas() en index.html) y Trabajos
   correctivos / preventivo / Otros costos directos (ver
   montosPorMesCotizacionesRealizadas()) — ambos con el criterio exacto
   confirmado con Victor vía AskUserQuestion. */
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
  const secciones = await page.evaluate(() => Array.from(document.querySelectorAll('#vista .bloque-pilar h3')).map(h => h.textContent));
  chkF('Son EXACTAMENTE 4 secciones (pedido explícito: "el total deben ser 4 secciones") — sin contar el Resumen general', secciones.length === 4);
  chkF('En el orden y con el nombre exacto del Excel "Framework Proforma Forguard V2"',
    JSON.stringify(secciones) === JSON.stringify(['Servicios Técnicos', 'Servicios Operativos', 'Proyectos e Infraestructura', 'Tecnología y Control']));

  // --------- 3b) .wrap se ensancha en Resultados (pedido de Victor, 25-sep-2026: "un poco más amplio... para visualizar todo") ---------
  const anchoWrap = await page.evaluate(() => document.querySelector('.wrap').classList.contains('wrap-ancho'));
  chkF('.wrap lleva la clase wrap-ancho en Resultados (más espacio para gráfico + tabla lado a lado)', anchoWrap === true);
  const anchoEnOtroModulo = await page.evaluate(() => { irAModulo('clientes'); return document.querySelector('.wrap').classList.contains('wrap-ancho'); });
  chkF('Fuera de Resultados, .wrap vuelve a su ancho normal (no se ensancha toda la app)', anchoEnOtroModulo === false);
  await page.evaluate(() => { irAModulo('resultados'); });
  await page.waitForTimeout(150);

  // --------- 3c) Resumen general arriba de los 4 pilares (pedido de Victor: "el dato general de la empresa") ---------
  const resumen = await page.evaluate(() => {
    const bloque = Array.from(document.querySelectorAll('#vista h3')).find(h => h.textContent === 'Resumen general Forguard');
    return { existe: !!bloque, esPrimero: bloque === document.querySelectorAll('#vista h3')[0] };
  });
  chkF('Existe el bloque "Resumen general Forguard"', resumen.existe === true);
  chkF('El Resumen general va ANTES que los 4 pilares', resumen.esPrimero === true);

  // --------- 3d) Cada bloque (Resumen general y cada pilar) trae gráfico a la izquierda y datos a la derecha ---------
  const layout = await page.evaluate(() => {
    const grids = Array.from(document.querySelectorAll('#vista .proforma-grid'));
    return grids.map(g => ({
      primerHijoEsGrafico: g.firstElementChild.classList.contains('proforma-grafico'),
      traeGrafico: g.querySelector('.proforma-grafico svg, .proforma-grafico .svg-vacio') !== null
    }));
  });
  chkF('Son 5 bloques con .proforma-grid (Resumen general + 4 pilares)', layout.length === 5);
  chkF('En TODOS, el gráfico va primero (columna izquierda) y los datos después (columna derecha)', layout.every(l => l.primerHijoEsGrafico && l.traeGrafico));

  // --------- 3e) Tablas compactas por default (pedido de Victor: "que no se vea tan amontonada... solo el mes actual y los 3 anteriores") ---------
  const compacto = await page.evaluate(() => {
    const anio = hoyISO().slice(0,4);
    const mesActual = Number(hoyISO().slice(5,7)) - 1;
    const esperadosMeses = [];
    for(let i = Math.max(0, mesActual - 3); i <= mesActual; i++) esperadosMeses.push(MESES_PROFORMA[i]);
    const primeraTabla = document.querySelector('#vista .bloque-pilar table.tabla-proforma');
    const encabezados = Array.from(primeraTabla.querySelectorAll('thead th')).map(th => th.textContent);
    const colspanSeccion = Number(primeraTabla.querySelector('tr.fila-seccion td').getAttribute('colspan'));
    return { esperados: ['Concepto', ...esperadosMeses, 'Total ' + anio], encabezados, colspanSeccion, mesesVisibles: esperadosMeses.length };
  });
  chkF('Por default, cada tabla muestra SOLO el mes actual y los 3 anteriores (nunca los 12 de un jalón)',
    JSON.stringify(compacto.encabezados) === JSON.stringify(compacto.esperados));
  chkF('El colspan de "Ingresos"/"Costos directos" cuadra con las columnas realmente visibles (no se ve descuadrado)',
    compacto.colspanSeccion === compacto.mesesVisibles + 2);

  // "Ver los 12 meses" no omite nada, solo lo oculta — un clic revela las 4 tablas a la vez (mismo estado global)
  await page.evaluate(() => { document.querySelector('[data-accion="vista-lista"][data-campo="resultadosMeses"][data-modo="todos"]').click(); });
  await page.waitForTimeout(100);
  const expandido = await page.evaluate(() => Array.from(document.querySelectorAll('#vista .bloque-pilar table.tabla-proforma')).map(t => t.querySelectorAll('thead th').length));
  chkF('Un clic en "Ver los 12 meses" expande las 4 tablas a la vez (14 columnas: Concepto + 12 + Total)',
    expandido.length === 4 && expandido.every(n => n === 14));

  await page.evaluate(() => { document.querySelector('[data-accion="vista-lista"][data-campo="resultadosMeses"][data-modo="compacto"]').click(); });
  await page.waitForTimeout(100);
  const comprimidoDeNuevo = await page.evaluate(() => document.querySelector('#vista .bloque-pilar table.tabla-proforma thead').querySelectorAll('th').length);
  chkF('Un clic en "Últimos meses" vuelve a comprimir la tabla', comprimidoDeNuevo === compacto.mesesVisibles + 2);

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

  // --------- 8) Trabajos correctivos / preventivo + Otros costos directos (segundo renglón conectado, Cotizaciones) ---------
  await page.evaluate((anio) => {
    datos.cotizaciones = [
      // 'realizado', cargo cliente: SÍ cuenta. Costo 1000 × margen 15% = 1150 de ingreso.
      normalizarCotizacion({ id:'q1', clienteId:'c1', sitioId:'s1', folio:'COT-1', cargoA:'cliente',
        estatus:'realizado', fecha: anio+'-02-01', fechaRealizado: anio+'-02-10',
        partidas: [{ concepto:'Reparación de compresor', cantidad:1, precioCosto:1000 }] }),
      // 'realizado', cargo comedor: confirmado con Victor que TAMBIÉN cuenta (sin filtrar por cargoA).
      normalizarCotizacion({ id:'q2', clienteId:'c1', sitioId:'s1', folio:'COT-2', cargoA:'comedor',
        estatus:'realizado', fecha: anio+'-03-01', fechaRealizado: anio+'-03-05',
        partidas: [{ concepto:'Ajuste de equipo de comedor', cantidad:2, precioCosto:300 }] }),
      // 'realizado' sin fechaRealizado capturada: usa `fecha` como respaldo, no se pierde.
      normalizarCotizacion({ id:'q4', clienteId:'c1', sitioId:'s1', folio:'COT-4', cargoA:'cliente',
        estatus:'realizado', fecha: anio+'-01-20', fechaRealizado:'',
        partidas: [{ concepto:'Trabajo con fecha de respaldo', cantidad:1, precioCosto:200 }] }),
      // 'aprobada' (NO 'realizado'): a propósito NO debe contar, aunque ESTATUS_COTIZACION_INGRESO sí la marque como "ganada".
      normalizarCotizacion({ id:'q3', clienteId:'c1', sitioId:'s1', folio:'COT-3', cargoA:'cliente',
        estatus:'aprobada', fecha: anio+'-02-01', fechaRealizado: anio+'-02-10',
        partidas: [{ concepto:'Cotización solo aprobada', cantidad:1, precioCosto:99999999 }] }),
      // 'realizado' pero de OTRO año: no debe colarse en el año actual.
      normalizarCotizacion({ id:'q5', clienteId:'c1', sitioId:'s1', folio:'COT-5', cargoA:'cliente',
        estatus:'realizado', fecha: (Number(anio)-1)+'-12-01', fechaRealizado: (Number(anio)-1)+'-12-01',
        partidas: [{ concepto:'Cotización de otro año', cantidad:1, precioCosto:50000 }] })
    ];
    render();
  }, anioActual);
  await page.waitForTimeout(150);

  const cotizTecnicos = await page.evaluate(() => {
    const pilar = PILARES_PROFORMA.find(p => p.id === 'tecnicos');
    const anio = hoyISO().slice(0,4);
    return {
      ingreso: pilar.ingresos.find(c => c.id === 'correctivo-preventivo').montosPorMes(anio),
      costo: pilar.costos.find(c => c.id === 'otros-costos').montosPorMes(anio)
    };
  });
  chkF('"Trabajos correctivos / preventivo": Ene $230 (fecha de respaldo), Feb $1,150 (cliente, la "aprobada" NO se cuela), Mar $690 (comedor, sí cuenta)',
    Math.round(cotizTecnicos.ingreso[0]) === 230 && Math.round(cotizTecnicos.ingreso[1]) === 1150 && Math.round(cotizTecnicos.ingreso[2]) === 690);
  chkF('El resto de los meses de "Trabajos correctivos / preventivo" siguen en $0 (la de otro año no se coló)',
    cotizTecnicos.ingreso.filter((_,i) => ![0,1,2].includes(i)).every(m => m === 0));
  chkF('"Otros costos directos": Ene $200, Feb $1,000, Mar $600 (costo sin IVA de esas mismas cotizaciones)',
    cotizTecnicos.costo[0] === 200 && cotizTecnicos.costo[1] === 1000 && cotizTecnicos.costo[2] === 600);
  chkF('El resto de los meses de "Otros costos directos" siguen en $0', cotizTecnicos.costo.filter((_,i) => ![0,1,2].includes(i)).every(m => m === 0));

  // Ene/Feb/Mar quedan fuera de la ventana compacta (mes actual + 3
  // anteriores) casi todo el año — hay que pedir "Ver los 12 meses" para
  // que esas columnas existan en el DOM antes de buscarlas en la tabla.
  await page.evaluate(() => { estado.resultadosMeses = 'todos'; render(); });
  await page.waitForTimeout(100);
  const filasCotizadas = await page.evaluate(() => {
    const filaDe = (texto) => Array.from(document.querySelectorAll('#vista table.tabla-proforma tbody tr')).find(tr => tr.textContent.includes(texto)).textContent;
    return { ingreso: filaDe('Trabajos correctivos / preventivo'), costo: filaDe('Otros costos directos') };
  });
  chkF('Con "Ver los 12 meses": el renglón "Trabajos correctivos / preventivo" trae sus montos en la tabla ($230/$1,150/$690)',
    filasCotizadas.ingreso.includes('$230') && filasCotizadas.ingreso.includes('$1,150') && filasCotizadas.ingreso.includes('$690'));
  chkF('Con "Ver los 12 meses": el renglón "Otros costos directos" trae sus montos en la tabla ($200/$1,000/$600)',
    filasCotizadas.costo.includes('$200') && filasCotizadas.costo.includes('$1,000') && filasCotizadas.costo.includes('$600'));
  await page.evaluate(() => { estado.resultadosMeses = 'compacto'; render(); });
  await page.waitForTimeout(100);

  // --------- 9) Con datos reales: el Resumen general los suma y el gráfico de Servicios Técnicos deja de ser el placeholder vacío ---------
  const resumenConDatos = await page.evaluate(() => {
    const r = resumenGeneralProforma(hoyISO().slice(0,4));
    return { totalIngresos: r.totalIngresos, porPilarTecnicos: r.porPilar.find(p => p.nombre === 'Servicios Técnicos').totalIngresos };
  });
  chkF('Resumen general: Ingresos totales de la empresa = suma de Servicios Técnicos ($12,000 + $5,280 + $2,070 = $19,350)', resumenConDatos.totalIngresos === 19350);
  chkF('Resumen general: el aporte de Servicios Técnicos al ranking es ese mismo total', resumenConDatos.porPilarTecnicos === 19350);

  const kpiIngresos = await page.evaluate(() => {
    const kpi = Array.from(document.querySelectorAll('#vista .kpis .kpi')).find(k => k.textContent.includes('Ingresos totales'));
    return kpi ? kpi.querySelector('.k-valor').textContent : null;
  });
  chkF('La tarjeta KPI "Ingresos totales" del Resumen general muestra $19,350', kpiIngresos === '$19,350');

  const graficoTecnicos = await page.evaluate(() => {
    const bloque = document.querySelector('.bloque-pilar');
    return {
      esServiciosTecnicos: bloque.querySelector('h3').textContent === 'Servicios Técnicos',
      traeSvg: bloque.querySelector('.proforma-grafico svg') !== null,
      traePlaceholderVacio: bloque.querySelector('.proforma-grafico .svg-vacio') !== null,
      cantidadHits: bloque.querySelectorAll('.proforma-grafico rect.grafica-hit').length
    };
  });
  chkF('El primer bloque-pilar es Servicios Técnicos', graficoTecnicos.esServiciosTecnicos === true);
  chkF('Su gráfico ya no muestra el placeholder de "sin renglones conectados" (ya tiene datos)', graficoTecnicos.traeSvg === true && graficoTecnicos.traePlaceholderVacio === false);
  chkF('Su gráfico trae 12 blancos de mouse (uno por mes) para el tooltip', graficoTecnicos.cantidadHits === 12);

  // --------- 10) El tooltip real, al pasar el mouse sobre Febrero de Servicios Técnicos ---------
  await page.locator('.bloque-pilar').first().locator('rect.grafica-hit[data-mes="2"]').hover({ force: true });
  await page.waitForTimeout(80);
  const tt = await page.evaluate(() => ({ visible: document.getElementById('graficaTT').classList.contains('visible'), texto: document.getElementById('graficaTT').textContent }));
  chkF('El tooltip aparece al pasar el mouse sobre un mes del gráfico', tt.visible === true);
  chkF('El tooltip de Febrero muestra el ingreso correcto ($2,590 = $1,000 pólizas cliente + $440 incluidas en precio + $1,150 de la cotización "realizado")',
    tt.texto.includes('Feb') && tt.texto.includes('$2,590'));
  await page.mouse.move(5, 5);
  await page.waitForTimeout(80);
  const ttOculto = await page.evaluate(() => document.getElementById('graficaTT').classList.contains('visible'));
  chkF('El tooltip se esconde al sacar el mouse', ttOculto === false);

  // --------- 11) Cumplimiento de pólizas: mismo cálculo de calcularPoliza() (cumplimientoPct/hechosDebidos/serviciosDebidos), ahora agregado ---------
  const cumplimiento = await page.evaluate(() => {
    const items = polizasActivasParaCumplimiento();
    return {
      cantidad: items.length,
      folios: items.map(it => it.p.folio).sort(),
      hechosTotal: items.reduce((t,it)=> t + it.hechosDebidos, 0),
      debidosTotal: items.reduce((t,it)=> t + it.serviciosDebidos, 0),
      ingresos: items.map(it => it.precioAnual).sort((a,b)=>a-b)
    };
  });
  chkF('Cumplimiento de pólizas: solo cuenta las ACTIVAS (POL-1 y POL-2 — la POL-3, en cotización, no entra)',
    cumplimiento.cantidad === 2 && JSON.stringify(cumplimiento.folios) === JSON.stringify(['POL-1','POL-2']));
  chkF('Ambas pólizas tienen su servicio de enero sin marcar como hecho: 0 de 2 servicios debidos cumplidos',
    cumplimiento.hechosTotal === 0 && cumplimiento.debidosTotal === 2);
  chkF('El ingreso anual de cada punto es el mismo que ya usan "Pólizas de mantenimiento" ($12,000 y $5,280)',
    JSON.stringify(cumplimiento.ingresos) === JSON.stringify([5280, 12000]));

  // Pedido de Victor (25-sep-2026, tras ver la primera versión como sección
  // aparte): "que este apartado se incluyera debajo de la gráfica de la
  // sección de servicios técnicos" — vive DENTRO del bloque-pilar de
  // Servicios Técnicos, apilado bajo su gráfico de Ingresos/Costos, no en
  // su propia fila ancha ni en los otros 3 pilares.
  const bloqueCumplimiento = await page.evaluate(() => {
    const bloquesPilar = Array.from(document.querySelectorAll('#vista .bloque-pilar'));
    const tecnicos = bloquesPilar.find(b => b.querySelector('h3').textContent === 'Servicios Técnicos');
    const h4 = tecnicos && Array.from(tecnicos.querySelectorAll('h4')).find(h => h.textContent === 'Cumplimiento de pólizas');
    const divisor = h4 && h4.closest('.proforma-divisor');
    const graficoIngresos = tecnicos && tecnicos.querySelector('.proforma-grafico svg[aria-label*="Ingresos, costos y utilidad"]');
    const otrosConCumplimiento = bloquesPilar.filter(b => b !== tecnicos && Array.from(b.querySelectorAll('h4')).some(h => h.textContent === 'Cumplimiento de pólizas')).length;
    return {
      existe: !!divisor,
      // firstElementChild.nextElementSibling... más simple: compara posición en el DOM (compareDocumentPosition)
      vaDespuesDelGraficoDeIngresos: !!(graficoIngresos && divisor) && !!(graficoIngresos.compareDocumentPosition(divisor) & Node.DOCUMENT_POSITION_FOLLOWING),
      avisaAtrasadas: divisor ? divisor.querySelector('.kpi').textContent.includes('atrasado') : false,
      cantidadHits: divisor ? divisor.querySelectorAll('circle.grafica-hit[data-tt-tipo="poliza-cumplimiento"]').length : 0,
      otrosConCumplimiento
    };
  });
  chkF('El bloque de Servicios Técnicos trae "Cumplimiento de pólizas" (no una sección aparte)', bloqueCumplimiento.existe === true);
  chkF('Va DEBAJO del gráfico de Ingresos/Costos/Utilidad, dentro de la misma columna', bloqueCumplimiento.vaDespuesDelGraficoDeIngresos === true);
  chkF('Ningún otro pilar trae "Cumplimiento de pólizas" (es exclusivo de Servicios Técnicos)', bloqueCumplimiento.otrosConCumplimiento === 0);
  chkF('Avisa que hay pólizas con servicio atrasado (ninguna de las 2 tiene su enero marcado como hecho)', bloqueCumplimiento.avisaAtrasadas === true);
  chkF('El gráfico de dispersión trae un punto interactivo por cada póliza activa (2)', bloqueCumplimiento.cantidadHits === 2);

  await page.locator('circle.grafica-hit[data-tt-tipo="poliza-cumplimiento"][data-folio="POL-1"]').hover({ force: true });
  await page.waitForTimeout(80);
  const ttPoliza = await page.evaluate(() => document.getElementById('graficaTT').textContent);
  chkF('El tooltip del punto de POL-1 muestra su folio, 0% de cumplimiento y su ingreso anual ($12,000)',
    ttPoliza.includes('POL-1') && ttPoliza.includes('0%') && ttPoliza.includes('$12,000'));
  await page.mouse.move(5, 5);
  await page.waitForTimeout(80);

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
