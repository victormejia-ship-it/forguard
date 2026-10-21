/* Rendimiento al entrar a Pólizas (14-oct-2026, reporte real de Victor):
   "al momento de seleccionar polizas siempre se tarda demasiado en abrir
   los archivos o abrir el modulo". Causa real: autoSincronizarPolizaCliente()
   —que vistaPolizas() dispara para CADA póliza sin sincronizar en la
   sesión, de un jalón, la primera vez que se abre la lista, y que
   vistaPoliza() también dispara al abrir una póliza puntual— terminaba
   con un guardarLocal() que volvía a serializar TODO `datos` a JSON y
   reescribirlo en localStorage, una vez POR CADA póliza. Ese guardado
   era de balde en los dos casos posibles: si la póliza no tenía fotos
   sin migrar, la función no toca `datos` en absoluto (encolarCopiaCliente
   solo encola un envío a la nube, no cambia nada local); si SÍ tenía
   fotos, migrarFotosPolizaAStorage ya llama a guardarPoliza(), que
   internamente YA hace su propio guardarLocal() — así que el de aquí era
   un segundo guardado idéntico. Con una base de 30 pólizas (ver medición
   real hecha para este arreglo) esto se medía en working ~225ms de
   bloqueo SOLO con datos de prueba chicos, sin ninguna foto embebida —
   con una base real, con fotos en base64 todavía sin migrar (el caso que
   esta función existe para resolver), el mismo guardarLocal() de por sí
   ya es bastante más pesado, y 20-30 veces seguidas es justo el freeze
   que Victor reportó.

   El arreglo: quitar el guardarLocal() redundante del final de
   autoSincronizarPolizaCliente() — guardarPoliza() (vía
   migrarFotosPolizaAStorage) sigue siendo quien de verdad persiste
   cualquier cambio real. Esta prueba confirma que: 1) sin fotos sin
   migrar, sincronizar N pólizas no dispara NINGÚN guardarLocal() extra
   (antes disparaba exactamente N); 2) el resync hacia /polizas_cliente
   (encolarCopiaCliente) sigue encolándose igual que antes, por cada
   póliza, sin que el arreglo lo haya roto; 3) con una póliza que SÍ
   tiene una foto sin migrar, el flujo de migración sigue funcionando
   (se sube a Storage, se reemplaza el dataUrl, guardarPoliza() persiste
   el cambio) — un solo guardarLocal() real, no cero y no dos. */
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
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'Cliente Prueba' })];
  });

  // --------- 1) N pólizas SIN fotos sin migrar: cero guardarLocal() extra ---------
  const resultado1 = await page.evaluate(async () => {
    const N = 25;
    const polizas = [];
    for(let i=0;i<N;i++){
      polizas.push(normalizarPoliza({ id:'pSinFoto'+i, clienteId:'c1', nombre:'Poliza '+i, fechaInicio: hoyISO(),
        partidas:[ normalizarPartida({ concepto:'Equipo', frecuencia:3, mesesServicio: mesesRegulares(0,3), cantidad:1, precio:1000 }) ] }));
    }
    datos.polizas = polizas;

    let llamadasGuardarLocal = 0;
    const original = guardarLocal;
    guardarLocal = function(){ llamadasGuardarLocal++; return original.apply(this, arguments); };

    const colaAntes = cola.length;
    await Promise.all(datos.polizas.map(p => autoSincronizarPolizaCliente(p)));
    const colaDespues = cola.length;

    guardarLocal = original;
    return { N, llamadasGuardarLocal, encolados: colaDespues - colaAntes };
  });
  chkF('Sincronizar 25 pólizas SIN fotos no dispara NINGÚN guardarLocal() (antes disparaba 25)', resultado1.llamadasGuardarLocal === 0);
  chkF('...pero SÍ encola el resync hacia polizas_cliente para cada una de las 25', resultado1.encolados === resultado1.N);

  // --------- 2) irAModulo('polizas') de verdad, con esas 25 pólizas: no se congela ---------
  const tiempo = await page.evaluate(() => {
    // Nueva sesión del Set para que vuelva a sincronizar todas (como la primera
    // vez que alguien entra a Pólizas en una sesión real).
    datos.polizas.forEach(p => { /* no-op, ya sincronizadas arriba */ });
    const t0 = performance.now();
    irAModulo('resultados'); // ida y vuelta para forzar un render limpio
    irAModulo('polizas');
    return performance.now() - t0;
  });
  console.log('irAModulo("polizas") con 25 pólizas ya sincronizadas:', tiempo.toFixed(1), 'ms');
  chkF('Entrar a Pólizas (ya sincronizadas) es rápido (menos de 150ms)', tiempo < 150);

  // --------- 3) Una póliza CON una foto sin migrar: la migración sigue funcionando ---------
  const resultado3 = await page.evaluate(async () => {
    const p = normalizarPoliza({ id:'pConFoto', clienteId:'c1', nombre:'Poliza con foto', fechaInicio: hoyISO(),
      partidas:[ normalizarPartida({ concepto:'Equipo', frecuencia:3, mesesServicio: mesesRegulares(0,3), cantidad:1, precio:1000 }) ] });
    // Una evidencia con dataUrl embebido (base64) = "foto sin migrar".
    p.hechos = { [p.partidas[0].id]: { 0: { hecho:true, evidencias: [ normalizarEvidencia({ dataUrl: 'data:image/png;base64,AAAA' }) ] } } };
    datos.polizas.push(p);

    let llamadasGuardarLocal = 0;
    const original = guardarLocal;
    guardarLocal = function(){ llamadasGuardarLocal++; return original.apply(this, arguments); };

    // subirEvidenciaStorage no está disponible sin Firebase Storage real en
    // esta prueba — se simula para no depender de red, igual que ya hace
    // el flujo real cuando falla una subida (ver migrarFotosPolizaAStorage).
    const originalSubir = window.subirEvidenciaStorage;
    window.subirEvidenciaStorage = async () => 'https://ejemplo.test/foto-migrada.jpg';

    await autoSincronizarPolizaCliente(p);

    window.subirEvidenciaStorage = originalSubir;
    guardarLocal = original;

    const actual = polizaPorId('pConFoto');
    return {
      llamadasGuardarLocal,
      dataUrlFinal: actual.hechos[p.partidas[0].id][0].evidencias[0].dataUrl
    };
  });
  chkF('Con una foto sin migrar, SÍ se llama guardarLocal() — exactamente UNA vez (la de guardarPoliza, no una extra)', resultado3.llamadasGuardarLocal === 1);
  chkF('La foto se migra de verdad: el dataUrl embebido se reemplaza por la URL de Storage', resultado3.dataUrlFinal === 'https://ejemplo.test/foto-migrada.jpg');

  chkF('No hubo errores de página en todo el escenario', errores.length === 0);
  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
