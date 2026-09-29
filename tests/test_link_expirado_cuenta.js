/* "Link expirado" al reenviar el correo de contraseña (29-sep-2026, reporte
   de Victor con captura de pantalla): a Rubén Olvera Martínez "no le permite
   entrar", el equipo le dio "reenviar el correo" y tampoco funcionó —
   Firebase mostró su pantalla genérica en inglés "Try resetting your
   password again... expired or the link has already been used".

   Diagnóstico: los 3 botones que mandan ese correo (olvidé mi contraseña en
   el login, "Mandarle correo..." al editar una cuenta desde Admin, y "pide
   un correo para cambiarla" en Mi perfil) llamaban a sendOobCode() SIN
   continueUrl/canHandleCodeInApp — el enlace caía en la página genérica de
   Firebase (*.firebaseapp.com/__/auth/action), donde no hay control de
   cuándo se valida el oobCode. Si se pidió el correo más de una vez (el más
   nuevo invalida al anterior) o si el antivirus de correo de la empresa
   "abre" el link antes que la persona, ese código ya aparece "usado" al
   primer clic real.

   Arreglo en dos piezas:
   1) index.html: los 3 sendOobCode ahora mandan continueUrl (apuntando a
      docs/accion_cuenta.html, calculado por urlAccionCuenta()) y
      canHandleCodeInApp:true, así el correo lleva DIRECTO a nuestra propia
      pantalla en vez de la de Firebase.
   2) docs/accion_cuenta.html (nueva): pantalla en español que NO llama a
      Firebase con el oobCode con solo abrirla — solo lo hace hasta que la
      persona ya escribió su contraseña nueva dos veces y le dio "Guardar".
      Así, un antivirus de correo que solo visita el link (sin llenar ni
      enviar el formulario) no gasta nada. */
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

  // --------- 1) urlAccionCuenta() apunta al lugar correcto ---------
  const url = await page.evaluate(() => urlAccionCuenta());
  chkF('urlAccionCuenta() apunta a docs/accion_cuenta.html junto al index.html', url === URL_BASE + '/docs/accion_cuenta.html');

  // --------- 2) Los 3 botones de "mandar correo" mandan continueUrl + canHandleCodeInApp ---------
  await page.evaluate(() => {
    sesion.correo='owner@a.com'; sesion.uid='u-owner'; sesion.idToken='FAKE'; sesion.refreshToken='F2';
    sesion.expira=Date.now()+3600000; sesion.rol='owner'; sesion.nombre='Victor Owner';
    ocultarAcceso();
    admin.usuarios = [{ id:'u-rc', correo:'ruben.olvera.martinez.forguard@gmail.com', nombre:'Rubén Olvera Martínez', rol:'tecnico', activo:true, telefono:'8117990842' }];
  });

  async function interceptarPedirAuth(){
    await page.evaluate(() => {
      window.__pedirAuthOriginal = window.pedirAuth;
      window.__cuerpoSendOobCode = null;
      window.pedirAuth = async (metodo, cuerpo) => {
        if(metodo === 'sendOobCode') window.__cuerpoSendOobCode = cuerpo;
        return {};
      };
    });
  }
  async function restaurarPedirAuth(){
    return page.evaluate(() => {
      window.pedirAuth = window.__pedirAuthOriginal;
      return window.__cuerpoSendOobCode;
    });
  }

  await interceptarPedirAuth();
  await page.evaluate(() => {
    modalEditarUsuario('u-rc');
    document.getElementById('btnResetearClave').click();
  });
  await page.waitForTimeout(150);
  await page.evaluate(() => document.querySelector('[data-modal="cancelar"]').click());
  const desdeEditarCuenta = await restaurarPedirAuth();
  chkF('Editar cuenta → "Mandarle correo...": manda continueUrl a docs/accion_cuenta.html', !!desdeEditarCuenta && /docs\/accion_cuenta\.html$/.test(desdeEditarCuenta.continueUrl));
  chkF('Editar cuenta → "Mandarle correo...": manda canHandleCodeInApp:true', !!desdeEditarCuenta && desdeEditarCuenta.canHandleCodeInApp === true);
  chkF('Editar cuenta → "Mandarle correo...": sigue mandando el correo correcto', !!desdeEditarCuenta && desdeEditarCuenta.email === 'ruben.olvera.martinez.forguard@gmail.com');

  await interceptarPedirAuth();
  await page.evaluate(() => {
    modalPerfil();
    document.getElementById('pfPorCorreo').click();
  });
  await page.waitForTimeout(150);
  const desdeMiPerfil = await restaurarPedirAuth();
  chkF('Mi perfil → "pide un correo para cambiarla": manda continueUrl a docs/accion_cuenta.html', !!desdeMiPerfil && /docs\/accion_cuenta\.html$/.test(desdeMiPerfil.continueUrl));
  chkF('Mi perfil → "pide un correo para cambiarla": manda canHandleCodeInApp:true', !!desdeMiPerfil && desdeMiPerfil.canHandleCodeInApp === true);

  await page.evaluate(() => cerrarModal());
  await page.evaluate(() => { salirSilencioso(true); mostrarFormAcceso(); });
  await page.waitForTimeout(150);

  await interceptarPedirAuth();
  await page.evaluate(() => {
    document.getElementById('aCorreo').value = 'alguien@ejemplo.com';
    document.getElementById('aOlvide').click();
  });
  await page.waitForTimeout(150);
  const desdeOlvide = await restaurarPedirAuth();
  chkF('Login → "¿Olvidaste tu contraseña?": manda continueUrl a docs/accion_cuenta.html', !!desdeOlvide && /docs\/accion_cuenta\.html$/.test(desdeOlvide.continueUrl));
  chkF('Login → "¿Olvidaste tu contraseña?": manda canHandleCodeInApp:true', !!desdeOlvide && desdeOlvide.canHandleCodeInApp === true);

  // --------- 3) La pantalla propia docs/accion_cuenta.html: enlace sin datos ---------
  const solicitudes = [];
  await page.route('**identitytoolkit.googleapis.com/**', route => {
    solicitudes.push({ url: route.request().url(), body: route.request().postDataJSON() });
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"email":"ruben.olvera.martinez.forguard@gmail.com"}' });
  });

  await page.goto(URL_BASE + '/docs/accion_cuenta.html');
  await page.waitForTimeout(200);
  chkF('Sin mode/oobCode: muestra "enlace no reconocido"', /no reconocido/i.test(await page.locator('#caja').textContent()));
  chkF('Sin mode/oobCode: trae un link de vuelta a Forguard', await page.locator('#caja a').count() >= 1);

  // --------- 4) Con datos válidos: el formulario aparece y NO llama a Firebase con solo abrir ---------
  solicitudes.length = 0;
  await page.goto(URL_BASE + '/docs/accion_cuenta.html?mode=resetPassword&oobCode=CODIGO-DE-PRUEBA&apiKey=FAKEKEY');
  await page.waitForTimeout(250);
  chkF('Con mode=resetPassword+oobCode: aparece el formulario de contraseña nueva', await page.locator('#clave1').count() === 1 && await page.locator('#clave2').count() === 1);
  chkF('Con solo ABRIR el enlace (sin enviar el formulario) NO se llamó a Firebase — el oobCode no se gasta solo — punto central del arreglo',
    solicitudes.length === 0);

  // --------- 5) Validaciones en el cliente: tampoco llaman a Firebase ---------
  await page.fill('#clave1', 'corta');
  await page.fill('#clave2', 'corta');
  await page.click('#btnGuardar');
  await page.waitForTimeout(150);
  chkF('Contraseña muy corta: se rechaza sin llamar a Firebase', solicitudes.length === 0 && /al menos 12/i.test(await page.locator('.error-caja').textContent()));

  await page.fill('#clave1', 'contraseña-larga-uno');
  await page.fill('#clave2', 'contraseña-larga-DOS');
  await page.click('#btnGuardar');
  await page.waitForTimeout(150);
  chkF('Las dos contraseñas no coinciden: se rechaza sin llamar a Firebase', solicitudes.length === 0 && /no coinciden/i.test(await page.locator('.error-caja').textContent()));

  // --------- 6) Envío válido: UNA sola llamada a resetPassword, con el oobCode de la URL ---------
  await page.fill('#clave1', 'contraseña-larga-nueva');
  await page.fill('#clave2', 'contraseña-larga-nueva');
  await page.click('#btnGuardar');
  await page.waitForTimeout(200);
  chkF('Al guardar: se hizo exactamente UNA llamada a Firebase', solicitudes.length === 1);
  chkF('La llamada fue a accounts:resetPassword', solicitudes.length === 1 && /accounts:resetPassword/.test(solicitudes[0].url));
  chkF('La llamada llevó el oobCode de la URL y la contraseña escrita', solicitudes.length === 1
    && solicitudes[0].body.oobCode === 'CODIGO-DE-PRUEBA' && solicitudes[0].body.newPassword === 'contraseña-larga-nueva');
  chkF('Tras guardar: pantalla de éxito con link de vuelta a Forguard', /actualizada/i.test(await page.locator('#caja').textContent()));

  // --------- 7) Enlace vencido o ya usado: mensaje en español, no el genérico de Firebase ---------
  await page.route('**identitytoolkit.googleapis.com/**', route => {
    solicitudes.push({ url: route.request().url(), body: route.request().postDataJSON() });
    route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error:{ message:'EXPIRED_OOB_CODE' } }) });
  });
  solicitudes.length = 0;
  await page.goto(URL_BASE + '/docs/accion_cuenta.html?mode=resetPassword&oobCode=VIEJO&apiKey=FAKEKEY');
  await page.waitForTimeout(200);
  await page.fill('#clave1', 'contraseña-larga-otra');
  await page.fill('#clave2', 'contraseña-larga-otra');
  await page.click('#btnGuardar');
  await page.waitForTimeout(200);
  const txtVencido = await page.locator('.error-caja').textContent();
  chkF('EXPIRED_OOB_CODE: mensaje en español explicando qué pasó (no el "expired" de Firebase en inglés)', /venci/i.test(txtVencido) && !/expired/i.test(txtVencido));

  await page.route('**identitytoolkit.googleapis.com/**', route => {
    route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error:{ message:'INVALID_OOB_CODE' } }) });
  });
  await page.goto(URL_BASE + '/docs/accion_cuenta.html?mode=resetPassword&oobCode=REPETIDO&apiKey=FAKEKEY');
  await page.waitForTimeout(200);
  await page.fill('#clave1', 'contraseña-larga-otra-vez');
  await page.fill('#clave2', 'contraseña-larga-otra-vez');
  await page.click('#btnGuardar');
  await page.waitForTimeout(200);
  const txtInvalido = await page.locator('.error-caja').textContent();
  chkF('INVALID_OOB_CODE: explica que puede ser por pedir el correo más de una vez o por el filtro de correo de la empresa', /ya se usó|ya no es válido/i.test(txtInvalido));

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
