/* Veredicto de auditoría (21-sep-2026), hallazgos "Escala" (15 d-p) e
   "Integración" (10 d-p): "Cada usuario baja la base entera cada 30
   segundos" / "Ese mismo barrido hace inviable cualquier integración por
   consulta encima". Antes, refrescarDesdeNube() llamaba a bajarDeLaNube()
   a secas cada 30s: 17 colecciones completas, sin importar si algo había
   cambiado. Ahora primero pregunta con UNA lectura barata
   (coleccionesCambiadas(), contra /meta/sync) qué colecciones cambiaron de
   verdad desde la última vez, y bajarDeLaNube(soloColecciones) solo trae
   ESAS — las demás ni se tocan.

   Nota sobre el mock: en este sandbox, un fetch() real hacia
   firestore.googleapis.com falla con net::ERR_FAILED incluso con
   page.route() de por medio (algo del lado de la red del contenedor, no
   de la app) — así que en vez de interceptar a nivel de red, este test
   reemplaza window.pedirNube() directo, el mismo choque de abajo que usan
   TODAS las funciones de este archivo que hablan con Firestore
   (escribirNube/borrarNube/listarNube/leerCatalogo/leerSegmentos/
   leerParametros/coleccionesCambiadas) — así se prueba la lógica real de
   sync incremental sin depender de que la red del sandbox alcance un
   dominio real de Google. */
const { chromium } = require('playwright');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
const chk = (label, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' - ' + label); return cond; };
let fallas = 0;
const chkF = (label, cond) => { if(!chk(label, cond)) fallas++; };

(async () => {
  const browser = await chromium.launch(OPCIONES_NAVEGADOR);
  const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });
  const errores = [];
  page.on('pageerror', e => errores.push('PAGEERROR: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error' && !/404/.test(msg.text())) errores.push('CONSOLE: ' + msg.text()); });
  await page.goto(URL_BASE + '/index.html');
  await page.waitForTimeout(400);

  const r1 = await page.evaluate(async () => {
    sesion.correo='owner@a.com'; sesion.uid='u-owner'; sesion.idToken='FAKE'; sesion.refreshToken='F2';
    sesion.expira=Date.now()+3600000; sesion.rol='owner'; sesion.nombre='Victor Owner';
    ocultarAcceso();
    marcas = {}; guardarMarcas();

    /* Firestore de mentiras: un solo choque (pedirNube) usado por TODAS las
       funciones de sync. Simula /meta/sync en memoria y cuenta cuántas
       veces se pide el LISTADO completo de cada colección. */
    window._metaSyncSim = {};
    window._conteoLecturas = {};
    window.pedirNube = async (ruta, opciones) => {
      if(ruta.indexOf('/meta/sync') === 0){
        if(opciones.method === 'GET'){
          const claves = Object.keys(window._metaSyncSim);
          if(!claves.length) return null;
          const fields = {};
          claves.forEach(k => fields[k] = { stringValue: window._metaSyncSim[k] });
          return { fields };
        }
        if(opciones.method === 'PATCH'){
          const body = JSON.parse(opciones.body);
          Object.keys(body.fields).forEach(k => { window._metaSyncSim[k] = body.fields[k].stringValue; });
          return {};
        }
      }
      const m = /^\/([a-zA-Z]+)(?:\?|$)/.exec(ruta);
      if(m && opciones.method === 'GET') window._conteoLecturas[m[1]] = (window._conteoLecturas[m[1]] || 0) + 1;
      return { documents: [] };
    };
    return true;
  });
  chkF('Arranque de la simulación sin errores', r1 === true);

  // --------- 1) marcarCambio() sella /meta/sync con debounce ---------
  const r2 = await page.evaluate(async () => {
    marcarCambio('clientes');
    marcarCambio('clientes'); // una segunda llamada rápida no debe duplicar el temporizador
    await new Promise(r => setTimeout(r, 2300));
    return { tieneClientes: 'clientes' in window._metaSyncSim, valorEsFecha: !isNaN(Date.parse(window._metaSyncSim.clientes || '')) };
  });
  chkF('marcarCambio() SÍ sella /meta/sync.clientes tras el debounce', r2.tieneClientes === true);
  chkF('El valor sellado es una fecha válida', r2.valorEsFecha === true);

  // --------- 2) coleccionesCambiadas() detecta lo nuevo contra lo ya conocido ---------
  const r3 = await page.evaluate(async () => {
    const primeraVez = await coleccionesCambiadas();
    marcas = primeraVez.marcasNube; guardarMarcas();
    const segundaVez = await coleccionesCambiadas();
    marcarCambio('reportes');
    await new Promise(r => setTimeout(r, 2300));
    const terceraVez = await coleccionesCambiadas();
    return {
      primeraTieneClientes: primeraVez.cambiaron.has('clientes'),
      segundaVacia: segundaVez.cambiaron.size === 0,
      terceraSoloReportes: terceraVez.cambiaron.has('reportes') && !terceraVez.cambiaron.has('clientes') && terceraVez.cambiaron.size === 1
    };
  });
  chkF('coleccionesCambiadas() detecta "clientes" la primera vez (nunca se había visto)', r3.primeraTieneClientes === true);
  chkF('coleccionesCambiadas() no marca nada si nada cambió desde la última lectura', r3.segundaVacia === true);
  chkF('coleccionesCambiadas() detecta SOLO "reportes" cuando solo eso cambió', r3.terceraSoloReportes === true);

  // --------- 3) bajarDeLaNube(soloColecciones) solo pide esas colecciones ---------
  const r4 = await page.evaluate(async () => {
    window._conteoLecturas = {};
    datos.sitios = [{ id:'centinela-sitios', marcador:true }];
    datos.polizas = [{ id:'centinela-polizas', marcador:true }];
    await bajarDeLaNube(new Set(['reportes']));
    return {
      conteo: window._conteoLecturas,
      sitiosIntactos: datos.sitios.length === 1 && datos.sitios[0].id === 'centinela-sitios',
      polizasIntactas: datos.polizas.length === 1 && datos.polizas[0].id === 'centinela-polizas'
    };
  });
  console.log('Lecturas tras bajarDeLaNube(Set(["reportes"])):', JSON.stringify(r4.conteo));
  chkF('bajarDeLaNube(Set(["reportes"])) NO pidió "sitios"', !r4.conteo.sitios);
  chkF('bajarDeLaNube(Set(["reportes"])) NO pidió "polizas"', !r4.conteo.polizas);
  chkF('bajarDeLaNube(Set(["reportes"])) SÍ pidió "reportes"', (r4.conteo.reportes || 0) >= 1);
  chkF('Las colecciones no pedidas quedaron intactas en datos (no se reemplazaron con [])', r4.sitiosIntactos && r4.polizasIntactas);

  // --------- 4) bajarDeLaNube() sin argumento sigue bajando TODO ---------
  const r5 = await page.evaluate(async () => {
    window._conteoLecturas = {};
    await bajarDeLaNube();
    return window._conteoLecturas;
  });
  console.log('Lecturas tras bajarDeLaNube() sin argumento:', JSON.stringify(r5));
  const TODAS = ['clientes','sitios','polizas','cotizaciones','reportes','levantamientos','activos','personal'];
  chkF('bajarDeLaNube() sin argumento SÍ pide todas las colecciones (reconciliación completa intacta)',
    TODAS.every(c => (r5[c] || 0) >= 1));

  // --------- 5) refrescarDesdeNube() de verdad: nada cambió -> ni una lectura de colección ---------
  const r6 = await page.evaluate(async () => {
    window._conteoLecturas = {};
    marcas = Object.assign({}, window._metaSyncSim); guardarMarcas();
    const antesJSON = JSON.stringify(datos);
    await refrescarDesdeNube();
    return { conteo: window._conteoLecturas, sinCambios: JSON.stringify(datos) === antesJSON };
  });
  console.log('Lecturas de refrescarDesdeNube() cuando nada cambió:', JSON.stringify(r6.conteo));
  chkF('refrescarDesdeNube() no pide NINGUNA colección cuando nada cambió desde la última vez',
    Object.keys(r6.conteo).length === 0);

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
