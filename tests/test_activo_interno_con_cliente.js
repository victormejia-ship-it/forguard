/* Un activo interno (Forguard/Plato Express) ya no se va a un rubro aparte
   si tiene Cliente/Sitio (30-sep-2026, pedido de Victor, tras ver el
   directorio de Activos con "Activos internos" como tarjeta separada,
   igual que un cliente más):

   "en activos si seleccionamos que es activo de forguard o de plato
   express no lo muevas a un rubro por aparte, dejalo en el mismo listado
   pero identificado como activo de forguard o plato"

   Aclarado con dos preguntas directas: (1) un activo interno SÍ debe poder
   tener Cliente/Sitio —ej. una herramienta de Forguard en uso en el sitio
   de un cliente— y quedarse agrupado bajo ESE cliente, no en "Activos
   internos"; (2) "Forguard" y "Plato Express" son dos dueños DISTINTOS a
   elegir, no un solo concepto.

   Antes: `tipo` decidía a la vez DE QUIÉN ES el activo Y si podía tener
   Cliente/Sitio — 'cliente' sí, 'interno' no (siempre "Activo interno
   (Forguard)", sin Plato Express como opción). Ahora: TIPO_ACTIVO =
   ['cliente','forguard','plato']; Cliente/Sitio son capturables para
   CUALQUIER tipo (obligatorios solo para 'cliente'); solo un activo SIN
   ningún clienteId cae en el directorio aparte "Activos internos"; cada
   tarjeta trae su propia etiqueta ("Activo interno — Forguard"/"— Plato
   Express") para identificarlo sin necesidad de segregarlo. */
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

  // --------- 1) Compatibilidad: un activo viejo con tipo:'interno' se lee como 'forguard' ---------
  const compat = await page.evaluate(() => {
    const viejo = normalizarActivo({ id:'x1', tipo:'interno', nombre:'Taladro viejo', asignadoA:'Juan' });
    return { tipo: viejo.tipo, asignadoA: viejo.asignadoA, etiqueta: ETIQUETA_TIPO_ACTIVO[viejo.tipo] };
  });
  chkF('tipo:"interno" (dato viejo) se normaliza a "forguard", no a "cliente"', compat.tipo === 'forguard');
  chkF('Su asignación (asignadoA) no se pierde en la conversión', compat.asignadoA === 'Juan');
  chkF('Su etiqueta dice "Forguard" (la única que existía antes)', /Forguard/.test(compat.etiqueta));

  // --------- 2) Un activo interno SÍ puede traer Cliente/Sitio (normalizarActivo ya no lo bloquea) ---------
  const conSitio = await page.evaluate(() => {
    datos.clientes = [ normalizarCliente({ id:'c1', nombre:'3M Planta San Luis' }) ];
    datos.sitios = [ normalizarSitio({ id:'s1', clienteId:'c1', nombre:'3M Planta San Luis', modulos:0, mensualidad:0, fechaInicio:hoyISO(), meses:12 }) ];
    const act = normalizarActivo({ id:'a1', tipo:'forguard', nombre:'Chafer eléctrico', clienteId:'c1', sitioId:'s1', sitioNombre:'3M Planta San Luis', asignadoA:'Pedro' });
    datos.activos = [act];
    return { clienteId: act.clienteId, sitioNombre: act.sitioNombre, asignadoA: act.asignadoA };
  });
  chkF('Un activo "forguard" SÍ conserva su clienteId', conSitio.clienteId === 'c1');
  chkF('Un activo "forguard" SÍ conserva su sitioNombre', conSitio.sitioNombre === '3M Planta San Luis');
  chkF('Y SIGUE pudiendo tener asignadoA al mismo tiempo (dueño y ubicación son cosas distintas)', conSitio.asignadoA === 'Pedro');

  // --------- 3) En el directorio, ese activo se agrupa bajo SU cliente, no en "Activos internos" ---------
  await page.evaluate(() => { irAModulo('activos'); render(); });
  await page.waitForTimeout(150);
  const directorio = await page.evaluate(() => ({
    hayTarjetaCliente: !!document.querySelector('[data-activos-grupo="c1"]'),
    hayTarjetaInternos: !!document.querySelector('[data-activos-grupo="__interno__"]')
  }));
  chkF('La tarjeta del cliente 3M SÍ aparece en el directorio', directorio.hayTarjetaCliente);
  chkF('NO aparece ninguna tarjeta "Activos internos" (el único activo interno tiene cliente)', directorio.hayTarjetaInternos === false);

  // --------- 4) Dentro de la tarjeta de 3M, el activo se ve con su propia etiqueta de dueño ---------
  await page.click('[data-activos-grupo="c1"]');
  await page.waitForTimeout(150);
  const dentro = await page.evaluate(() => {
    const tarjeta = document.querySelector('[data-activo="a1"]');
    return tarjeta ? tarjeta.textContent : null;
  });
  chkF('El activo "forguard" SÍ aparece listado dentro de la tarjeta de 3M', !!dentro);
  chkF('...identificado con su propia etiqueta "Activo interno — Forguard"', dentro && /Activo interno.*Forguard/.test(dentro));

  // --------- 5) Un activo interno SIN cliente sí sigue cayendo en "Activos internos" ---------
  await page.evaluate(() => {
    datos.activos.push(normalizarActivo({ id:'a2', tipo:'plato', nombre:'Camioneta', ubicacion:'Base Monterrey' }));
    estado.activosClienteId = ''; /* ya estábamos en 'activos'; irAModulo() no hace nada si el módulo no cambia */
    render();
  });
  await page.waitForTimeout(150);
  const conInterno = await page.evaluate(() => !!document.querySelector('[data-activos-grupo="__interno__"]'));
  chkF('Con un activo SIN cliente, "Activos internos" SÍ vuelve a aparecer', conInterno);
  await page.click('[data-activos-grupo="__interno__"]');
  await page.waitForTimeout(150);
  const dentroInterno = await page.evaluate(() => {
    const tarjeta = document.querySelector('[data-activo="a2"]');
    return tarjeta ? tarjeta.textContent : null;
  });
  chkF('Ese activo se ve ahí, identificado como "Activo interno — Plato Express"', dentroInterno && /Plato Express/.test(dentroInterno));

  // --------- 6) El modal de alta/edición: Tipo trae las 3 opciones, y Cliente/Sitio se quedan visibles siempre ---------
  await page.evaluate(() => { estado.activosClienteId = ''; modalActivo('a1'); });
  await page.waitForTimeout(150);
  const opcionesTipo = await page.locator('#actTipo option').allTextContents();
  chkF('El selector de Tipo trae Forguard', opcionesTipo.some(t => /Forguard/.test(t)));
  chkF('El selector de Tipo trae Plato Express', opcionesTipo.some(t => /Plato Express/.test(t)));
  chkF('Al editar un activo "forguard" con cliente, el campo Cliente NO está oculto', await page.locator('#actZonaCliente').isHidden() === false);
  chkF('Y el bloque de Asignado a TAMPOCO está oculto (puede tener ambos)', await page.locator('#actZonaInterno').isHidden() === false);

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
