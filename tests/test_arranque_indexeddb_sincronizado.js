/* Al refrescar, Resultados "se movía" de un total incompleto a uno
   completo ~20 segundos después (30-sep-2026, reporte real de Victor con
   capturas: Ingresos Totales pasaba de $3,865,238 a $7,665,308 solo).

   Diagnóstico (investigación previa, sin cambios de código): el primer
   render() al arrancar pinta con lo que haya en localStorage, SIN esperar
   la red — pero esa copia puede estar vieja de verdad (días o semanas):
   desde que la base creció tanto que ni la copia sin fotos cabe ya en
   localStorage, el navegador deja de aceptar guardados nuevos ahí y se
   queda con lo último que sí cupo. Mientras tanto, guardarLocal() SIEMPRE
   manda además una copia COMPLETA y fresca a IndexedDB cuando la de
   localStorage no cupo — pero esa copia de IndexedDB antes solo se leía
   sin internet, nunca en un arranque normal con nube. El segundo render(),
   ~20 segundos después, es cuando bajarDeLaNube() por fin termina de traer
   TODO de la nube (paginado, cientos/miles de registros).

   Arreglo: restaurarSnapshotIndexedDB() ahora también se llama justo
   después del primer render() en el arranque CON nube — como es una
   lectura de disco local (milisegundos), corrige el hueco mucho antes de
   que termine bajarDeLaNube(). Un candado `sincronizado` evita que esto
   pise datos ya frescos de la nube si por algún motivo tardara más que
   ella. De paso, la pastilla de "Guardado en la nube" ahora dice
   "Actualizando…" mientras `sincronizado` sigue en false, para no dar a
   entender que el número en pantalla ya es el final. */
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

  // --------- 1) La pastilla dice "Actualizando…" mientras no ha terminado la primera bajada ---------
  await page.evaluate(() => {
    sincronizado = false; cola = []; colaRechazada = []; intentosFallidos = 0;
    pintarEstadoNube();
  });
  const textoActualizando = await page.locator('#estadoNube').textContent();
  chkF('Con sincronizado=false, la pastilla dice "Actualizando…"', /Actualizando/.test(textoActualizando));

  // --------- 2) En cuanto sincronizado pasa a true, vuelve a decir "Guardado en la nube" ---------
  await page.evaluate(() => { sincronizado = true; pintarEstadoNube(); });
  const textoGuardado = await page.locator('#estadoNube').textContent();
  chkF('Con sincronizado=true, la pastilla vuelve a decir "Guardado en la nube"', /Guardado en la nube/.test(textoGuardado));
  chkF('...y ya NO dice "Actualizando…"', !/Actualizando/.test(textoGuardado));

  // --------- 3) restaurarSnapshotIndexedDB() SÍ corrige datos si sincronizado sigue en false ---------
  const resultado1 = await page.evaluate(async () => {
    sincronizado = false;
    datos.clientes = [ normalizarCliente({ id:'viejo', nombre:'COPIA VIEJA DE LOCALSTORAGE' }) ];
    await guardarSnapshotIndexedDB({
      v:1, clientes:[ normalizarCliente({ id:'fresco', nombre:'COPIA FRESCA DE INDEXEDDB' }) ],
      sitios:[], polizas:[], catalogo:[], segmentos:[], parametros:{clientes:[],sitios:[]},
      cotizaciones:[], reportes:[], levantamientos:[], proyectosImagen:[], activos:[],
      personal:[], nominaPersonal:[], proveedores:[], gastosProveedor:[], refacciones:[],
      ordenesCompra:[], visitas:[]
    });
    await restaurarSnapshotIndexedDB();
    return datos.clientes.map(c => c.nombre);
  });
  chkF('Con sincronizado=false, restaurarSnapshotIndexedDB() SÍ reemplaza la copia vieja por la de IndexedDB', resultado1.includes('COPIA FRESCA DE INDEXEDDB') && !resultado1.includes('COPIA VIEJA DE LOCALSTORAGE'));

  // --------- 4) Pero YA NO la toca si sincronizado es true (no pisa datos frescos de la nube) ---------
  const resultado2 = await page.evaluate(async () => {
    sincronizado = true;
    datos.clientes = [ normalizarCliente({ id:'nube', nombre:'COPIA FRESCA DE LA NUBE' }) ];
    await guardarSnapshotIndexedDB({
      v:1, clientes:[ normalizarCliente({ id:'idb-vieja', nombre:'COPIA DE INDEXEDDB, MAS VIEJA QUE LA NUBE' }) ],
      sitios:[], polizas:[], catalogo:[], segmentos:[], parametros:{clientes:[],sitios:[]},
      cotizaciones:[], reportes:[], levantamientos:[], proyectosImagen:[], activos:[],
      personal:[], nominaPersonal:[], proveedores:[], gastosProveedor:[], refacciones:[],
      ordenesCompra:[], visitas:[]
    });
    await restaurarSnapshotIndexedDB();
    return datos.clientes.map(c => c.nombre);
  });
  chkF('Con sincronizado=true, restaurarSnapshotIndexedDB() YA NO toca los datos (no pisa lo que ya bajó la nube)', resultado2.includes('COPIA FRESCA DE LA NUBE') && !resultado2.includes('COPIA DE INDEXEDDB, MAS VIEJA QUE LA NUBE'));

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
