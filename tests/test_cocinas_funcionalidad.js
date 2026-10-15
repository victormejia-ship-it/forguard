/* Rehacer el módulo "Cocinas" (14-oct-2026, pedido de Victor, con captura de
   pantalla del módulo viejo): "vamos a rehacer el modulo de cocinas necesito
   que podamos realizar un seguimiento de funcionalidad a las cocinas, donde
   tomes los equipos de las polizas y podamos definir si estan funcionando o
   no, mismo que aplicará el valor dependiendo de la criticidad y la
   funcionalidad ... en esencia se busca obtener el % de funcionalidad de
   cocina".

   Antes de construir se usó AskUserQuestion sobre tres puntos:
   (1) Granularidad: ¿por unidad física o por partida completa cuando
       cantidad>1? Victor no contestó esta directamente — redirigió la
       pregunta (ver (2)) — así que se siguió la recomendación original: por
       UNIDAD, con un arreglo paralelo a `series[]` (si una partida tiene 3
       refrigeradores, 1 descompuesto no es lo mismo que los 3).
   (2) ¿Debe ser un módulo aparte de "Actividad de reportes"? Victor pidió
       explícitamente analizar que fuera "funcional con los datos de los
       reportes emitidos y las pólizas" — se decidió NO partirlo: Cocinas
       sigue siendo UN solo módulo con dos secciones que se alimentan entre
       sí (ver vistaCocinas(): bloqueFuncionamientoCocinas() + la actividad
       de reportes que ya existía, ahora bloqueActividadReportesCocinas(),
       sin tocar su cálculo interno).
   (3) ¿Estado actual en vivo o por período histórico? Victor eligió "Estado
       actual (recomendado)" — es un tablero EN VIVO, no un corte de fechas.
   (4) ¿Marcar "no funciona" debe ofrecer levantar un reporte? Victor eligió
       "Sí, ofrecer levantar reporte (recomendado)".

   Modelo de datos: `funcionamiento[]` vive en cada partida de póliza
   (normalizarPartida), parecido a `series[]` — denso, del mismo largo que
   `cantidad`. Cada unidad es `{estado, motivo, revisadoEn, revisadoPor,
   reporteId}` (normalizarEstadoFuncionamiento) con `estado` en
   `true`/`'parcial'`/`false`/`null`. `null` ("sin verificar") es DISTINTO de
   "funciona": se excluye del % hasta que alguien la revise — si contara como
   sana, una cocina recién activada (o con pólizas nuevas) se vería 100% sin
   que nadie la haya tocado.

   `'parcial'` (15-oct-2026, pedido de Victor viendo el checklist ya en
   producción: "añade que pueda ser parcialmente funcionando y en dado caso
   de que este parcialmente se pueda indicar el motivo por el cual no esta
   funcionando o parcialmente funcionado") es un cuarto estado entre
   "Funciona" y "No funciona" — para el % pondera a la MITAD
   (scoreFuncionamiento), ni sano ni caído del todo. `motivo` es texto libre
   (sin catálogo cerrado: cada falla es distinta) que solo aplica mientras la
   unidad esté en `false` o `'parcial'` — volver a "Funciona" o "Sin
   verificar" lo descarta solo, para no arrastrar una explicación que ya no
   es cierta. El botón "Levantar reporte" (y su reporte precargado) ahora
   aplica también a "Parcial", no solo a "No funciona" — funcionar a medias
   sigue siendo una falla que atender — y el motivo ya escrito se precarga
   como descripción del reporte nuevo.

   El % de funcionalidad pondera por la criticidad del equipo en catálogo
   (`ponderacion`, 1-5, mismo campo que ya usa el % de funcionamiento de un
   Levantamiento): % = Σ(peso × score de cada unidad verificada) ÷ Σ(peso de
   TODAS las unidades verificadas) × 100, con score 1/0.5/0 para
   funciona/parcial/no funciona. Las líneas "segurista" (pólizas de seguro) y
   las pólizas no activas quedan fuera del cálculo.

   El estado de cada unidad (incluyendo motivo) se resetea a "sin verificar"
   en la copia de portal del cliente (datosClientePoliza) — mismo criterio
   que modelo/serie/código: es control interno, no pensado (todavía) para el
   portal.

   Esta prueba cubre: normalización de los cuatro campos nuevos (incluyendo
   que el motivo se descarte solo al volver a "Funciona"); el cálculo
   ponderado end-to-end tanto para "no funciona" (con un caso donde el
   promedio simple daría un número distinto al ponderado, para probar que SÍ
   pesa por criticidad) como para "parcial" (score 0.5); que el equipo
   "segurista" y las pólizas inactivas no cuenten; la redacción en
   datosClientePoliza; el tablero "Estado de funcionalidad" en la UI real; el
   modal "Revisar equipos" (modalFuncionamientoSitio) con sus CUATRO botones
   y la casilla de motivo; y el flujo completo de "No funciona"/"Parcial" →
   "Levantar reporte" (con el motivo precargado como descripción) → el
   reporte nuevo nace precargado → al guardarlo, su folio se liga de vuelta a
   la unidad (para no volver a ofrecer "Levantar reporte" mientras siga
   abierto). */
const { chromium } = require('playwright');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
const chk = (label, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' - ' + label); return cond; };
let fallas = 0;
const chkF = (label, cond) => { if(!chk(label, cond)) fallas++; };

(async () => {
  const browser = await chromium.launch(OPCIONES_NAVEGADOR);
  const page = await browser.newPage({ viewport: { width: 1300, height: 1600 } });
  const errores = [];
  page.on('pageerror', e => errores.push('PAGEERROR: ' + e.message));
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

  // --------- 1) normalizarEstadoFuncionamiento / normalizarPartida ---------
  const base = await page.evaluate(() => {
    const f1 = normalizarEstadoFuncionamiento(null);
    const f2 = normalizarEstadoFuncionamiento({ estado:true, revisadoEn:'2026-10-14', revisadoPor:'Juan', reporteId:'r1' });
    const f3 = normalizarEstadoFuncionamiento({ estado:'basura' });
    return { f1, f2, f3 };
  });
  chkF('Sin datos, el estado nace null (sin verificar) — no "funciona" ni "no funciona"', base.f1.estado === null);
  chkF('true/false/campos válidos se conservan', base.f2.estado === true && base.f2.revisadoPor === 'Juan' && base.f2.reporteId === 'r1');
  chkF('Un valor basura para estado se normaliza a null, no a false', base.f3.estado === null);

  const partida = await page.evaluate(() => normalizarPartida({ concepto:'Refrigerador', cantidad:3 }));
  chkF('funcionamiento[] nace del mismo largo que cantidad (por UNIDAD, no por partida)', partida.funcionamiento.length === 3);
  chkF('cada unidad nace sin verificar', partida.funcionamiento.every(f => f.estado === null));

  // --------- 2) aparicionesFuncionamiento / calcularFuncionamientoCocinas: pondera por catálogo ---------
  await page.evaluate(() => {
    datos.clientes = []; datos.sitios = []; datos.polizas = []; datos.catalogo = []; datos.reportes = [];
    datos.clientes.push(normalizarCliente({ id:'cF', nombre:'Cliente Func' }));
    datos.sitios.push(normalizarSitio({ id:'sF', clienteId:'cF', nombre:'Sitio Func', zona:'CDMX' }));
    datos.catalogo.push(normalizarEquipo({ id:'eqCritico', concepto:'Refrigerador', categoria:'frio', ponderacion:5 }));
    datos.catalogo.push(normalizarEquipo({ id:'eqBajo', concepto:'Extractor', categoria:'extraccion', ponderacion:1 }));
    const p = normalizarPoliza({ id:'pF', clienteId:'cF', sitioId:'sF', sitioNombre:'Sitio Func', estatus:'activa', fechaInicio: hoyISO(), partidas: [] });
    p.partidas = [
      normalizarPartida({ concepto:'Refrigerador', catalogoId:'eqCritico', cantidad:1, frecuencia:3, mesesServicio: mesesRegulares(0,3) }),
      normalizarPartida({ concepto:'Extractor', catalogoId:'eqBajo', cantidad:1, frecuencia:3, mesesServicio: mesesRegulares(0,3) }),
      normalizarPartida({ concepto:'Segurista mensual', frecuencia:1, mesesServicio: mesesRegulares(0,1), cantidad:1 })
    ];
    datos.polizas.push(p);
  });

  const total0 = await page.evaluate(() => calcularFuncionamientoCocinas().total);
  chkF('Sin nada verificado, pct es null (no 0, no 100)', total0.pct === null);
  chkF('El segurista no cuenta como equipo real (total = 2, no 3)', total0.total === 2);
  chkF('Las 2 unidades reales arrancan sin verificar', total0.sinVerificar === 2);

  // Marca el refrigerador (peso 5) como roto y el extractor (peso 1) como funcionando:
  // un promedio simple daría 50% (1 de 2 funciona) — ponderado da 1*1/(5+1)*100 = 16.67 -> 17%
  await page.evaluate(() => {
    const p = polizaPorId('pF');
    p.partidas[0].funcionamiento[0] = normalizarEstadoFuncionamiento({ estado:false });
    p.partidas[1].funcionamiento[0] = normalizarEstadoFuncionamiento({ estado:true });
  });
  const total1 = await page.evaluate(() => calcularFuncionamientoCocinas().total);
  chkF('El % pondera por criticidad del catálogo, NO es un promedio simple (da 17%, no 50%)', total1.pct === 17);
  chkF('1 equipo caído', total1.caidas === 1);
  chkF('0 sin verificar ya (ambos revisados)', total1.sinVerificar === 0);

  // --------- 3) datosClientePoliza redacta funcionamiento (igual que modelo/serie/código) ---------
  const redactado = await page.evaluate(() => {
    const p = polizaPorId('pF');
    p.cargoA = 'cliente';
    const copia = datosClientePoliza(p);
    return copia.partidas[0].funcionamiento[0];
  });
  chkF('El estado de funcionamiento se resetea en la copia de portal del cliente', redactado.estado === null && !redactado.reporteId);

  // --------- 4) UI real: tablero "Estado de funcionalidad" ---------
  await page.evaluate(() => { estado.modulo = 'cocinas'; estado.vistaFuncionamiento = 'sitio'; render(); });
  await page.waitForTimeout(200);
  const textoTablero = await page.evaluate(() => document.querySelector('.bloque').innerText.toLowerCase());
  chkF('El tablero muestra el % de funcionalidad calculado', textoTablero.includes('17%'));
  chkF('Muestra el KPI "Equipos caídos"', textoTablero.includes('equipos caídos'));
  chkF('La tabla "Por sitio" trae el botón "Revisar equipos"', (await page.locator('[data-revisar-funcionamiento="sF"]').count()) === 1);

  // --------- 5) modalFuncionamientoSitio: checklist por unidad ---------
  await page.click('[data-revisar-funcionamiento="sF"]');
  await page.waitForTimeout(200);
  chkF('El modal "Revisar equipos" abre con las 2 unidades (4 botones Funciona/Parcial/No funciona/Sin verificar cada una)',
    (await page.locator('[data-func-estado]').count()) === 8);
  chkF('Aparece "Levantar reporte" para la unidad caída que todavía no tiene reporte ligado',
    (await page.locator('[data-levantar-reporte-func]').count()) === 1);

  // --------- 6) "No funciona" → "Levantar reporte" → reporte precargado → se liga de vuelta ---------
  await page.click('[data-levantar-reporte-func]');
  await page.waitForTimeout(200);
  chkF('Clic en "Levantar reporte" navega al formulario de Nuevo reporte (mismo modal, sin perder el flujo)',
    (await page.locator('#rTitulo').count()) === 1);
  const prellenado = await page.evaluate(() => ({
    cliente: $('rCliente').value, sitio: $('rSitio').value, titulo: $('rTitulo').value
  }));
  chkF('El reporte nace precargado con cliente/sitio/título del equipo caído',
    prellenado.cliente === 'cF' && prellenado.sitio === 'sF' && /Refrigerador/.test(prellenado.titulo));

  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(300);
  const reporteLigado = await page.evaluate(() => {
    const p = polizaPorId('pF');
    return { reporteId: p.partidas[0].funcionamiento[0].reporteId, totalReportes: datos.reportes.length };
  });
  chkF('Se creó el reporte y su folio se ligó de vuelta a la unidad (funcionamiento[i].reporteId)',
    !!reporteLigado.reporteId && reporteLigado.totalReportes === 1);

  // Reabrir el checklist: con el reporte recién creado todavía abierto, ya no debe reofrecer "Levantar reporte"
  await page.evaluate(() => { estado.modulo = 'cocinas'; estado.vistaFuncionamiento = 'sitio'; render(); });
  await page.waitForTimeout(150);
  await page.click('[data-revisar-funcionamiento="sF"]');
  await page.waitForTimeout(200);
  chkF('Con un reporte abierto ya ligado, ofrece "Ver reporte" en vez de "Levantar reporte" otra vez (no duplica la oferta)',
    (await page.locator('[data-ver-reporte-func]').count()) === 1 && (await page.locator('[data-levantar-reporte-func]').count()) === 0);

  // --------- 7) Volver a "Sin verificar" saca la unidad del cálculo ---------
  await page.click('[data-func-estado="null"][data-func-unidad="0"]');
  await page.waitForTimeout(200);
  const totalTrasQuitar = await page.evaluate(() => calcularFuncionamientoCocinas().total);
  chkF('Al quitar la verificación del refrigerador, el % sale solo del extractor que sigue verificado (100%)',
    totalTrasQuitar.pct === 100);

  // --------- 8) Estado "Parcial" + motivo (15-oct-2026) ---------
  await page.evaluate(() => cerrarModal());
  const normParcial = await page.evaluate(() => {
    const parcial = normalizarEstadoFuncionamiento({ estado:'parcial', motivo:'Enfría poco' });
    const vueltaBien = normalizarEstadoFuncionamiento({ estado:true, motivo:'Ya no debería quedar' });
    return { parcial, vueltaBien };
  });
  chkF('"parcial" se normaliza y conserva su motivo', normParcial.parcial.estado === 'parcial' && normParcial.parcial.motivo === 'Enfría poco');
  chkF('Volver a "Funciona" descarta el motivo viejo (ya no aplica)', normParcial.vueltaBien.estado === true && normParcial.vueltaBien.motivo === '');

  await page.evaluate(() => {
    datos.clientes.push(normalizarCliente({ id:'cG', nombre:'Cliente Parcial' }));
    datos.sitios.push(normalizarSitio({ id:'sG', clienteId:'cG', nombre:'Sitio Parcial', zona:'CDMX' }));
    datos.catalogo.push(normalizarEquipo({ id:'eqG', concepto:'Marmita', categoria:'caliente', ponderacion:4 }));
    const p = normalizarPoliza({ id:'pG', clienteId:'cG', sitioId:'sG', sitioNombre:'Sitio Parcial', estatus:'activa', fechaInicio: hoyISO(), partidas: [] });
    p.partidas = [ normalizarPartida({ concepto:'Marmita', catalogoId:'eqG', cantidad:1, frecuencia:3, mesesServicio: mesesRegulares(0,3) }) ];
    p.partidas[0].funcionamiento[0] = normalizarEstadoFuncionamiento({ estado:'parcial', motivo:'Enfría poco' });
    datos.polizas.push(p);
  });
  const totalParcial = await page.evaluate(() => calcularFuncionamientoCocinas().porSitio.find(s => s.id === 'sG'));
  chkF('"Parcial" pondera exactamente a la mitad (un solo equipo parcial = 50%, no 0% ni 100%)', totalParcial.pct === 50);
  chkF('Cuenta en "parciales", no en "caidas"', totalParcial.parciales === 1 && totalParcial.caidas === 0);

  await page.evaluate(() => { estado.modulo = 'cocinas'; estado.vistaFuncionamiento = 'sitio'; render(); });
  await page.waitForTimeout(150);
  await page.click('[data-revisar-funcionamiento="sG"]');
  await page.waitForTimeout(200);
  chkF('El botón "Parcial" aparece presionado para esta unidad', (await page.locator('[data-func-estado="parcial"]').getAttribute('aria-pressed')) === 'true');
  chkF('La casilla de motivo aparece visible y ya precargada', (await page.inputValue('.input-motivo-func')) === 'Enfría poco');
  chkF('"Levantar reporte" también se ofrece para "Parcial" (no solo "No funciona")', (await page.locator('[data-levantar-reporte-func]').count()) === 1);

  await page.fill('.input-motivo-func', 'Enfría poco, compresor hace ruido');
  await page.locator('.input-motivo-func').blur();
  await page.waitForTimeout(200);
  chkF('Editar el motivo lo guarda en la unidad real',
    (await page.evaluate(() => polizaPorId('pG').partidas[0].funcionamiento[0].motivo)) === 'Enfría poco, compresor hace ruido');

  await page.click('[data-levantar-reporte-func]');
  await page.waitForTimeout(200);
  const prellenadoParcial = await page.evaluate(() => ({ titulo: $('rTitulo').value, descripcion: $('rDescripcion').value }));
  chkF('El título del reporte dice "funciona parcialmente" (no "no funciona")', /funciona parcialmente/.test(prellenadoParcial.titulo));
  chkF('La descripción nace precargada con el motivo ya anotado', prellenadoParcial.descripcion === 'Enfría poco, compresor hace ruido');
  await page.evaluate(() => cerrarModal());

  chkF('No hubo errores de página en todo el escenario', errores.length === 0);
  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
