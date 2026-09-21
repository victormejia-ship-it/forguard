/* Veredicto de auditoría (21-sep-2026), hallazgo crítico (2 d-p, Funcional):
   "La pantalla del técnico truena desde la segunda vez que abre la app: no
   permite entrar nuevamente, los perfiles no los completa". Victor lo aclaró:
   pasa cuando el técnico entra en su dispositivo y alguna otra sesión no
   deja entrar de nuevo, y los perfiles quedan incompletos.

   Encontré DOS causas raíz distintas, las dos en el mismo terreno (sesión /
   cambio de cuenta en un dispositivo compartido entre técnicos):

   1) limpiarSesionYDatos() y salirSilencioso(true) —los dos caminos de
      "cerrar sesión"— reconstruían `datos` a mano y se les habían quedado
      afuera 4 de 18 colecciones (proveedores, gastosProveedor, refacciones,
      ordenesCompra), pese a que el propio comentario de limpiarSesionYDatos
      decía "TODAS las colecciones". En un dispositivo compartido, cerrar
      sesión y que otro técnico entre dejaba esas 4 colecciones undefined
      hasta que bajarDeLaNube() alcanzara a repoblarlas.

   2) El formulario de acceso: si entrar()+cargarPerfil() SÍ pasaban (cuenta
      y perfil válidos) pero arrancarNube() fallaba después —típico con señal
      intermitente—, ocultarAcceso() ya había escondido el formulario, y el
      error se escribía en un <div> invisible: la persona se quedaba varada,
      sin perfil completo del todo y sin ningún botón para reintentar. */
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

  const colecciones = ['clientes','sitios','polizas','catalogo','segmentos','cotizaciones','reportes',
    'levantamientos','proyectosImagen','activos','personal','proveedores','gastosProveedor',
    'refacciones','ordenesCompra','visitas'];

  // --------- 1) Cerrar sesión en un dispositivo compartido deja TODAS las colecciones ---------
  const resultadoLimpieza = await page.evaluate((colecciones) => {
    limpiarSesionYDatos();
    const limpiarOk = colecciones.every(c => Array.isArray(datos[c]));

    /* Simula que había datos de otro técnico antes, y que a ESTE lo bloquean
       al intentar entrar (mismo camino que "BLOQUEADO" en formAcceso). */
    datos.proveedores = [{ id:'p1' }];
    salirSilencioso(true);
    const salirOk = colecciones.every(c => Array.isArray(datos[c]));

    return { limpiarOk, salirOk };
  }, colecciones);
  chkF('limpiarSesionYDatos() SÍ deja las 16 colecciones como array (ninguna undefined)', resultadoLimpieza.limpiarOk === true);
  chkF('salirSilencioso(true) SÍ deja las 16 colecciones como array (ninguna undefined)', resultadoLimpieza.salirOk === true);

  // --------- 2) entrar()+cargarPerfil() válidos, pero arrancarNube() falla después ---------
  const resultadoLogin = await page.evaluate(async () => {
    const originalEntrar = window.entrar;
    const originalArrancarNube = window.arrancarNube;
    window.entrar = async (correo) => {
      sesion.correo = correo; sesion.uid = 'u-tec'; sesion.idToken = 'FAKE'; sesion.refreshToken = 'F2';
      sesion.expira = Date.now() + 3600000; sesion.rol = 'tecnico'; sesion.nombre = 'Juan Técnico';
      guardarSesion();
    };
    window.arrancarNube = async () => { throw new Error('Tiempo de espera agotado.'); };

    document.getElementById('toast').classList.remove('visible');
    $('aCorreo').value = 'tecnico@a.com';
    $('aClave').value = 'x';
    $('formAcceso').dispatchEvent(new Event('submit', { cancelable:true, bubbles:true }));
    /* mostrarCargando()/ocultarCargando() corren DENTRO del try/finally antes
       de que el catch reciba el error de arrancarNube() — CARGA_MINIMA_MS
       (1.6s) más ~700ms de "vuelo" del logo. Hay que esperar más que eso. */
    await new Promise(r => setTimeout(r, 3200));

    const salida = {
      accesoAbierto: document.getElementById('acceso').classList.contains('abierto'),
      toastVisible: document.getElementById('toast').classList.contains('visible'),
      toastTexto: document.getElementById('toast').textContent,
      sigueConSesionValida: haySesion() && sesion.rol === 'tecnico' && sesion.nombre === 'Juan Técnico',
      botonReactivado: !$('aEntrar').disabled
    };

    window.entrar = originalEntrar;
    window.arrancarNube = originalArrancarNube;
    return salida;
  });

  chkF('El formulario de acceso NO se queda reabierto innecesariamente (la cuenta sí es válida)', resultadoLogin.accesoAbierto === false);
  chkF('Se avisa con un toast VISIBLE en vez de un error escondido', resultadoLogin.toastVisible === true);
  chkF('El toast explica que se sigue trabajando con la copia local', /copia local|conexión|servidor/i.test(resultadoLogin.toastTexto));
  chkF('El perfil del técnico queda completo (rol y nombre sí se guardaron)', resultadoLogin.sigueConSesionValida === true);
  chkF('El botón "Entrar" no se queda deshabilitado para siempre', resultadoLogin.botonReactivado === true);

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
