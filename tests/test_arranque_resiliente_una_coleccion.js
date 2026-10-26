/* Resiliencia del arranque ante UN fallo de red en una sola colección
   (26-oct-2026, reporte de Victor viendo el tablero real: "cada que
   actualizo me aparece este mensaje [Sin conexión. Estás viendo la última
   copia guardada aquí...]... esto quiere decir que no esta actualizado el
   sistema o que sucede").

   Diagnóstico: bajarDeLaNube() pide 25 colecciones EN PARALELO con
   Promise.all. De esas, 8 (clientes, sitios, polizas, cotizaciones,
   reportes, levantamientos, activos, personal) usaban listarNube() a
   secas — si UNA SOLA de esas 8 peticiones fallaba por red (fetchConTimeout
   agotó sus 20s, o de verdad no había internet en ese instante), esa
   excepción tumbaba TODO el Promise.all de un jalón, aunque las otras 24
   peticiones hubieran contestado perfecto. arrancarNube() lo atrapaba en su
   try/catch y mandaba a manejarFalloDeArranque(), que enseña "Sin
   conexión..." — un mensaje que suena a que el usuario no tiene internet,
   cuando en realidad fue solo UNA colección la que tardó de más (páginas de
   60 pólizas/reportes/etc. de por medio, compitiendo encima por el límite
   de conexiones simultáneas que impone el navegador al mismo dominio).

   Arreglo: esas 8 colecciones ahora usan listarNubeResiliente(), que SOLO
   absorbe fallas de red (esFalloDeRed) — nunca un 403 de permisos real, que
   sigue tumbando el arranque como antes porque ESE sí amerita avisarle al
   usuario. El resto del código ya sabía tratar null como "no se pudo
   confirmar, se queda lo local" (ver el merge de bajarDeLaNube,
   `cl === null ? datos.clientes : ...`, y registrarVersiones, que ya
   ignoraba lo que no fuera un arreglo) — lo único que había que ajustar era
   el veredicto de "vacía": antes de este cambio, cl/si/po SIEMPRE eran un
   arreglo (nunca null, porque listarNube a secas o resolvía o tiraba), así
   que `!cl.length` nunca podía confundirse con un fallo de red. Ahora que
   SÍ pueden ser null, el veredicto exige primero que las tres hayan
   contestado de verdad (`cl && si && po`) antes de considerar "vacía" —
   si no, un timeout pasajero en cualquiera de las tres se leería igual
   que un Firestore recién creado y vacío, y dispararía subirTodo() por
   error encima de un servidor que en realidad sí tenía datos.

   Nota de infraestructura de la prueba: page.route() de Playwright no
   intercepta de forma confiable las peticiones reales a
   firestore.googleapis.com en este sandbox (salen por un proxy de salida
   a nivel de red que no pasa por la capa que Playwright puede interceptar
   — confirmado con una prueba mínima: un fetch() directo a Firestore con
   un token falso, con page.route ya registrado, llegó de verdad al
   servidor real y contestó 401, en vez de que Playwright lo interceptara).
   Para no arriesgarse a tocar el Firestore real de producción con tokens
   falsos, esta prueba sustituye window.fetch DENTRO de la página
   (page.addInitScript, antes de que cargue index.html) en vez de usar
   page.route() — así nunca sale una sola petición real por la red. */
const { chromium } = require('playwright');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
const chk = (label, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' - ' + label); return cond; };
let fallas = 0;
const chkF = (label, cond) => { if(!chk(label, cond)) fallas++; };

(async () => {
  const browser = await chromium.launch(OPCIONES_NAVEGADOR);
  const context = await browser.newContext();
  const page = await context.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push('PAGEERROR: ' + e.message));

  await page.addInitScript(() => {
    const fetchReal = window.fetch.bind(window);
    window.__fallaColeccion = null;      // ej. 'levantamientos' o 'polizas'
    window.__permisoNegadoColeccion = null;
    window.fetch = (url, opciones) => {
      const u = String(url);
      if(/identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com/.test(u)){
        return Promise.resolve(new Response('{}', { status:200, headers:{'Content-Type':'application/json'} }));
      }
      if(/firestore\.googleapis\.com/.test(u)){
        if(window.__fallaColeccion && u.includes('/documents/' + window.__fallaColeccion)){
          return Promise.reject(new TypeError('Failed to fetch (simulado por la prueba)'));
        }
        if(window.__permisoNegadoColeccion && u.includes('/documents/' + window.__permisoNegadoColeccion)){
          return Promise.resolve(new Response('{"error":{"message":"PERMISSION_DENIED"}}', { status:403, headers:{'Content-Type':'application/json'} }));
        }
        return Promise.resolve(new Response('{"documents":[]}', { status:200, headers:{'Content-Type':'application/json'} }));
      }
      return fetchReal(url, opciones);
    };
  });

  await page.goto(URL_BASE + '/index.html');
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    sesion.correo='owner@a.com'; sesion.uid='u-owner'; sesion.idToken='FAKE'; sesion.refreshToken='F2';
    sesion.expira=Date.now()+3600000; sesion.rol='owner'; sesion.nombre='Victor Owner';
    ocultarAcceso();
    datos.levantamientos = [normalizarLevantamiento({ id:'l-local', clienteId:'c1', sitioNombre:'Sitio local', fecha:'2026-09-01' })];
  });

  // --------- 1) Un fallo de red en "levantamientos" NO tumba bajarDeLaNube() ---------
  const resultado = await page.evaluate(async () => {
    window.__fallaColeccion = 'levantamientos';
    try{
      const r = await bajarDeLaNube();
      return { ok: true, veredicto: r, levantamientosLocales: datos.levantamientos.map(l => l.id) };
    }catch(e){
      return { ok: false, error: String(e && e.message || e) };
    }
  });
  chkF('bajarDeLaNube() NO lanza excepción aunque "levantamientos" haya fallado por red', resultado.ok === true);
  chkF('El levantamiento LOCAL se conserva tal cual (la colección fallida no se vacía)',
    resultado.ok && JSON.stringify(resultado.levantamientosLocales) === JSON.stringify(['l-local']));

  // --------- 2) El resto de colecciones (sin fallo) sí se actualiza con normalidad ---------
  const sinTocarLoDemas = await page.evaluate(() => ({
    clientes: datos.clientes.length, sitios: datos.sitios.length, polizas: datos.polizas.length
  }));
  chkF('Las colecciones que SÍ contestaron se actualizan con normalidad (quedan vacías, como mandó el servidor)',
    sinTocarLoDemas.clientes === 0 && sinTocarLoDemas.sitios === 0 && sinTocarLoDemas.polizas === 0);

  // --------- 3) El veredicto de "vacía" sigue funcionando cuando las 3 colecciones
  //              núcleo SÍ contestan y de verdad están vacías (regresión) ---------
  const veredictoVacia = await page.evaluate(() => {
    window.__fallaColeccion = null;
    datos.clientes = [normalizarCliente({ id:'c-viejo', nombre:'Cliente que ya existía local' })];
    return bajarDeLaNube();
  });
  chkF('Con clientes/sitios/polizas realmente vacíos en el servidor Y datos locales previos, el veredicto sigue siendo "vacia"',
    veredictoVacia === 'vacia');

  // --------- 4) Un fallo de red en UNA de las 3 colecciones núcleo NUNCA se confunde con "vacia" ---------
  const veredictoConFallo = await page.evaluate(() => {
    window.__fallaColeccion = 'polizas';
    return bajarDeLaNube();
  });
  chkF('Con "pólizas" fallando por red (no confirmada vacía de verdad), el veredicto NO es "vacia"',
    veredictoConFallo !== 'vacia');

  // --------- 5) Un 403 de permisos real SIGUE tumbando el arranque (no se absorbe) ---------
  const conPermisoNegado = await page.evaluate(async () => {
    window.__fallaColeccion = null;
    window.__permisoNegadoColeccion = 'clientes';
    try{ await bajarDeLaNube(); return { ok:true }; }
    catch(e){ return { ok:false, error: String(e && e.message || e) }; }
  });
  chkF('Un 403 real (no un timeout) SIGUE propagándose como error — listarNubeResiliente no absorbe permisos, solo red',
    conPermisoNegado.ok === false && /SIN_PERMISO/.test(conPermisoNegado.error));

  chkF('No hubo errores de página en todo el escenario', errores.length === 0);
  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
