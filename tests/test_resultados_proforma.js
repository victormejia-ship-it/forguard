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

  // --------- 12) "Nómina directa del pilar": se deriva del Organigrama + sueldo, no se vuelve a capturar ---------
  await page.evaluate(() => {
    datos.personal = [
      normalizarPersona({ id:'per1', nombre:'Ana', estatus:'activo', pilarId:'tecnicos' }),
      normalizarPersona({ id:'per2', nombre:'Beto', estatus:'activo', pilarId:'tecnicos' }),
      // De baja: NO debe contar aunque tenga sueldo capturado.
      normalizarPersona({ id:'per3', nombre:'Caro', estatus:'baja', pilarId:'tecnicos' }),
      normalizarPersona({ id:'per4', nombre:'Dani', estatus:'activo', pilarId:'operativos' }),
      // Sin pilar asignado: no debe contar en NINGÚN pilar.
      normalizarPersona({ id:'per5', nombre:'Eva', estatus:'activo', pilarId:'' }),
      // Activo en Proyectos pero sin sueldo capturado todavía: cuenta como $0, no truena.
      normalizarPersona({ id:'per6', nombre:'Fer', estatus:'activo', pilarId:'proyectos' })
    ];
    datos.nominaPersonal = [
      normalizarNominaPersona({ id:'per1', sueldoMensual:20000 }),
      normalizarNominaPersona({ id:'per2', sueldoMensual:15000 }),
      normalizarNominaPersona({ id:'per3', sueldoMensual:99999 }),
      normalizarNominaPersona({ id:'per4', sueldoMensual:12000 }),
      normalizarNominaPersona({ id:'per5', sueldoMensual:50000 })
    ];
    render();
  });
  await page.waitForTimeout(100);

  const nominaOwner = await page.evaluate(() => {
    const anio = hoyISO().slice(0,4);
    return {
      tecnicos: PILARES_PROFORMA.find(p => p.id === 'tecnicos').costos.find(c => c.id === 'nomina-directa').montosPorMes(anio),
      operativos: PILARES_PROFORMA.find(p => p.id === 'operativos').costos.find(c => c.id === 'nomina-directa').montosPorMes(anio),
      proyectos: PILARES_PROFORMA.find(p => p.id === 'proyectos').costos.find(c => c.id === 'nomina-directa').montosPorMes(anio)
    };
  });
  chkF('Servicios Técnicos: suma $20,000 + $15,000 (Ana + Beto) — Caro (de baja) no se cuela, parejo los 12 meses',
    nominaOwner.tecnicos.every(m => m === 35000));
  chkF('Servicios Operativos: solo Dani ($12,000) — Eva (sin pilar) no se cuela',
    nominaOwner.operativos.every(m => m === 12000));
  chkF('Proyectos: Fer está activo ahí pero sin sueldo capturado — $0, no truena', nominaOwner.proyectos.every(m => m === 0));

  const filaNominaTecnicos = await page.evaluate(() => {
    const tecnicos = Array.from(document.querySelectorAll('#vista .bloque-pilar')).find(b => b.querySelector('h3').textContent === 'Servicios Técnicos');
    const fila = Array.from(tecnicos.querySelectorAll('table.tabla-proforma tbody tr')).find(tr => tr.textContent.includes('Nómina directa del pilar'));
    return fila.textContent;
  });
  chkF('"Nómina directa del pilar" de Servicios Técnicos ya se ve en su tabla ($35,000 en cada mes visible)', filaNominaTecnicos.includes('$35,000'));

  // Dato sensible: confirmado con Victor que SOLO Owner/Admin lo ven — para
  // cualquier otro rol el mismo renglón, con los MISMOS datos cargados,
  // debe seguir en $0 (no un error, no un hueco: sigue viéndose "sin
  // conectar", como cualquier renglón sin fuente decidida).
  const nominaAnalyst = await page.evaluate(() => {
    sesion.rol = 'analyst';
    const anio = hoyISO().slice(0,4);
    const valores = {
      tecnicos: PILARES_PROFORMA.find(p => p.id === 'tecnicos').costos.find(c => c.id === 'nomina-directa').montosPorMes(anio),
      operativos: PILARES_PROFORMA.find(p => p.id === 'operativos').costos.find(c => c.id === 'nomina-directa').montosPorMes(anio)
    };
    sesion.rol = 'owner';
    return valores;
  });
  chkF('Analyst (no Owner/Admin): "Nómina directa del pilar" regresa a $0 aunque el dato exista (sueldo es sensible)',
    nominaAnalyst.tecnicos.every(m => m === 0) && nominaAnalyst.operativos.every(m => m === 0));

  // --------- 13) "Proveedores / servicios subcontratados": gastos de proveedor con Pilar asignado ---------
  await page.evaluate((anio) => {
    datos.gastosProveedor = [
      // 'por-pagar': ya es un compromiso real, cuenta aunque no se haya pagado.
      normalizarGastoProveedor({ id:'g1', proveedorId:'pr1', proveedorNombre:'Refrigeración del Norte', concepto:'Servicio', monto:5000, fecha: anio+'-04-10', estatus:'por-pagar', pilarId:'tecnicos' }),
      // 'pagado': también cuenta, mismo mes.
      normalizarGastoProveedor({ id:'g2', proveedorId:'pr1', proveedorNombre:'Refrigeración del Norte', concepto:'Servicio', monto:3000, fecha: anio+'-04-15', estatus:'pagado', pilarId:'tecnicos' }),
      // 'cotizacion' (ni siquiera aceptada): NO cuenta, aunque el monto sea enorme.
      normalizarGastoProveedor({ id:'g3', proveedorId:'pr1', proveedorNombre:'Refrigeración del Norte', concepto:'Cotización sin aceptar', monto:99999, fecha: anio+'-04-01', estatus:'cotizacion', pilarId:'tecnicos' }),
      // 'cancelado': NO cuenta.
      normalizarGastoProveedor({ id:'g4', proveedorId:'pr1', proveedorNombre:'Refrigeración del Norte', concepto:'Cancelado', monto:99999, fecha: anio+'-04-01', estatus:'cancelado', pilarId:'tecnicos' }),
      // Otro pilar: NO debe colarse en Servicios Técnicos.
      normalizarGastoProveedor({ id:'g5', proveedorId:'pr2', proveedorNombre:'Limpieza Total', concepto:'Servicio', monto:7000, fecha: anio+'-04-01', estatus:'pagado', pilarId:'operativos' }),
      // Sin pilar asignado: NO cuenta en ninguno.
      normalizarGastoProveedor({ id:'g6', proveedorId:'pr1', proveedorNombre:'Refrigeración del Norte', concepto:'Sin pilar', monto:99999, fecha: anio+'-04-01', estatus:'pagado', pilarId:'' }),
      // Otro año: NO se cuela en el año actual.
      normalizarGastoProveedor({ id:'g7', proveedorId:'pr1', proveedorNombre:'Refrigeración del Norte', concepto:'De otro año', monto:99999, fecha: (Number(anio)-1)+'-04-01', estatus:'pagado', pilarId:'tecnicos' })
    ];
    // Órdenes de Compra (17-sep-2026 en adelante, el camino real de captura
    // hoy): confirmada/enviada/recibida cuentan completas en Servicios
    // Técnicos (confirmado con Victor: no tienen campo Pilar propio).
    datos.ordenesCompra = [
      normalizarOrdenCompra({ id:'oc1', folio:'OC-1', proveedorId:'pr1', proveedorNombre:'Refrigeración del Norte',
        fecha: anio+'-05-01', estatus:'confirmada', renglones:[{ concepto:'Refacción X', cantidad:2, precioUnitario:1000 }] }),
      normalizarOrdenCompra({ id:'oc2', folio:'OC-2', proveedorId:'pr1', proveedorNombre:'Refrigeración del Norte',
        fecha: anio+'-05-10', estatus:'recibida', renglones:[{ concepto:'Servicio Y', cantidad:1, precioUnitario:1500 }] }),
      // 'borrador' (ni siquiera enviada): NO cuenta.
      normalizarOrdenCompra({ id:'oc3', folio:'OC-3', proveedorId:'pr1', proveedorNombre:'Refrigeración del Norte',
        fecha: anio+'-05-01', estatus:'borrador', renglones:[{ concepto:'Borrador', cantidad:1, precioUnitario:99999 }] }),
      // 'cancelada': NO cuenta.
      normalizarOrdenCompra({ id:'oc4', folio:'OC-4', proveedorId:'pr1', proveedorNombre:'Refrigeración del Norte',
        fecha: anio+'-05-01', estatus:'cancelada', renglones:[{ concepto:'Cancelada', cantidad:1, precioUnitario:99999 }] }),
      // Otro año: NO se cuela.
      normalizarOrdenCompra({ id:'oc5', folio:'OC-5', proveedorId:'pr1', proveedorNombre:'Refrigeración del Norte',
        fecha: (Number(anio)-1)+'-05-01', estatus:'confirmada', renglones:[{ concepto:'De otro año', cantidad:1, precioUnitario:99999 }] })
    ];
    render();
  }, anioActual);
  await page.waitForTimeout(100);

  const proveedoresTecnicos = await page.evaluate(() => {
    const anio = hoyISO().slice(0,4);
    return PILARES_PROFORMA.find(p => p.id === 'tecnicos').costos.find(c => c.id === 'proveedores-subcontratados').montosPorMes(anio);
  });
  chkF('"Proveedores / servicios subcontratados": abril suma "por-pagar" + "pagado" ($5,000 + $3,000 = $8,000)', proveedoresTecnicos[3] === 8000);
  chkF('Mayo suma las 2 OC reales sin IVA (confirmada $2,000 + recibida $1,500 = $3,500) — borrador/cancelada/otro año no se cuelan',
    proveedoresTecnicos[4] === 3500);
  chkF('El resto de los meses siguen en $0', proveedoresTecnicos.filter((_,i) => ![3,4].includes(i)).every(m => m === 0));

  const filaProveedores = await page.evaluate(() => {
    document.querySelector('[data-accion="vista-lista"][data-campo="resultadosMeses"][data-modo="todos"]').click();
  });
  await page.waitForTimeout(100);
  const filaProveedoresTexto = await page.evaluate(() => {
    const tecnicos = Array.from(document.querySelectorAll('#vista .bloque-pilar')).find(b => b.querySelector('h3').textContent === 'Servicios Técnicos');
    const fila = Array.from(tecnicos.querySelectorAll('table.tabla-proforma tbody tr')).find(tr => tr.textContent.includes('Proveedores / servicios subcontratados'));
    return fila.textContent;
  });
  chkF('"Proveedores / servicios subcontratados" ya se ve en la tabla ($8,000 de gastos + $3,500 de Órdenes de Compra)',
    filaProveedoresTexto.includes('$8,000') && filaProveedoresTexto.includes('$3,500'));
  await page.evaluate(() => { document.querySelector('[data-accion="vista-lista"][data-campo="resultadosMeses"][data-modo="compacto"]').click(); });
  await page.waitForTimeout(100);

  // --------- 14) Dashboard interactivo: clic para consultar el detalle (pedido de Victor, 25-sep-2026) ---------
  const detalleDirecto = await page.evaluate(() => {
    const anio = hoyISO().slice(0,4);
    const tecnicos = PILARES_PROFORMA.find(p => p.id === 'tecnicos');
    const polizasCliente = tecnicos.ingresos.find(c => c.id === 'polizas-cliente');
    const correctivo = tecnicos.ingresos.find(c => c.id === 'correctivo-preventivo');
    const nomina = tecnicos.costos.find(c => c.id === 'nomina-directa');
    const proveedores = tecnicos.costos.find(c => c.id === 'proveedores-subcontratados');
    const limpieza = PILARES_PROFORMA.find(p => p.id === 'operativos').ingresos.find(c => c.id === 'limpieza');

    const anioAnterior = sesion.rol;
    const nominaAnalyst = (()=>{ sesion.rol = 'analyst'; const r = nomina.detalle(anio, null); sesion.rol = anioAnterior; return r; })();

    return {
      polizasClienteAnio: polizasCliente.detalle(anio, null),
      polizasClienteFeb: polizasCliente.detalle(anio, 1),
      correctivoAnio: correctivo.detalle(anio, null).map(it => ({ etiqueta: it.etiqueta, monto: Math.round(it.monto) })),
      nominaOwner: nomina.detalle(anio, null),
      nominaAnalyst,
      proveedoresAbril: proveedores.detalle(anio, 3),
      proveedoresMayo: proveedores.detalle(anio, 4),
      limpiezaTieneDetalle: typeof limpieza.detalle === 'function'
    };
  });

  chkF('Detalle de "Pólizas de mantenimiento" (año): 1 registro, POL-1, con el total anual ($12,000)',
    detalleDirecto.polizasClienteAnio.length === 1
    && detalleDirecto.polizasClienteAnio[0].etiqueta.includes('POL-1')
    && detalleDirecto.polizasClienteAnio[0].monto === 12000
    && detalleDirecto.polizasClienteAnio[0].accion === 'ir-poliza');
  chkF('Detalle de "Pólizas de mantenimiento" (solo Febrero): el mismo registro, pero con el monto de ESE mes ($1,000)',
    detalleDirecto.polizasClienteFeb.length === 1 && detalleDirecto.polizasClienteFeb[0].monto === 1000);
  chkF('Detalle de "Trabajos correctivos / preventivo" (año): las 3 cotizaciones reales, ninguna otra',
    detalleDirecto.correctivoAnio.length === 3
    && detalleDirecto.correctivoAnio.some(it => it.etiqueta.includes('COT-1') && it.monto === 1150)
    && detalleDirecto.correctivoAnio.some(it => it.etiqueta.includes('COT-2') && it.monto === 690)
    && detalleDirecto.correctivoAnio.some(it => it.etiqueta.includes('COT-4') && it.monto === 230));
  chkF('Detalle de "Nómina directa del pilar" (Owner): Ana y Beto con su sueldo ANUAL (×12), con enlace a Organigrama',
    detalleDirecto.nominaOwner.length === 2
    && detalleDirecto.nominaOwner.every(it => it.accion === 'ir-persona')
    && detalleDirecto.nominaOwner.some(it => it.etiqueta.includes('Ana') && it.monto === 240000)
    && detalleDirecto.nominaOwner.some(it => it.etiqueta.includes('Beto') && it.monto === 180000));
  chkF('Detalle de "Nómina directa del pilar" (Analyst): vacío — mismo candado que puedeVerNomina()', detalleDirecto.nominaAnalyst.length === 0);
  chkF('Detalle de "Proveedores / servicios subcontratados" (Abril): los 2 gastos reales, con enlace a su ficha',
    detalleDirecto.proveedoresAbril.length === 2 && detalleDirecto.proveedoresAbril.every(it => it.accion === 'ir-gasto-proveedor'));
  chkF('Detalle de "Proveedores / servicios subcontratados" (Mayo): las 2 Órdenes de Compra reales, con enlace a su ficha',
    detalleDirecto.proveedoresMayo.length === 2 && detalleDirecto.proveedoresMayo.every(it => it.accion === 'ir-orden-compra'));
  chkF('Un renglón sin conectar todavía (Limpieza) no trae función de detalle', detalleDirecto.limpiezaTieneDetalle === false);

  // De verdad en el DOM: solo lo conectado es clicable, y el clic real abre el modal y navega.
  const clicabilidad = await page.evaluate(() => {
    const filaLimpieza = Array.from(document.querySelectorAll('#vista table.tabla-proforma tbody tr')).find(tr => tr.textContent.includes('Limpieza'));
    const filaPolizas = Array.from(document.querySelectorAll('#vista table.tabla-proforma tbody tr')).find(tr => tr.textContent.includes('Pólizas de mantenimiento') && !tr.textContent.includes('incluidas'));
    return {
      limpiezaClicable: filaLimpieza.querySelector('td.clic-detalle') !== null,
      polizasClicable: filaPolizas.querySelector('td.clic-detalle') !== null
    };
  });
  chkF('"Limpieza" (sin conectar) NO tiene celdas clicables', clicabilidad.limpiezaClicable === false);
  chkF('"Pólizas de mantenimiento" (conectado) SÍ tiene celdas clicables', clicabilidad.polizasClicable === true);

  await page.locator('td.clic-detalle', { hasText: 'Pólizas de mantenimiento' }).first().click();
  await page.waitForTimeout(150);
  const modalAbierto = await page.evaluate(() => ({
    abierto: document.getElementById('telon').classList.contains('abierto'),
    titulo: document.getElementById('modalTitulo').textContent,
    trePOL1: document.getElementById('modalCuerpo').textContent.includes('POL-1'),
    treTotal: document.getElementById('modalCuerpo').textContent.includes('$12,000')
  }));
  chkF('El modal de detalle abre con el título del renglón y el año', modalAbierto.abierto && modalAbierto.titulo.includes('Pólizas de mantenimiento'));
  chkF('El modal de detalle muestra el registro real (POL-1) y su total', modalAbierto.trePOL1 && modalAbierto.treTotal);

  await page.locator('.dp-fila.dp-clic', { hasText: 'POL-1' }).click();
  await page.waitForTimeout(200);
  const trasNavegar = await page.evaluate(() => ({ modulo: estado.modulo, polizaId: estado.polizaId, modalCerrado: !document.getElementById('telon').classList.contains('abierto') }));
  chkF('Clic en el registro del modal cierra el modal y navega a esa póliza en su propio módulo',
    trasNavegar.modulo === 'polizas' && trasNavegar.polizaId === 'p1' && trasNavegar.modalCerrado === true);

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
