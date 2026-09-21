/* Veredicto de auditoría (21-sep-2026), hallazgo crítico (3 d-p): "El
   técnico captura mantenimientos que el servidor rechaza: se borran solos y
   las fotos quedan huérfanas". Causa raíz: vaciarCola() sacaba el cambio de
   `cola` con solo un toast cuando el servidor lo rechazaba para siempre
   (SIN_PERMISO o ERROR_PERMANENTE), pero el registro seguía vivo en `datos`
   en memoria; en cuanto la cola quedaba vacía, el refresco automático de
   30s (refrescarDesdeNube → bajarDeLaNube) REEMPLAZABA `datos` entero con
   la copia del servidor — donde ese registro nunca llegó a existir. Así
   "se borraba solo" sin que nadie lo borrara a propósito, dejando huérfanas
   las fotos que ya se habían subido a Storage antes del guardado.
   Este test cubre las tres partes del arreglo: 1) el rechazo queda anotado
   en una cola persistente (colaRechazada), 2) un refresco de la nube ya NO
   se lleva entre las patas un registro con rechazo pendiente, y 3) se puede
   revisar y descartar el aviso a mano desde modalCambiosRechazados(). */
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
  await page.route('**identitytoolkit.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**securetoken.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**firestore.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.goto(URL_BASE + '/index.html');
  await page.waitForTimeout(400);

  const resultado = await page.evaluate(async () => {
    sesion.correo='tecnico@a.com'; sesion.uid='u-tec'; sesion.idToken='FAKE'; sesion.refreshToken='F2';
    sesion.expira=Date.now()+3600000; sesion.rol='tecnico'; sesion.nombre='Juan Técnico';
    ocultarAcceso();

    colaRechazada = []; guardarColaRechazada();
    cola = []; guardarCola();

    datos.clientes = [normalizarCliente({ id:'c1', nombre:'NGK' })];
    datos.sitios = [normalizarSitio({ id:'s1', clienteId:'c1', nombre:'Planta 1' })];
    datos.reportes = [normalizarReporte({ id:'r1', folio:'TK-0001', sitioId:'s1', sitioNombre:'Planta 1',
      titulo:'Fuga de gas', tecnicos:[{ uid:'u-tec', nombre:'Juan Técnico' }] })];

    /* El servidor rechaza justo este documento —simula el 1 MiB de Firestore
       pasado, o una regla que no cuadra— sin tocar la red real. */
    const originalEscribir = window.escribirNube;
    window.escribirNube = async (coleccion, id, obj) => {
      if(coleccion === 'reportes' && id === 'r1') throw new Error('ERROR_PERMANENTE: HTTP 400 documento excede 1 MiB');
      return originalEscribir(coleccion, id, obj);
    };

    guardarReporte(datos.reportes[0], 'probó', 'x');
    await new Promise(r => setTimeout(r, 400));

    const trasRechazo = {
      colaLen: cola.length,
      rechazadosLen: colaRechazada.length,
      rechazado: colaRechazada[0] ? { coleccion: colaRechazada[0].coleccion, id: colaRechazada[0].id } : null,
      persistido: JSON.parse(localStorage.getItem('forguard_forpass_rechazados_v1') || '[]').length,
      pillTexto: document.getElementById('estadoNube').textContent,
      todaviaEnDatos: datos.reportes.some(r => r.id === 'r1')
    };

    /* Ahora un refresco completo de la nube: el servidor sigue sin conocer a
       r1 (nunca llegó a guardarse), pero SÍ tiene clientes/sitios —así
       bajarDeLaNube() no se detiene en el atajo de "servidor vacío" y de
       verdad reconstruye `datos` desde cero, el escenario real del bug. */
    window.escribirNube = originalEscribir;
    const originalListar = window.listarNube;
    window.listarNube = async (coleccion) => {
      if(coleccion === 'clientes') return [datos.clientes[0]];
      if(coleccion === 'sitios') return [datos.sitios[0]];
      return [];
    };
    await bajarDeLaNube();
    window.listarNube = originalListar;

    const trasRefresco = {
      siguesTeniendoElReporte: datos.reportes.some(r => r.id === 'r1'),
      rechazadosLenSigue: colaRechazada.length
    };

    /* Revisar y descartar a mano desde el modal. */
    modalCambiosRechazados();
    const modalTexto = document.getElementById('modalCuerpo').textContent;
    const hayBotonDescartar = !!document.querySelector('[data-descartar-rechazo]');
    document.querySelector('[data-descartar-rechazo]').click();

    const trasDescartar = {
      rechazadosLen: colaRechazada.length,
      persistido: JSON.parse(localStorage.getItem('forguard_forpass_rechazados_v1') || '[]').length,
      pillTexto: document.getElementById('estadoNube').textContent
    };

    return { trasRechazo, trasRefresco, modalTexto, hayBotonDescartar, trasDescartar };
  });

  console.log(JSON.stringify(resultado, null, 2));

  chkF('El rechazo definitivo SÍ se saca de la cola normal (no se atora reintentando)', resultado.trasRechazo.colaLen === 0);
  chkF('El rechazo SÍ queda anotado en colaRechazada', resultado.trasRechazo.rechazadosLen === 1);
  chkF('La anotación es del registro correcto (reportes/r1)',
    resultado.trasRechazo.rechazado && resultado.trasRechazo.rechazado.coleccion === 'reportes' && resultado.trasRechazo.rechazado.id === 'r1');
  chkF('El rechazo SÍ sobrevive en localStorage (no se pierde si se cierra la pestaña)', resultado.trasRechazo.persistido === 1);
  chkF('La pastilla de estado muestra el aviso persistente de rechazo', resultado.trasRechazo.pillTexto.includes('1 cambio rechazado'));
  chkF('El reporte sigue en datos.reportes justo después del rechazo', resultado.trasRechazo.todaviaEnDatos === true);

  chkF('Tras un refresco completo de la nube, el reporte YA NO se borra solo', resultado.trasRefresco.siguesTeniendoElReporte === true);
  chkF('El aviso de rechazo sigue pendiente después del refresco (nadie lo ha revisado)', resultado.trasRefresco.rechazadosLenSigue === 1);

  chkF('El modal de revisión SÍ muestra el folio del registro rechazado', resultado.modalTexto.includes('TK-0001'));
  chkF('El modal de revisión SÍ trae un botón para descartar', resultado.hayBotonDescartar === true);
  chkF('Al descartar, colaRechazada queda vacía', resultado.trasDescartar.rechazadosLen === 0);
  chkF('Al descartar, también se limpia de localStorage', resultado.trasDescartar.persistido === 0);
  chkF('La pastilla de estado vuelve a la normalidad tras descartar', !resultado.trasDescartar.pillTexto.includes('rechazado'));

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
