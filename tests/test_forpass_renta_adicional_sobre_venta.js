/* Forpass: renta mensual ADEMÁS de una venta (13-oct-2026, caso real de
   Victor con INOAC: "vendimos un equipo y al momento de regristrarlo lo
   coloco como venta, pero tambien tendremos una renta mensual arregla para
   que en caso de que sea venta podamos incorporar una renta si es
   necesario"). Captura real (Excel de INOAC): "Condiciones comerciales: Se
   vendió equipo en $87,000" + "Mensualidad / renta: $5,950.00" — dos
   ingresos distintos del MISMO sitio, algo que `forpassTipoCargo` (un único
   valor: renta/licencia/venta) no podía representar.

   Antes de construir, se preguntó con AskUserQuestion cómo llevar el cobro
   de esa renta —Forpass ya alimenta Resultados y cualquier diseño podía
   cambiar cómo se contabiliza— y Victor eligió "un solo calendario
   combinado": la renta se suma al mismo cobro mensual de siempre (mismos
   12 círculos "Marcar pagada", sin un segundo calendario aparte), y para
   Resultados esa parte se separa sola hacia su renglón correcto.

   Diseño: forpassRentaAdicional solo aplica (y normalizarSitio lo fuerza a
   0 para cualquier otro caso) cuando forpassTipoCargo === 'venta' — nunca
   un dato fantasma detrás de un control que ya no se ve. Se suma en
   calcular() a CADA mes del contrato (es mensual de verdad, sin importar
   `forpassFacturacion`, que sigue rigiendo solo la parte de venta). Para
   Resultados, periodosForpassEnAnio() separa cada mes en montoVenta/
   montoRenta, así que "FORPASS – venta de equipos" solo ve la venta y
   "FORPASS – renta / licenciamiento" se queda con la rebanada de renta,
   sin que la clasificación del sitio ("venta") se pierda.

   Backward-compatible por diseño: un sitio sin forpassRentaAdicional (todos
   los que ya existían, y todo lo que no es 'venta') calcula EXACTAMENTE
   igual que antes — rentaAdicionalMensual sale en 0 y no cambia nada. */
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
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'INOAC' })];
    irAModulo('clientes'); entrarResumenCliente('c1'); render();
  });
  await page.waitForTimeout(300);

  // --------- 1) El campo solo aparece (y solo aplica) con Tipo de cargo = Venta ---------
  await page.evaluate(() => { modalSitio('c1', null); });
  await page.waitForTimeout(150);
  chkF('Con "Renta" (default), el campo de renta adicional NO se ve', await page.evaluate(() => $('wrapRentaAdicional').style.display === 'none'));
  await page.selectOption('#sForpassTipoCargo', 'venta');
  await page.waitForTimeout(100);
  chkF('Al elegir "Venta", aparece el campo de renta mensual adicional', await page.evaluate(() => $('wrapRentaAdicional').style.display !== 'none'));

  // --------- 2) Capturar el caso real de INOAC: venta anual + renta mensual ---------
  await page.fill('#sNombre', 'Inoac Polytec');
  await page.fill('#sModulos', '1');
  await page.fill('#sMensualidad', '87000');
  await page.selectOption('#sForpassFacturacion', 'anual');
  await page.fill('#sRentaAdicional', '5950');
  await page.waitForTimeout(100);
  chkF('El resumen en vivo ya refleja la renta adicional capturada', (await page.evaluate(() => $('resumenSitio').innerText)).includes('5,950'));
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);

  const guardado = await page.evaluate(() => datos.sitios.find(s => s.nombre === 'Inoac Polytec'));
  chkF('Se guarda forpassRentaAdicional = 5,950', guardado.forpassRentaAdicional === 5950);
  chkF('El sitio sigue clasificado como "venta"', guardado.forpassTipoCargo === 'venta');
  chkF('El precio de venta (mensualidad) sigue siendo 87,000, intacto', guardado.mensualidad === 87000);

  // --------- 3) calcular(): la renta se cobra CADA mes, la venta solo cuando toca ---------
  const c1 = await page.evaluate(() => {
    const s = datos.sitios.find(x => x.nombre === 'Inoac Polytec');
    s.fechaInicio = '2026-01-01'; // fija, para que los 12 meses caigan en el mismo año calendario
    return calcular(s);
  });
  chkF('Mes 1: venta anual completa + renta ($87,000 + $5,950 = $92,950)', c1.montos[0] === 92950);
  chkF('Mes 2: la venta ya se facturó una vez al año — solo queda la renta ($5,950)', c1.montos[1] === 5950);
  chkF('Mes 12 también trae solo la renta', c1.montos[11] === 5950);
  chkF('calcular() expone rentaAdicionalMensual = 5,950', c1.rentaAdicionalMensual === 5950);
  chkF('Valor total del contrato = venta + 12 rentas ($87,000 + $71,400)', c1.valorContrato === 87000 + 5950 * 12);

  // --------- 4) Resultados: la venta y la renta se separan, nunca se mezclan ---------
  const resultados = await page.evaluate(() => {
    const anio = 2026;
    const renta = montosPorMesForpassRenta()(anio);
    const venta = montosPorMesForpassVenta()(anio);
    return { totalRenta: renta.reduce((a,b)=>a+b,0), totalVenta: venta.reduce((a,b)=>a+b,0) };
  });
  chkF('"FORPASS – venta de equipos" solo ve la venta ($87,000, sin la renta mezclada)', resultados.totalVenta === 87000);
  chkF('"FORPASS – renta / licenciamiento" se queda con toda la renta del año ($5,950 × 12)', resultados.totalRenta === 5950 * 12);

  // --------- 5) La tarjeta del sitio en Forpass muestra la venta y la renta por separado ---------
  await page.evaluate(() => { estado.vista = ''; irAModulo('forpass'); estado.vista='cliente'; estado.clienteId='c1'; render(); });
  await page.waitForTimeout(200);
  const textoTarjeta = await page.locator('.tarjeta').first().innerText();
  chkF('La tarjeta dice "Venta" (no "Mensualidad") cuando hay renta adicional', textoTarjeta.includes('VENTA'));
  chkF('...y muestra la renta adicional aparte ("+ $5,950 renta/mes")', textoTarjeta.includes('5,950') && textoTarjeta.includes('renta/mes'));

  // --------- 6) "Mensualidad total" (MRR) de Forpass incluye la renta adicional ---------
  const mrr = await page.evaluate(() => resumir(datos.sitios).mrr);
  chkF('El MRR de Forpass suma venta + renta (87,000 + 5,950)', mrr === 87000 + 5950);

  // --------- 7) Cambiar a "Renta"/"Licencia" apaga la renta adicional (sin dato fantasma) ---------
  await page.evaluate(() => { modalSitio('c1', datos.sitios.find(s => s.nombre === 'Inoac Polytec').id); });
  await page.waitForTimeout(150);
  await page.selectOption('#sForpassTipoCargo', 'renta');
  await page.waitForTimeout(100);
  chkF('Al cambiar a "Renta", el campo se oculta de nuevo', await page.evaluate(() => $('wrapRentaAdicional').style.display === 'none'));
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);
  const trasCambio = await page.evaluate(() => datos.sitios.find(s => s.nombre === 'Inoac Polytec'));
  chkF('forpassRentaAdicional se fuerza a 0 al salir de "venta" (nunca queda un dato fantasma)', trasCambio.forpassRentaAdicional === 0);

  // --------- 8) Retrocompatibilidad: un sitio SIN renta adicional calcula exactamente igual que antes ---------
  await page.evaluate(() => {
    datos.sitios.push(normalizarSitio({ id:'sViejo', clienteId:'c1', nombre:'Sitio de siempre', modulos:2, mensualidad:1500, forpassTipoCargo:'renta', fechaInicio:'2026-01-01' }));
  });
  const viejo = await page.evaluate(() => {
    const c = calcular(datos.sitios.find(x => x.id === 'sViejo'));
    return { montos0: c.montos[0], montos5: c.montos[5], rentaAdicionalMensual: c.rentaAdicionalMensual };
  });
  chkF('Un sitio normal cobra su mensualidad de siempre, sin cambios ($1,500)', viejo.montos0 === 1500 && viejo.montos5 === 1500);
  chkF('...y rentaAdicionalMensual sale en 0 (ningún comportamiento nuevo sin pedirlo)', viejo.rentaAdicionalMensual === 0);

  chkF('No hubo errores de página en todo el escenario', errores.length === 0);
  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
