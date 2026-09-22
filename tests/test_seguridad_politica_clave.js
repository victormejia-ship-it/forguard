/* Auditoría de seguridad externa (22-sep-2026, con otra IA):

   1) "Política de contraseña... Mínimo 6 caracteres... para una plataforma
      con acceso a clientes, reportes, pólizas, cotizaciones, activos y
      proveedores, esta política es débil." — se subió a 12 para cualquier
      cuenta y 15 para Owner/Admin (ver minimoClave() en index.html), en las
      4 pantallas que piden una contraseña.

   2) "Recuperación de contraseña... debe evitar enumeración de usuarios.
      La respuesta debe ser genérica tanto si el correo existe como si no."
      — antes, pedir el correo de recuperación a un correo SIN cuenta
      (EMAIL_NOT_FOUND) mostraba un error distinto al de un correo CON
      cuenta (que mostraba "Te mandamos un correo..."), delatando qué
      correos tienen cuenta en Forguard. Ahora las dos respuestas son
      idénticas. */
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

  // --------- 1) minimoClave() y claveSugerida() ---------
  const politica = await page.evaluate(() => {
    const sugeridas = Array.from({length: 30}, () => claveSugerida());
    return {
      viewer: minimoClave('viewer'),
      analyst: minimoClave('analyst'),
      tecnico: minimoClave('tecnico'),
      cliente: minimoClave('cliente'),
      admin: minimoClave('admin'),
      owner: minimoClave('owner'),
      sugeridaMinLen: Math.min(...sugeridas.map(s => s.length)),
    };
  });
  chkF('Cuentas normales (viewer/analyst/tecnico/cliente) exigen 12 caracteres',
    politica.viewer === 12 && politica.analyst === 12 && politica.tecnico === 12 && politica.cliente === 12);
  chkF('Owner y Admin exigen 15 caracteres', politica.admin === 15 && politica.owner === 15);
  chkF('La contraseña temporal sugerida siempre alcanza para Owner/Admin (>=15)', politica.sugeridaMinLen >= 15);

  // --------- 2) Enumeración de usuarios en "¿Olvidaste tu contraseña?" ---------
  async function probarOlvide(comportamiento){
    return page.evaluate(async (comportamiento) => {
      const original = window.pedirAuth;
      window.pedirAuth = async () => {
        if(comportamiento === 'no_existe'){
          const e = new Error('Correo o contraseña incorrectos.');
          e.codigoAuth = 'EMAIL_NOT_FOUND';
          throw e;
        }
        if(comportamiento === 'error_real'){
          const e = new Error('No se pudo conectar con el servidor.');
          e.codigoAuth = '';
          throw e;
        }
        return {}; // sí existe: sendOobCode "tiene éxito"
      };
      document.getElementById('toast').classList.remove('visible', 'err');
      $('aCorreo').value = 'alguien@ejemplo.com';
      $('aOlvide').click();
      await new Promise(r => setTimeout(r, 150));
      const salida = {
        errorAcceso: document.getElementById('accesoError').textContent,
        toastTexto: document.getElementById('toast').textContent,
        toastEsError: document.getElementById('toast').classList.contains('err'),
      };
      window.pedirAuth = original;
      return salida;
    }, comportamiento);
  }

  const conCuenta = await probarOlvide('si_existe');
  const sinCuenta = await probarOlvide('no_existe');
  const errorDeVerdad = await probarOlvide('error_real');

  chkF('Correo CON cuenta: no muestra error, muestra el aviso genérico', !conCuenta.errorAcceso && /si existe una cuenta/i.test(conCuenta.toastTexto));
  chkF('Correo SIN cuenta: YA NO delata el error real — muestra el MISMO aviso genérico que uno con cuenta',
    !sinCuenta.errorAcceso && sinCuenta.toastTexto === conCuenta.toastTexto && !sinCuenta.toastEsError);
  chkF('Un error real (de conexión, no de "correo no existe") SÍ se sigue mostrando tal cual (no se traga todo)',
    /conectar|servidor/i.test(errorDeVerdad.errorAcceso));

  chkF('No hubo errores de página', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
