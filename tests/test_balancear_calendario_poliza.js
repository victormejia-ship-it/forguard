/* "Reordenar meses de servicio" en el Calendario de una póliza (13-oct-2026,
   pedido de Victor viendo una cotización real con varios equipos cayendo en
   meses cercanos entre sí: "añade una manera de como poder reordenar
   conforme a las reglas los mttos. en las polizas").

   Ya existía "Recalcular calendario por categoría" (recalcularCalendarioPoliza),
   pero ESE escalona por el TIPO de equipo (caliente/frío/equipo menor/etc.)
   sin mirar qué tan cargado queda cada mes — dos pólizas con puros equipos
   "caliente" igual terminan todos en el mismo mes. "Reordenar meses de
   servicio" (balancearCalendarioPoliza) sí mira la carga real de TODA la
   póliza (cuántos equipos, por cantidad, caen en cada uno de los 12 meses)
   y mueve el ARRANQUE de cada renglón para parejarla.

   "Conforme a las reglas" es justo mesesRegulares()/arranquesDe(): un
   renglón solo puede arrancar en uno de los meses que le dan EXACTAMENTE
   su frecuencia — la frecuencia (cuántos servicios al año, lo que se
   vendió) nunca se toca, solo se elige CUÁL de sus arranques válidos usar.
   Nunca se tocan los renglones "a mano" (mesArranqueDe === null, mismo
   respeto que ya tiene Recalcular) ni los del seguro (esSegurista: no
   cuentan como equipo en la carga, así que moverlos no ayudaría a nada).

   Algoritmo voraz y determinista: los de más frecuencia se acomodan
   primero (menos arranques válidos entre los que elegir); para cada uno se
   prueba cada arranque válido y se elige el que deja el mes más cargado de
   la póliza lo más bajo posible, con empate resuelto por el arranque más
   chico — para que el resultado sea siempre el mismo con los mismos datos. */
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
  page.on('dialog', d => d.accept());
  await page.route('**identitytoolkit.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**securetoken.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**firestore.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.goto(URL_BASE + '/index.html');
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    sesion.correo='owner@a.com'; sesion.uid='u-owner'; sesion.idToken='FAKE'; sesion.refreshToken='F2';
    sesion.expira=Date.now()+3600000; sesion.rol='owner'; sesion.nombre='Victor Owner';
    ocultarAcceso();
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'Cliente Prueba' })];
  });

  // --------- 1) El algoritmo baja el pico mensual sin tocar frecuencias ---------
  const resultado = await page.evaluate(() => {
    const partidas = [
      normalizarPartida({ concepto:'Equipo A', frecuencia:3, mesesServicio: mesesRegulares(0,3), cantidad:1 }),
      normalizarPartida({ concepto:'Equipo B', frecuencia:3, mesesServicio: mesesRegulares(0,3), cantidad:1 }),
      normalizarPartida({ concepto:'Equipo C', frecuencia:3, mesesServicio: mesesRegulares(0,3), cantidad:1 }),
      normalizarPartida({ concepto:'Equipo D', frecuencia:3, mesesServicio: mesesRegulares(0,3), cantidad:1 }),
      // "A mano": meses que NO calzan con ningún patrón regular -> no se debe mover
      normalizarPartida({ concepto:'Equipo manual', frecuencia:2, mesesServicio:[0,1], cantidad:1 }),
      // Segurista, también en el mes 0 -> tampoco se debe mover ni contar en la carga
      normalizarPartida({ concepto:'Extintor Segurista', frecuencia:1, mesesServicio:[0], cantidad:1 })
    ];
    const p = normalizarPoliza({ id:'polTest', clienteId:'c1', fechaInicio: hoyISO(), partidas });
    datos.polizas = [p];

    const antes = JSON.parse(JSON.stringify(p.partidas));
    balancearCalendarioPoliza('polTest');
    const despues = polizaPorId('polTest').partidas;

    const carga = lista => {
      const c = Array(12).fill(0);
      lista.forEach(x => { if(!esSegurista(x)) x.mesesServicio.forEach(m => { c[m] += x.cantidad; }); });
      return c;
    };
    const cargaAntes = carga(antes), cargaDespues = carga(despues);

    return {
      picoAntes: Math.max(...cargaAntes),
      picoDespues: Math.max(...cargaDespues),
      frecuenciasIguales: antes.every((a,i) => a.frecuencia === despues[i].frecuencia),
      cuentasServiciosIguales: antes.every((a,i) => a.mesesServicio.length === despues[i].mesesServicio.length),
      manualIntacto: JSON.stringify(despues.find(x=>x.concepto==='Equipo manual').mesesServicio) === JSON.stringify([0,1]),
      seguristaIntacto: JSON.stringify(despues.find(x=>x.concepto.includes('Segurista')).mesesServicio) === JSON.stringify([0])
    };
  });
  await page.waitForTimeout(100);

  chkF('Varios equipos clusterizados en el mismo mes arrancan con un pico real (5)', resultado.picoAntes === 5);
  chkF('Tras reordenar, el pico del mes más cargado baja de verdad', resultado.picoDespues < resultado.picoAntes);
  chkF('Las frecuencias (servicios/año vendidos) quedan exactamente iguales', resultado.frecuenciasIguales);
  chkF('La CANTIDAD de meses de servicio de cada renglón tampoco cambia', resultado.cuentasServiciosIguales);
  chkF('El renglón "a mano" no se tocó', resultado.manualIntacto);
  chkF('El renglón del seguro (segurista) no se tocó', resultado.seguristaIntacto);

  // --------- 2) Es idempotente: una segunda corrida no encuentra nada que mover ---------
  const segundaVezAvisa = await page.evaluate(() => {
    let msg = null;
    const avisoOriginal = window.aviso;
    window.aviso = (texto)=>{ msg = texto; };
    balancearCalendarioPoliza('polTest');
    window.aviso = avisoOriginal;
    return msg;
  });
  chkF('Una segunda pasada avisa que ya no hay nada que mover (determinista)', (segundaVezAvisa || '').includes('ya estaba lo más parejo'));

  // --------- 3) El botón vive en el Calendario, junto a "Recalcular calendario" ---------
  await page.evaluate(() => {
    const partidas = [
      normalizarPartida({ concepto:'Equipo A', frecuencia:3, mesesServicio: mesesRegulares(0,3), cantidad:1 }),
      normalizarPartida({ concepto:'Equipo B', frecuencia:3, mesesServicio: mesesRegulares(0,3), cantidad:1 }),
      normalizarPartida({ concepto:'Equipo C', frecuencia:3, mesesServicio: mesesRegulares(0,3), cantidad:1 })
    ];
    datos.polizas = [normalizarPoliza({ id:'polUI', clienteId:'c1', fechaInicio: hoyISO(), partidas })];
    modalCalendario('polUI');
  });
  await page.waitForTimeout(200);
  chkF('El botón "Reordenar meses de servicio" aparece en el Calendario', await page.locator('[data-balancear-calendario="polUI"]').count() === 1);
  chkF('...junto al de "Recalcular calendario por categoría"', await page.locator('[data-recalcular-calendario="polUI"]').count() === 1);

  await page.click('[data-balancear-calendario="polUI"]');
  await page.waitForTimeout(300);
  chkF('Tras confirmar, el modal se reabre solo (no se cierra)', await page.locator('#telon.abierto').count() === 1);
  const picoFinalUI = await page.evaluate(() => {
    const p = polizaPorId('polUI');
    const c = Array(12).fill(0);
    p.partidas.forEach(x => x.mesesServicio.forEach(m => { c[m] += x.cantidad; }));
    return Math.max(...c);
  });
  chkF('Los 3 equipos ya NO coinciden los tres en el mismo mes', picoFinalUI < 3);
  await page.evaluate(() => cerrarModal());

  // --------- 4) Sin ningún equipo movible, avisa en vez de tronar ---------
  await page.evaluate(() => {
    const partidas = [
      normalizarPartida({ concepto:'Solo a mano', frecuencia:2, mesesServicio:[0,1], cantidad:1 }),
      normalizarPartida({ concepto:'Puro Segurista', frecuencia:1, mesesServicio:[3], cantidad:1 })
    ];
    datos.polizas = [normalizarPoliza({ id:'polSinNada', clienteId:'c1', fechaInicio: hoyISO(), partidas })];
  });
  const avisoSinNada = await page.evaluate(() => {
    let msg = null;
    const avisoOriginal = window.aviso;
    window.aviso = (texto)=>{ msg = texto; };
    balancearCalendarioPoliza('polSinNada');
    window.aviso = avisoOriginal;
    return msg;
  });
  chkF('Sin ningún renglón movible, avisa claramente en vez de tronar', (avisoSinNada || '').includes('a mano') || (avisoSinNada || '').includes('seguro'));

  // --------- 5) El portal de clientes (de solo lectura) nunca ofrece este botón ---------
  await page.evaluate(() => {
    const partidas = [ normalizarPartida({ concepto:'Equipo Portal', frecuencia:3, mesesServicio: mesesRegulares(0,3), cantidad:1 }) ];
    datos.polizas.push(normalizarPoliza({ id:'polPortal', clienteId:'c1', fechaInicio: hoyISO(), partidas }));
    modalCalendarioPortal('polPortal');
  });
  await page.waitForTimeout(200);
  chkF('El portal de clientes NUNCA muestra "Reordenar meses de servicio"', await page.locator('[data-balancear-calendario]').count() === 0);

  chkF('No hubo errores de página en todo el escenario', errores.length === 0);
  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
