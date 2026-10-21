/* Aumento de precio por inflación — fecha de vigencia programada (17-oct-2026,
   pedido de Victor sobre la función ya construida en test_ajuste_inflacion_
   polizas/forpass/cotizaciones/cotizacion_forpass.js): "que los aumentos
   consideren una fecha a partir de la cual tendrán impacto". Al preguntar el
   mecanismo exacto vía chat (no se pudo leer su respuesta de AskUserQuestion
   dos veces seguidas), contestó "ambas cosas": (1) aplicación VERDADERAMENTE
   programada —el precio no se mueve un centavo hasta la fecha— y (2)
   aplicación AUTOMÁTICA al llegar esa fecha, sin que nadie tenga que volver
   a confirmar nada.

   Cómo quedó construido (ver normalizarAjustePrecio/ajustePrecioVigente,
   justo antes de normalizarPoliza en index.html):
   - Cada entrada de ajuste ahora trae `fechaVigencia` (por default la misma
     `fecha` de captura, o sea "aplícalo ya" — el comportamiento de siempre).
   - Las 4 funciones `aplicarAjusteInflacionX` reciben un 5º/6º parámetro
     `fechaVigencia`: si `ajustePrecioVigente(entrada)` es falso (fecha
     futura), la entrada se guarda en el arreglo NUEVO `ajustesProgramados`
     de la póliza/sitio/cotización SIN tocar ningún precio; si es verdadero
     (hoy o ya pasó), se aplica de inmediato como antes, a `historialAjustes`.
   - `aplicarAjustesInflacionProgramadosVencidos()` es la pieza de "solo":
     revisa las 4 colecciones por cualquier `ajustesProgramados` cuya fecha ya
     llegó, lo aplica, y lo mueve a `historialAjustes` — se llama una vez por
     arranque desde `arrancarNube()`. Como esta app no tiene nada corriendo
     en el servidor (SPA de sincronización eventual con Firestore), "se
     aplica solo" en la práctica quiere decir "en cuanto CUALQUIER sesión
     Owner/Admin vuelve a abrir el tablero después de esa fecha" — de ahí el
     gateo a `esAdmin()`: la regla de Firestore de /polizas ya rechaza a
     un Analyst tocando `partidas` de una póliza activa, así que sin el
     gateo una sesión sin permiso real se llevaría un 403 silencioso al
     guardar el aumento ya vencido.

   Esta prueba NO repite la aritmética ni los escenarios ya cubiertos en los
   4 archivos de fase (eso sigue vivo y sigue pasando — un ajuste con fecha
   de vigencia de HOY, el default, se sigue aplicando exactamente igual que
   antes). Cubre solo lo nuevo: que programar no mueve el precio, que el
   ajuste programado queda guardado y visible, que una fecha ya vencida se
   aplica de inmediato (nunca se programa algo que ya debía haber pasado), y
   que `aplicarAjustesInflacionProgramadosVencidos()` aplica lo vencido y
   respeta el gateo a Admin/Owner — en las 4 secciones. */
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
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'BANORTE' })];
    datos.polizas = [
      normalizarPoliza({ id:'p1', clienteId:'c1', estatus:'activa', fechaInicio:'2026-01-01',
        partidas:[{ concepto:'Horno', cantidad:1, precioUnitario:1000, costoUnitario:600, frecuencia:1, mesesServicio:[0] }] })
    ];
    datos.sitios = [
      normalizarSitio({ id:'s1', clienteId:'c1', nombre:'Sucursal Centro', modulos:1, estado:'activo', mensualidad:500, forpassCosto:200, fechaInicio:'2026-01-01' })
    ];
    datos.cotizaciones = [
      normalizarCotizacion({ id:'q1', clienteId:'c1', folio:'COT-001', estatus:'borrador', margen:15,
        partidas:[{ concepto:'Refacción A', cantidad:1, precioCosto:1000 }] })
    ];
    datos.cotizacionesForpass = [
      normalizarCotizacionForpass({ id:'qf1', clienteId:'c1', folio:'CF-001', estatus:'borrador',
        sitios:[{ nombre:'Sitio único', precioBase:5000, adicional:0 }] })
    ];
  });

  // --------- 1) Modelo de datos: ajustesProgramados nace vacío en las 4 ---------
  const modelo = await page.evaluate(() => ({
    p: Array.isArray(polizaPorId('p1').ajustesProgramados) && polizaPorId('p1').ajustesProgramados.length === 0,
    s: Array.isArray(sitioPorId('s1').ajustesProgramados) && sitioPorId('s1').ajustesProgramados.length === 0,
    q: Array.isArray(cotizacionPorId('q1').ajustesProgramados) && cotizacionPorId('q1').ajustesProgramados.length === 0,
    qf: Array.isArray(cotizacionForpassPorId('qf1').ajustesProgramados) && cotizacionForpassPorId('qf1').ajustesProgramados.length === 0
  }));
  chkF('normalizarPoliza() nace con ajustesProgramados vacío', modelo.p);
  chkF('normalizarSitio() nace con ajustesProgramados vacío', modelo.s);
  chkF('normalizarCotizacion() nace con ajustesProgramados vacío', modelo.q);
  chkF('normalizarCotizacionForpass() nace con ajustesProgramados vacío', modelo.qf);

  // --------- 2) ajustePrecioVigente(): hoy y pasado SÍ, futuro NO ---------
  const vigencia = await page.evaluate(() => ({
    hoy: ajustePrecioVigente({ fechaVigencia: hoyISO() }),
    pasado: ajustePrecioVigente({ fechaVigencia: sumarDias(hoyISO(), -5) }),
    futuro: ajustePrecioVigente({ fechaVigencia: sumarDias(hoyISO(), 30) })
  }));
  chkF('ajustePrecioVigente(hoy) = true', vigencia.hoy === true);
  chkF('ajustePrecioVigente(hace 5 días) = true', vigencia.pasado === true);
  chkF('ajustePrecioVigente(en 30 días) = false', vigencia.futuro === false);

  // --------- 3) Pólizas: programar vía modal individual NO mueve el precio ---------
  await page.evaluate(() => { irAModulo('polizas'); estado.vista='poliza'; estado.polizaId='p1'; render(); });
  await page.waitForTimeout(200);
  await page.click('[data-accion="ajuste-inflacion-poliza"]');
  await page.waitForTimeout(150);
  const futuraISO = await page.evaluate(() => sumarDias(hoyISO(), 30));
  await page.fill('#apiPctPrecio', '10');
  await page.fill('#apiFechaVigencia', futuraISO);
  await page.waitForTimeout(100);
  chkF('La pista avisa que se programa (no se aplica de inmediato)', (await page.locator('#apiPistaVigencia').innerText()).includes('programa'));
  chkF('El botón cambia a "Programar"', (await page.locator('#apiBtnGuardar').innerText()).trim() === 'Programar');
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);
  chkF('Avisa que quedó programado (no "aplicado")', (await page.locator('#toast', { hasText: 'programado' }).count()) === 1);

  const tras1 = await page.evaluate(() => {
    const p = polizaPorId('p1');
    return { precio: p.partidas[0].precioUnitario, programados: p.ajustesProgramados.length, historial: p.historialAjustes.length,
             entrada: p.ajustesProgramados[0] };
  });
  chkF('El precio de Horno NO se movió (sigue en 1000)', tras1.precio === 1000);
  chkF('Queda UNA entrada en ajustesProgramados', tras1.programados === 1);
  chkF('historialAjustes sigue vacío (nada se aplicó todavía)', tras1.historial === 0);
  chkF('La entrada programada trae la fecha de vigencia futura y 10% de precio', tras1.entrada.fechaVigencia === futuraISO && tras1.entrada.pctPrecio === 10);

  // --------- 4) El gateo a Admin: un Analyst no puede disparar el vencido ---------
  await page.evaluate((iso) => {
    // Se simula manualmente que ya venció (en vez de esperar 30 días reales).
    polizaPorId('p1').ajustesProgramados[0].fechaVigencia = iso;
  }, await page.evaluate(() => sumarDias(hoyISO(), -1)));
  await page.evaluate(() => { sesion.rol = 'analyst'; aplicarAjustesInflacionProgramadosVencidos(); });
  await page.waitForTimeout(100);
  const conAnalyst = await page.evaluate(() => {
    const p = polizaPorId('p1');
    return { precio: p.partidas[0].precioUnitario, programados: p.ajustesProgramados.length };
  });
  chkF('Con sesión Analyst, el vencido NO se aplica (evita el 403 de Firestore)', conAnalyst.precio === 1000 && conAnalyst.programados === 1);

  // --------- 5) Con Owner, el mismo vencido SÍ se aplica solo ---------
  await page.evaluate(() => { sesion.rol = 'owner'; aplicarAjustesInflacionProgramadosVencidos(); });
  await page.waitForTimeout(100);
  const conOwner = await page.evaluate(() => {
    const p = polizaPorId('p1');
    return { precio: p.partidas[0].precioUnitario, programados: p.ajustesProgramados.length, historial: p.historialAjustes.length };
  });
  chkF('Con sesión Owner, el ajuste vencido se aplica solo: precio 1000 → 1100', conOwner.precio === 1100);
  chkF('Sale de ajustesProgramados', conOwner.programados === 0);
  chkF('Entra a historialAjustes', conOwner.historial === 1);

  // --------- 6) Pólizas, herramienta masiva: también programa sin tocar nada ---------
  await page.evaluate(() => { estado.vista='polizas'; render(); });
  await page.waitForTimeout(150);
  await page.click('[data-accion="ajuste-inflacion-masivo-polizas"]');
  await page.waitForTimeout(150);
  const futura2ISO = await page.evaluate(() => sumarDias(hoyISO(), 10));
  await page.fill('#amPctPrecio', '5');
  await page.fill('#amFechaVigencia', futura2ISO);
  await page.waitForTimeout(100);
  chkF('El botón masivo cambia a "Ver resumen y programar"', (await page.locator('#amBtnGuardar').innerText()).trim() === 'Ver resumen y programar');
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(150);
  chkF('El resumen de confirmación dice "Programar"', (await page.locator('#modalTitulo', { hasText: 'Programar aumento' }).count()) === 1);
  await page.click('button[data-modal="guardar"]');
  await page.waitForTimeout(200);
  const tras2 = await page.evaluate(() => {
    const p = polizaPorId('p1');
    return { precio: p.partidas[0].precioUnitario, programados: p.ajustesProgramados.length };
  });
  chkF('El masivo programado tampoco mueve el precio (sigue en 1100)', tras2.precio === 1100);
  chkF('Queda registrado en ajustesProgramados', tras2.programados === 1);

  // --------- 7) Forpass (sitio): programar vía modal individual ---------
  await page.evaluate(() => { irAModulo('forpass'); estado.vista='cliente'; estado.clienteId='c1'; render(); });
  await page.waitForTimeout(200);
  await page.click('[data-ajuste-inflacion-sitio="s1"]');
  await page.waitForTimeout(150);
  const futuraSitioISO = await page.evaluate(() => sumarDias(hoyISO(), 15));
  await page.fill('#afiPctPrecio', '20');
  await page.fill('#afiFechaVigencia', futuraSitioISO);
  await page.waitForTimeout(100);
  chkF('Forpass: botón cambia a "Programar"', (await page.locator('#afiBtnGuardar').innerText()).trim() === 'Programar');
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);
  const sitioTrasProgramar = await page.evaluate(() => {
    const s = sitioPorId('s1');
    return { mensualidad: s.mensualidad, programados: s.ajustesProgramados.length };
  });
  chkF('Forpass: la mensualidad no se movió (sigue en 500)', sitioTrasProgramar.mensualidad === 500);
  chkF('Forpass: queda una entrada programada', sitioTrasProgramar.programados === 1);

  // Se simula que venció y se corre el vencido:
  await page.evaluate(() => { sitioPorId('s1').ajustesProgramados[0].fechaVigencia = sumarDias(hoyISO(), -1); aplicarAjustesInflacionProgramadosVencidos(); });
  await page.waitForTimeout(100);
  const sitioTrasVencer = await page.evaluate(() => {
    const s = sitioPorId('s1');
    return { mensualidad: s.mensualidad, programados: s.ajustesProgramados.length, historial: s.historialAjustes.length };
  });
  chkF('Forpass: al vencer, la mensualidad sube sola 500 → 600', sitioTrasVencer.mensualidad === 600);
  chkF('Forpass: sale de ajustesProgramados y entra a historialAjustes', sitioTrasVencer.programados === 0 && sitioTrasVencer.historial === 1);

  // --------- 8) Cotizaciones: programar puntos de margen sin tocarlo todavía ---------
  await page.evaluate(() => { irAModulo('cotizaciones'); estado.vista='cotizacion'; estado.cotizacionId='q1'; render(); });
  await page.waitForTimeout(200);
  await page.click('[data-accion="ajuste-inflacion-cotizacion"]');
  await page.waitForTimeout(150);
  const futuraCotISO = await page.evaluate(() => sumarDias(hoyISO(), 7));
  await page.fill('#aciPuntosMargen', '5');
  await page.fill('#aciFechaVigencia', futuraCotISO);
  await page.waitForTimeout(100);
  chkF('Cotizaciones: botón cambia a "Programar"', (await page.locator('#aciBtnGuardar').innerText()).trim() === 'Programar');
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);
  const cotTrasProgramar = await page.evaluate(() => {
    const q = cotizacionPorId('q1');
    return { margen: q.margen, programados: q.ajustesProgramados.length };
  });
  chkF('Cotizaciones: el margen NO se movió (sigue en 15%)', cotTrasProgramar.margen === 15);
  chkF('Cotizaciones: queda una entrada programada', cotTrasProgramar.programados === 1);

  await page.evaluate(() => { cotizacionPorId('q1').ajustesProgramados[0].fechaVigencia = sumarDias(hoyISO(), -1); aplicarAjustesInflacionProgramadosVencidos(); });
  await page.waitForTimeout(100);
  const cotTrasVencer = await page.evaluate(() => {
    const q = cotizacionPorId('q1');
    return { margen: q.margen, programados: q.ajustesProgramados.length, historial: q.historialAjustes.length };
  });
  chkF('Cotizaciones: al vencer, el margen sube solo 15% → 20%', cotTrasVencer.margen === 20);
  chkF('Cotizaciones: sale de ajustesProgramados y entra a historialAjustes', cotTrasVencer.programados === 0 && cotTrasVencer.historial === 1);

  // --------- 9) Cotización Forpass: programar un % de precio ---------
  await page.evaluate(() => { estado.vista='cliente'; estado.clienteId='c1'; render(); });
  await page.waitForTimeout(150);
  await page.evaluate(() => { modalAjusteInflacionCotizacionForpass('qf1'); });
  await page.waitForTimeout(150);
  const futuraCfISO = await page.evaluate(() => sumarDias(hoyISO(), 3));
  await page.fill('#acfiPct', '8');
  await page.fill('#acfiFechaVigencia', futuraCfISO);
  await page.waitForTimeout(100);
  chkF('Cotización Forpass: botón cambia a "Programar"', (await page.locator('#acfiBtnGuardar').innerText()).trim() === 'Programar');
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);
  const cfTrasProgramar = await page.evaluate(() => {
    const q = cotizacionForpassPorId('qf1');
    return { precioBase: q.sitios[0].precioBase, programados: q.ajustesProgramados.length };
  });
  chkF('Cotización Forpass: el precio base NO se movió (sigue en 5000)', cfTrasProgramar.precioBase === 5000);
  chkF('Cotización Forpass: queda una entrada programada', cfTrasProgramar.programados === 1);

  await page.evaluate(() => { cotizacionForpassPorId('qf1').ajustesProgramados[0].fechaVigencia = sumarDias(hoyISO(), -1); aplicarAjustesInflacionProgramadosVencidos(); });
  await page.waitForTimeout(100);
  const cfTrasVencer = await page.evaluate(() => {
    const q = cotizacionForpassPorId('qf1');
    return { precioBase: q.sitios[0].precioBase, programados: q.ajustesProgramados.length, historial: q.historialAjustes.length };
  });
  chkF('Cotización Forpass: al vencer, el precio base sube solo 5000 → 5400', cfTrasVencer.precioBase === 5400);
  chkF('Cotización Forpass: sale de ajustesProgramados y entra a historialAjustes', cfTrasVencer.programados === 0 && cfTrasVencer.historial === 1);

  chkF('No hubo errores de página en todo el escenario', errores.length === 0);
  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
