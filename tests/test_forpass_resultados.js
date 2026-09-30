/* Forpass como línea de negocio propia, conectada a "Tecnología y Control"
   en Resultados (29-sep-2026-30-sep-2026, pedido de Victor tras seguir con
   ese pilar): "cada sitio pudiera tener un Forpass pero inicialmente
   ninguno lo tiene, esto es un servicio adicional... el módulo debe de
   contar con un costo de kiosco forpass, un precio de venta... venta,
   renta, licencia, hardware, software... facturables por mes o con una
   orden de compra global anual semestral" — y, tras la propuesta inicial:
   "sigas el mismo modelo o la misma estructura que actualmente tiene, solo
   que el Forpass no sea quien rija toda la página sino esté anclado a un
   cliente a un sitio... concuerdo con tus cinco puntos, solo añádelo y
   mejóralo".

   Se agregaron 3 campos a la MISMA ficha de sitio de siempre (nunca una
   colección aparte): forpassTipoCargo (renta/licencia/venta),
   forpassFacturacion (mensual/semestral/anual, mismo mecanismo que
   `facturacion` en Pólizas, generalizado con semestral) y forpassCosto
   (nuestro costo, capex reconocido una sola vez). Con default
   renta/mensual/0, un sitio capturado ANTES de este cambio se comporta
   exactamente igual que antes (misma prueba de compatibilidad abajo).

   Esta prueba cubre: 1) los defaults no rompen sitios viejos, 2) el
   reparto de `calcular()` con las 3 periodicidades, 3) los 3 renglones de
   Resultados (dos ingresos + un costo) con sus candados (modulos>0,
   estado 'activo'), incluyendo que 'renta' y 'licencia' se sumen en el
   MISMO renglón, 4) el formulario real (modalSitio): los 3 campos nuevos
   existen, la etiqueta de "Mensualidad" cambia según el tipo de cargo, y
   guardar de verdad persiste los 3 valores, 5) clic real en el detalle del
   dashboard navega al sitio real en Forpass (irAlSitioEnForpass). */
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
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'NGK' })];
  });
  const anioActual = await page.evaluate(() => hoyISO().slice(0,4));

  // --------- 1) Compatibilidad: un sitio viejo (sin los 3 campos nuevos) se comporta EXACTO igual que antes ---------
  const compat = await page.evaluate((anio) => {
    const viejo = normalizarSitio({ id:'sv', clienteId:'c1', nombre:'Sitio viejo', modulos:2, mensualidad:1000, fechaInicio: anio+'-01-01', meses:3, pagos:[] });
    const c = calcular(viejo);
    return {
      forpassTipoCargo: viejo.forpassTipoCargo, forpassFacturacion: viejo.forpassFacturacion, forpassCosto: viejo.forpassCosto,
      montos: c.montos, valorContrato: c.valorContrato
    };
  }, anioActual);
  chkF('Un sitio sin los campos nuevos nace con forpassTipoCargo="renta" (default)', compat.forpassTipoCargo === 'renta');
  chkF('...forpassFacturacion="mensual" (default)', compat.forpassFacturacion === 'mensual');
  chkF('...forpassCosto=0 (default, no rompe nada)', compat.forpassCosto === 0);
  chkF('Con facturación mensual (default), CADA mes de los 3 cobra su mensualidad completa — igual que antes de este cambio', compat.montos.every(m => m === 1000));
  chkF('El valor del contrato sigue siendo mensualidad × meses (mensual = un cobro por mes)', compat.valorContrato === 3000);

  // --------- 2) calcular(): las 3 periodicidades reparten distinto ---------
  const periodicidades = await page.evaluate((anio) => {
    const base = { id:'sp', clienteId:'c1', nombre:'Sitio', modulos:1, mensualidad:5000, fechaInicio: anio+'-01-01', meses:12, pagos:[] };
    const mensual   = calcular(normalizarSitio(Object.assign({}, base, { forpassFacturacion:'mensual' })));
    const semestral = calcular(normalizarSitio(Object.assign({}, base, { forpassFacturacion:'semestral' })));
    const anual     = calcular(normalizarSitio(Object.assign({}, base, { forpassFacturacion:'anual' })));
    return { mensual: mensual.montos, semestral: semestral.montos, anual: anual.montos,
             valorMensual: mensual.valorContrato, valorSemestral: semestral.valorContrato, valorAnual: anual.valorContrato };
  }, anioActual);
  chkF('Facturación mensual: cobra los 12 meses ($5,000 cada uno)', periodicidades.mensual.every(m => m === 5000));
  chkF('Facturación semestral: cobra SOLO en el mes 1 y el mes 7 (índices 0 y 6), el resto en $0',
    periodicidades.semestral[0] === 5000 && periodicidades.semestral[6] === 5000
    && periodicidades.semestral.filter((_,i)=> ![0,6].includes(i)).every(m => m === 0));
  chkF('Facturación anual: cobra UNA sola vez, en el mes 1, el resto del año en $0',
    periodicidades.anual[0] === 5000 && periodicidades.anual.filter((_,i)=> i !== 0).every(m => m === 0));
  chkF('El valor del contrato cuadra con el número real de cobros (mensual=$60,000, semestral=$10,000, anual=$5,000)',
    periodicidades.valorMensual === 60000 && periodicidades.valorSemestral === 10000 && periodicidades.valorAnual === 5000);

  // --------- 3) Resultados: "FORPASS – renta/licenciamiento", "FORPASS – venta de equipos" y "Hardware / equipos FORPASS" ---------
  await page.evaluate((anio) => {
    datos.sitios = [
      // Renta mensual, activo: cuenta cada mes del año en "renta/licenciamiento". Costo se reconoce UNA vez, en enero.
      normalizarSitio({ id:'s1', clienteId:'c1', nombre:'Sitio Renta', modulos:2, estado:'activo',
        forpassTipoCargo:'renta', forpassFacturacion:'mensual', forpassCosto:6000,
        mensualidad:1000, fechaInicio: anio+'-01-01', meses:12, pagos:[] }),
      // Licencia semestral, activo: cuenta en marzo y septiembre, EN EL MISMO renglón que 'renta'.
      normalizarSitio({ id:'s2', clienteId:'c1', nombre:'Sitio Licencia', modulos:1, estado:'activo',
        forpassTipoCargo:'licencia', forpassFacturacion:'semestral', forpassCosto:2000,
        mensualidad:5000, fechaInicio: anio+'-03-01', meses:12, pagos:[] }),
      // Venta única, activo: cuenta en junio, en "venta de equipos" (NO en renta/licenciamiento).
      normalizarSitio({ id:'s3', clienteId:'c1', nombre:'Sitio Venta', modulos:3, estado:'activo',
        forpassTipoCargo:'venta', forpassFacturacion:'anual', forpassCosto:9000,
        mensualidad:15000, fechaInicio: anio+'-06-01', meses:1, pagos:[] }),
      // Sin Forpass instalado (modulos:0): NO debe aportar nada — "inicialmente ninguno lo tiene".
      normalizarSitio({ id:'s4', clienteId:'c1', nombre:'Sitio sin Forpass', modulos:0, estado:'activo',
        forpassTipoCargo:'renta', forpassFacturacion:'mensual', forpassCosto:99999,
        mensualidad:99999, fechaInicio: anio+'-01-01', meses:12, pagos:[] }),
      // Pausado: aunque tenga módulos y costo capturados, NO cuenta (mismo candado que Pólizas 'activa').
      normalizarSitio({ id:'s5', clienteId:'c1', nombre:'Sitio pausado', modulos:2, estado:'pausado',
        forpassTipoCargo:'renta', forpassFacturacion:'mensual', forpassCosto:99999,
        mensualidad:99999, fechaInicio: anio+'-01-01', meses:12, pagos:[] }),
      // De baja: tampoco cuenta.
      normalizarSitio({ id:'s6', clienteId:'c1', nombre:'Sitio de baja', modulos:2, estado:'baja',
        forpassTipoCargo:'venta', forpassFacturacion:'mensual', forpassCosto:99999,
        mensualidad:99999, fechaInicio: anio+'-01-01', meses:12, pagos:[] })
    ];
    render();
  }, anioActual);
  await page.waitForTimeout(150);

  const forpass = await page.evaluate(() => {
    const anio = hoyISO().slice(0,4);
    const pilar = PILARES_PROFORMA.find(p => p.id === 'tecnologia');
    return {
      renta: pilar.ingresos.find(c => c.id === 'forpass-renta').montosPorMes(anio),
      venta: pilar.ingresos.find(c => c.id === 'forpass-venta-equipos').montosPorMes(anio),
      hardware: pilar.costos.find(c => c.id === 'hardware-forpass').montosPorMes(anio),
      detalleMarzo: pilar.ingresos.find(c => c.id === 'forpass-renta').detalle(anio, 2),
      detalleHardwareAnio: pilar.costos.find(c => c.id === 'hardware-forpass').detalle(anio, null)
    };
  });
  chkF('"FORPASS – renta / licenciamiento": enero $1,000 (solo s1 — s2 aún no arranca)', forpass.renta[0] === 1000);
  chkF('...marzo $6,000 ($1,000 de s1 + $5,000 del primer cobro semestral de s2, MISMO renglón renta+licencia)', forpass.renta[2] === 6000);
  chkF('...junio $1,000 (solo s1 — la venta de s3 NO cuenta aquí)', forpass.renta[5] === 1000);
  chkF('...septiembre $6,000 ($1,000 de s1 + $5,000 del segundo cobro semestral de s2)', forpass.renta[8] === 6000);
  chkF('...el resto de los meses solo trae el $1,000 mensual de s1 (s4/s5/s6 nunca se cuelan)',
    forpass.renta.filter((_,i)=> ![0,2,5,8].includes(i)).every(m => m === 1000));
  chkF('"FORPASS – venta de equipos": junio $15,000 (s3), el resto del año en $0', forpass.venta[5] === 15000 && forpass.venta.filter((_,i)=> i !== 5).every(m => m === 0));
  chkF('"Hardware / equipos FORPASS": enero $6,000 (costo de s1), marzo $2,000 (costo de s2), junio $9,000 (costo de s3)',
    forpass.hardware[0] === 6000 && forpass.hardware[2] === 2000 && forpass.hardware[5] === 9000);
  chkF('El resto de los meses de "Hardware / equipos FORPASS" en $0', forpass.hardware.filter((_,i)=> ![0,2,5].includes(i)).every(m => m === 0));
  chkF('Detalle de "renta/licenciamiento" en marzo: los 2 sitios reales (s1 y s2), con enlace a Forpass',
    forpass.detalleMarzo.length === 2 && forpass.detalleMarzo.every(it => it.accion === 'ir-forpass-sitio'));
  chkF('Detalle de "Hardware" en el año: los 3 sitios reales con costo (s1/s2/s3) — s4/s5/s6 no aparecen',
    forpass.detalleHardwareAnio.length === 3 && forpass.detalleHardwareAnio.every(it => it.accion === 'ir-forpass-sitio'));

  // --------- 4) Clic real: el dashboard navega al sitio real en Forpass ---------
  await page.evaluate(() => { document.querySelector('[data-accion="vista-lista"][data-campo="resultadosMeses"][data-modo="todos"]').click(); });
  await page.waitForTimeout(100);
  await page.locator('td.clic-detalle', { hasText: 'FORPASS – renta / licenciamiento' }).first().click();
  await page.waitForTimeout(150);
  await page.locator('.dp-fila.dp-clic', { hasText: 'Sitio Renta' }).click();
  await page.waitForTimeout(200);
  const trasNavegar = await page.evaluate(() => ({ modulo: estado.modulo, sitioFiltro: estado.sitioFiltro, clienteId: estado.clienteId, modalCerrado: !document.getElementById('telon').classList.contains('abierto') }));
  chkF('Clic en el registro del modal cierra el modal y navega al módulo Forpass, filtrado a ese sitio real',
    trasNavegar.modulo === 'forpass' && trasNavegar.sitioFiltro === 's1' && trasNavegar.clienteId === 'c1' && trasNavegar.modalCerrado === true);

  // --------- 5) El formulario real (modalSitio): los 3 campos existen y la etiqueta cambia según el tipo de cargo ---------
  await page.evaluate(() => { irAModulo('forpass'); modalSitio('c1', null); });
  await page.waitForTimeout(150);
  chkF('El formulario trae el select "Tipo de cargo"', await page.locator('#sForpassTipoCargo').count() === 1);
  chkF('El formulario trae el select "Facturación"', await page.locator('#sForpassFacturacion').count() === 1);
  chkF('El formulario trae el campo "Costo de los Forpass instalados"', await page.locator('#sForpassCosto').count() === 1);
  chkF('Por default (Renta), la etiqueta del campo dice "Mensualidad"', (await page.locator('#labelMensualidad').textContent()).includes('Mensualidad'));

  await page.selectOption('#sForpassTipoCargo', 'venta');
  await page.waitForTimeout(100);
  chkF('Al elegir "Venta", la etiqueta del campo cambia a "Precio de venta"', (await page.locator('#labelMensualidad').textContent()).includes('Precio de venta'));

  // --------- 6) Guardar de verdad: los 3 valores capturados se persisten en el sitio ---------
  await page.fill('#sNombre', 'Sitio Nuevo Forpass');
  await page.fill('#sModulos', '2');
  await page.fill('#sForpassCosto', '4500');
  await page.fill('#sMensualidad', '20000');
  await page.selectOption('#sForpassFacturacion', 'anual');
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);
  const guardado = await page.evaluate(() => datos.sitios.find(s => s.nombre === 'Sitio Nuevo Forpass'));
  chkF('El sitio se guardó con forpassTipoCargo="venta"', !!guardado && guardado.forpassTipoCargo === 'venta');
  chkF('...forpassFacturacion="anual"', !!guardado && guardado.forpassFacturacion === 'anual');
  chkF('...forpassCosto=4500', !!guardado && guardado.forpassCosto === 4500);
  chkF('...mensualidad=20000 (aquí actúa como precio de venta)', !!guardado && guardado.mensualidad === 20000);

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
