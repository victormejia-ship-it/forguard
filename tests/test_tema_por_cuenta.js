/* El tema (claro/oscuro) debe ser POR CUENTA, no por navegador (27-oct-2026,
   reporte de Victor: "revisa que el tema de la plataforma sea individual ya
   que si yo coloco en negro le aparece a todos en negro, que este sea
   conforme al usuario lo quiera").

   Diagnóstico: el tema SIEMPRE fue por cuenta del lado del servidor — cada
   usuario tiene su propio campo `tema` en /usuarios/{uid}, y alternarTema()
   ya mandaba un PATCH acotado a ESE documento (ver test_modo_oscuro.js,
   sección 7). El hueco real estaba en la COPIA LOCAL: tanto el botón de
   tema como el anti-parpadeo del <head> guardaban/leían una sola llave de
   localStorage ('forguard.tema') para TODO el navegador, sin importar qué
   cuenta tuviera la sesión abierta. En una computadora compartida entre
   varias cuentas (una recepción, una oficina con un solo equipo para
   varios técnicos, etc.) eso significaba: en cuanto CUALQUIERA tocaba el
   botón, esa elección se quedaba puesta para la SIGUIENTE cuenta que
   iniciara sesión ahí — porque el único momento en que se adopta el tema
   del PROPIO perfil es "si este navegador todavía no tiene ninguna
   preferencia" (ver cargarPerfil()), y una vez que alguien tocó el botón,
   el navegador ya "tenía una", aunque fuera de otra persona.

   Arreglo: la copia local ahora vive bajo una llave POR CUENTA
   ('forguard.tema.' + uid, ver uidTema()/llaveTemaDe() en el script
   principal) — tanto al guardar (alternarTema(), la corrección post-login
   de cargarPerfil()) como al leer (temaGuardado(), y el anti-parpadeo del
   <head>, que saca el uid de la ÚLTIMA sesión recordada en este navegador
   antes de que exista `sesion`). Dos cuentas pueden compartir el mismo
   equipo sin pisarse el tema la una a la otra, y cada quien recupera el
   suyo propio al volver a iniciar sesión ahí. */
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
  await page.route('**identitytoolkit.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**securetoken.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**firestore.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.goto(URL_BASE + '/index.html');
  await page.waitForTimeout(400);

  // --------- 1) La cuenta A inicia sesión y elige modo oscuro a mano ---------
  await page.evaluate(() => {
    sesion.correo='tecnico.a@forguard.com'; sesion.uid='u-tecnico-a'; sesion.idToken='FAKE'; sesion.refreshToken='F1';
    sesion.expira=Date.now()+3600000; sesion.rol='tecnico'; sesion.nombre='Técnico A';
    guardarSesion();
    ocultarAcceso();
  });
  await page.click('#btnTema');
  await page.waitForTimeout(150);
  const trasA = await page.evaluate(() => ({
    attr: document.documentElement.getAttribute('data-theme'),
    llaveA: localStorage.getItem('forguard.tema.u-tecnico-a'),
    llaveGenerica: localStorage.getItem('forguard.tema')
  }));
  chkF('La cuenta A ve "dark" tras su clic', trasA.attr === 'dark');
  chkF('La elección de A se guarda bajo SU PROPIA llave (forguard.tema.u-tecnico-a)', trasA.llaveA === 'dark');
  chkF('La elección de A NO se guarda en la llave genérica compartida del navegador', trasA.llaveGenerica !== 'dark');

  // --------- 2) A cierra sesión (se borra LLAVE_SESION, como hace salir()) ---------
  await page.evaluate(() => {
    localStorage.removeItem('forguard_forpass_sesion_v1');
    sesion.correo=null; sesion.uid=null; sesion.idToken=null; sesion.refreshToken=null; sesion.rol=null;
  });

  // --------- 3) La cuenta B inicia sesión en EL MISMO equipo: NO hereda el oscuro de A ---------
  /* Reproduce el reporte de Victor tal cual: recarga de por medio (como
     cuando alguien más prende la pantalla), con el localStorage del equipo
     todavía cargando forguard.tema.u-tecnico-a="dark" de la cuenta anterior. */
  await page.evaluate(() => {
    sesion.correo='tecnico.b@forguard.com'; sesion.uid='u-tecnico-b'; sesion.idToken='FAKE2'; sesion.refreshToken='F2';
    sesion.expira=Date.now()+3600000; sesion.rol='tecnico'; sesion.nombre='Técnico B';
    guardarSesion();
  });
  await page.reload();
  await page.waitForTimeout(400);
  const temaAlAbrirB = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  chkF('La cuenta B, en el MISMO equipo donde A dejó "dark", NO hereda el oscuro de A (arranca en "light", su propia preferencia/sistema)',
    temaAlAbrirB === 'light');

  // --------- 4) B elige su propio tema sin tocar el de A ---------
  await page.evaluate(() => { ocultarAcceso(); });
  await page.click('#btnTema');
  await page.waitForTimeout(150);
  const tras4 = await page.evaluate(() => ({
    attrB: document.documentElement.getAttribute('data-theme'),
    llaveB: localStorage.getItem('forguard.tema.u-tecnico-b'),
    llaveASigueIntacta: localStorage.getItem('forguard.tema.u-tecnico-a')
  }));
  chkF('B puede elegir SU propio oscuro', tras4.attrB === 'dark');
  chkF('La elección de B se guarda bajo SU PROPIA llave (forguard.tema.u-tecnico-b)', tras4.llaveB === 'dark');
  chkF('La llave de A sigue intacta (B no la tocó)', tras4.llaveASigueIntacta === 'dark');

  // --------- 5) A vuelve a iniciar sesión en el mismo equipo: recupera SU oscuro ---------
  await page.evaluate(() => {
    localStorage.removeItem('forguard_forpass_sesion_v1');
    sesion.correo='tecnico.a@forguard.com'; sesion.uid='u-tecnico-a'; sesion.idToken='FAKE3'; sesion.refreshToken='F3';
    sesion.expira=Date.now()+3600000; sesion.rol='tecnico'; sesion.nombre='Técnico A';
    guardarSesion();
  });
  await page.reload();
  await page.waitForTimeout(400);
  const temaAlVolverA = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  chkF('A, al volver a iniciar sesión en el mismo equipo, recupera SU propio "dark" (no el "dark" que B eligió aparte, aunque coincida de valor; sobre todo no se perdió ni se mezcló con la cuenta de nadie más)',
    temaAlVolverA === 'dark');

  chkF('No hubo errores de página en todo el escenario', errores.length === 0);
  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
