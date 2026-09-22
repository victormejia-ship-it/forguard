/* Auditoría de seguridad externa (22-sep-2026): el JWT/refreshToken vive en
   localStorage y, sin backend propio para pasarlo a una cookie HttpOnly, no
   hay forma de esconderlo de un XSS del todo — pero sí de acotar cuánto le
   sirve a quien lo robe, o a quien encuentre un dispositivo perdido/
   olvidado con la sesión abierta. Victor decidió (22-sep-2026, entre varias
   opciones): mantener la sesión en localStorage tal cual —no perderla solo
   por cerrar la pestaña, algo que le importa a quien trabaja en campo—,
   pero cerrarla sola después de 8 horas sin que la persona TOQUE la app.

   Esta prueba cubre las dos rutas por las que se puede disparar ese cierre:
   1) Se abre la pestaña/el navegador después de más de 8h sin actividad
      (revisado al arrancar, antes de intentar renovar el token).
   2) La pestaña se queda abierta y pasan más de 8h sin actividad mientras
      sigue ahí (revisado por el mismo reloj que ya vigilaba bloqueos de
      cuenta, revisarCuenta() / VIGILAR_CUENTA_MS). */
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

  // --------- 1) sesionInactivaDemasiado() ---------
  const calculo = await page.evaluate(() => {
    sesion.ultimaActividad = Date.now();
    const reciente = sesionInactivaDemasiado();
    sesion.ultimaActividad = Date.now() - (9 * 60 * 60 * 1000); // 9h — pasado el límite de 8h
    const vieja = sesionInactivaDemasiado();
    sesion.ultimaActividad = 0; // nunca se marcó (sesión recién restaurada de una versión sin este campo)
    const sinMarca = sesionInactivaDemasiado();
    return { reciente, vieja, sinMarca };
  });
  chkF('Actividad reciente: NO se considera inactiva', calculo.reciente === false);
  chkF('Actividad de hace 9 horas: SÍ se considera inactiva (límite: 8h)', calculo.vieja === true);
  chkF('Sin ninguna marca de actividad todavía: no truena, no fuerza un cierre falso', calculo.sinMarca === false);

  // --------- 2) marcarActividad() actualiza el reloj y SÍ persiste a localStorage ---------
  await page.evaluate(() => {
    sesion.correo='tec@a.com'; sesion.uid='u-t'; sesion.idToken='FAKE'; sesion.refreshToken='F2';
    sesion.expira=Date.now()+3600000; sesion.rol='tecnico'; sesion.nombre='Juan';
    sesion.ultimaActividad = 0;
    marcarActividad();
  });
  const trasMarcar = await page.evaluate(() => {
    const guardado = JSON.parse(localStorage.getItem(LLAVE_SESION) || '{}');
    return { enMemoria: sesion.ultimaActividad, enStorage: guardado.ultimaActividad };
  });
  chkF('marcarActividad() SÍ actualiza sesion.ultimaActividad', trasMarcar.enMemoria > 0);
  chkF('marcarActividad() SÍ lo persiste a localStorage (primera vez, sin throttle que lo detenga)', trasMarcar.enStorage > 0);

  // --------- 3) Un click de verdad también marca actividad (el listener global está conectado) ---------
  await page.evaluate(() => { sesion.ultimaActividad = 0; });
  await page.mouse.click(5, 5);
  await page.waitForTimeout(100);
  const trasClick = await page.evaluate(() => sesion.ultimaActividad);
  chkF('Un click en la página SÍ dispara marcarActividad() (listener global de click)', trasClick > 0);

  // --------- 4) revisarCuenta() cierra la sesión si ya pasó el límite, SIN preguntarle nada a Firestore ---------
  let firestoreConsultado = false;
  await page.route('**firestore.googleapis.com/**', route => {
    firestoreConsultado = true;
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.evaluate(() => {
    sesion.correo='tec2@a.com'; sesion.uid='u-t2'; sesion.idToken='FAKE'; sesion.refreshToken='F2';
    sesion.expira=Date.now()+3600000; sesion.rol='tecnico'; sesion.nombre='Ana';
    sesion.ultimaActividad = Date.now() - (9 * 60 * 60 * 1000);
    ocultarAcceso();
  });
  await page.evaluate(() => revisarCuenta());
  await page.waitForTimeout(150);
  const trasRevisar = await page.evaluate(() => ({
    haySesion: haySesion(),
    accesoAbierto: document.getElementById('acceso').classList.contains('abierto'),
    mensaje: document.getElementById('accesoError').textContent,
  }));
  chkF('revisarCuenta() SÍ cierra la sesión cuando ya se pasó el límite de inactividad', trasRevisar.haySesion === false);
  chkF('Se muestra la pantalla de acceso, con el motivo (inactividad)', trasRevisar.accesoAbierto && /inactividad/i.test(trasRevisar.mensaje));
  chkF('No hizo falta gastar una lectura de Firestore para decidir el cierre por inactividad', firestoreConsultado === false);

  // --------- 5) Arranque: una sesión guardada de hace más de 8h NO se restaura sola ---------
  await page.evaluate(() => {
    localStorage.setItem(LLAVE_SESION, JSON.stringify({
      correo:'viejo@a.com', uid:'u-viejo', idToken:'FAKE', refreshToken:'F2',
      expira: Date.now() + 3600000, rol:'viewer', nombre:'Viejo Usuario',
      telefono:'', clienteId:'', sitioIds:[],
      ultimaActividad: Date.now() - (9 * 60 * 60 * 1000),
    }));
  });
  await page.reload();
  await page.waitForTimeout(500);
  const trasArranque = await page.evaluate(() => ({
    haySesion: haySesion(),
    accesoAbierto: document.getElementById('acceso').classList.contains('abierto'),
    mensaje: document.getElementById('accesoError').textContent,
  }));
  chkF('Al abrir la app con una sesión guardada de hace más de 8h, NO se restaura sola', trasArranque.haySesion === false);
  chkF('Se manda directo a la pantalla de acceso con el motivo (inactividad), sin intentar renovar el token', trasArranque.accesoAbierto && /inactividad/i.test(trasArranque.mensaje));

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
