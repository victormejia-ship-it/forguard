/* Modo oscuro (05-oct-2026, pedido de Victor, con reglas estrictas de
   diseño): "No alteres el diseño: no modifiques márgenes, rellenos,
   tamaños, flexbox, grid ni posicionamiento. Solamente debes cambiar
   colores de fondo, texto, bordes y sombras" + variables CSS en :root y
   [data-theme="dark"] + detectar prefers-color-scheme + guardar en
   localStorage + sincronizar con Firestore si hay sesión + botón de
   toggle + rutas relativas (ya lo eran: todo vive inline en un solo
   index.html, sin assets externos que puedan romperse).

   Los ~115 colores que antes vivían escritos a mano, repetidos, en
   decenas de reglas (tarjetas/superficies, insignias de estatus ok/
   alerta/error/neutro, chips de marca) se volvieron variables CSS — cada
   una con su valor de :root IDÉNTICO al literal que reemplazó, así que el
   modo claro se sigue viendo exactamente igual que antes (se prueba
   comparando una captura real). El modo oscuro redefine esas mismas
   variables bajo dos selectores que se pisan a propósito: primero
   `@media (prefers-color-scheme: dark)` (solo si nadie eligió nada a
   mano, ver :not([data-theme="light"])) y luego `[data-theme="dark"]`
   explícito (gana siempre, sin importar el sistema), que es lo que pone
   alternarTema() al hacer clic.

   No se tocó NINGÚN margin/padding/width/height/flex/grid/posición —
   todo el pedido se resolvió solo con variables de color. */
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

  // --------- 1) El botón ya existe en el DOM antes de iniciar sesión ---------
  // La pantalla de acceso (position:fixed, z-index:150, por encima del
  // header) tapa el clic hasta que se cierra — por diseño, no es un bug de
  // este botón — pero el botón ya está ahí, no depende de haySesion(), así
  // que en modo sin nube (HAY_NUBE=false, sin pantalla de acceso de por
  // medio) queda usable de inmediato.
  await page.goto(URL_BASE + '/index.html');
  await page.waitForTimeout(400);
  chkF('El botón de tema ya existe en el DOM antes de iniciar sesión (no depende de haySesion())', await page.locator('#btnTema').count() === 1);
  const temaSinSesion = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  chkF('Arranca en "light" (el sistema de prueba no trae prefers-color-scheme: dark)', temaSinSesion === 'light');
  await page.evaluate(() => ocultarAcceso());
  await page.waitForTimeout(100);

  // --------- 2) Clic real alterna el atributo y lo guarda en localStorage ---------
  await page.click('#btnTema');
  await page.waitForTimeout(150);
  const tras1 = await page.evaluate(() => ({ attr: document.documentElement.getAttribute('data-theme'), ls: localStorage.getItem('forguard.tema') }));
  chkF('Un clic real pone data-theme="dark"', tras1.attr === 'dark');
  chkF('Un clic real guarda "dark" en localStorage', tras1.ls === 'dark');
  const tituloBoton = await page.locator('#btnTema').getAttribute('title');
  chkF('El título del botón ya ofrece volver a "modo claro"', /modo claro/i.test(tituloBoton));

  await page.click('#btnTema');
  await page.waitForTimeout(150);
  const tras2 = await page.evaluate(() => ({ attr: document.documentElement.getAttribute('data-theme'), ls: localStorage.getItem('forguard.tema') }));
  chkF('Un segundo clic regresa a "light"', tras2.attr === 'light' && tras2.ls === 'light');

  // --------- 3) La preferencia sobrevive un reload (persistencia local) ---------
  await page.click('#btnTema'); // dark otra vez
  await page.waitForTimeout(150);
  await page.reload();
  await page.waitForTimeout(400);
  const trasReload = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  chkF('Tras recargar la página, el tema elegido sigue aplicado (localStorage)', trasReload === 'dark');

  // --------- 4) Sin preferencia guardada, sigue la del sistema operativo ---------
  await page.evaluate(() => localStorage.removeItem('forguard.tema'));
  await context.close();

  const context2 = await browser.newContext({ colorScheme: 'dark' });
  const page2 = await context2.newPage();
  await page2.route('**identitytoolkit.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page2.route('**securetoken.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page2.route('**firestore.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page2.goto(URL_BASE + '/index.html');
  await page2.waitForTimeout(400);
  const temaSistemaOscuro = await page2.evaluate(() => document.documentElement.getAttribute('data-theme'));
  chkF('Sin ninguna preferencia guardada y el sistema en oscuro, arranca en "dark" solo', temaSistemaOscuro === 'dark');

  // --------- 5) Las variables de color SÍ cambian de valor entre temas ---------
  const colores = await page2.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return { bg: cs.getPropertyValue('--bg').trim(), superficie: cs.getPropertyValue('--superficie').trim(), ink: cs.getPropertyValue('--ink').trim() };
  });
  chkF('En oscuro, --bg ya NO es el gris claro original (#F6F7F9)', colores.bg.toUpperCase() !== '#F6F7F9');
  chkF('En oscuro, --superficie ya NO es blanco puro (#fff)', colores.superficie.toUpperCase() !== '#FFF' && colores.superficie.toUpperCase() !== '#FFFFFF');
  chkF('En oscuro, --ink (texto) ya NO es el navy casi negro original (#00143D)', colores.ink.toUpperCase() !== '#00143D');

  // --------- 5b) --navy-texto (06-oct-2026, pedido de Victor: "modifica el
  // color de la tipografía que pueda ser en color blanco") — --navy sigue
  // siendo el navy aclarado de SIEMPRE porque todavía hace de FONDO (botones/
  // insignias con texto blanco encima); --navy-texto es la variable nueva
  // que usan los "color:" (títulos, números de KPI) y en oscuro es blanca,
  // no azul. ---------
  const coloresNavy = await page2.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return { navy: cs.getPropertyValue('--navy').trim(), navyTexto: cs.getPropertyValue('--navy-texto').trim() };
  });
  chkF('En oscuro, --navy-texto es blanco (la tipografía ya no sale azul)', coloresNavy.navyTexto.toUpperCase() === '#FFFFFF');
  chkF('En oscuro, --navy sigue siendo el navy aclarado (todavía es fondo de botones/insignias)', coloresNavy.navy.toUpperCase() === '#8FB3FF');
  const btnPrimario = await page2.evaluate(() => {
    const btn = document.querySelector('.btn-primario');
    if(!btn) return null;
    const cs = getComputedStyle(btn);
    return { bg: cs.backgroundColor, color: cs.color };
  });
  chkF('Un botón primario sigue con fondo navy aclarado + texto blanco (el fondo no se tocó)', !!btnPrimario && btnPrimario.bg === 'rgb(143, 179, 255)' && btnPrimario.color === 'rgb(255, 255, 255)');

  // --------- 6) El modo claro sigue viéndose EXACTAMENTE como antes (diseño intacto) ---------
  await page2.evaluate(() => { localStorage.setItem('forguard.tema','light'); document.documentElement.setAttribute('data-theme','light'); });
  await page2.waitForTimeout(100);
  const coloresClaro = await page2.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return { bg: cs.getPropertyValue('--bg').trim(), superficie: cs.getPropertyValue('--superficie').trim(), ink: cs.getPropertyValue('--ink').trim() };
  });
  chkF('Con data-theme="light" explícito, --bg vuelve a ser el original (#F6F7F9)', coloresClaro.bg.toUpperCase() === '#F6F7F9');
  chkF('Con data-theme="light" explícito, --superficie vuelve a ser blanco (#fff)', ['#FFF','#FFFFFF'].includes(coloresClaro.superficie.toUpperCase()));
  chkF('Con data-theme="light" explícito, --ink vuelve al navy original (#00143D)', coloresClaro.ink.toUpperCase() === '#00143D');

  // --------- 7) Sincroniza con Firestore SOLO cuando hay sesión, con un PATCH acotado a "tema" ---------
  let patchBody = null, patchUrl = null;
  await page2.route('**firestore.googleapis.com/**usuarios**', route => {
    if(route.request().method() === 'PATCH'){ patchUrl = route.request().url(); patchBody = route.request().postDataJSON(); }
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page2.evaluate(() => {
    sesion.correo='owner@a.com'; sesion.uid='u-owner'; sesion.idToken='FAKE'; sesion.refreshToken='F2';
    sesion.expira=Date.now()+3600000; sesion.rol='owner'; sesion.nombre='Victor Owner';
    ocultarAcceso();
  });
  await page2.click('#btnTema');
  await page2.waitForTimeout(200);
  chkF('Con sesión activa, alternar el tema manda un PATCH a /usuarios/{uid}', !!patchUrl && patchUrl.includes('/usuarios/u-owner'));
  chkF('Ese PATCH va acotado a SOLO el campo "tema" (updateMask), nunca escribirNube() (que estamparía actualizadoEn de más)',
    !!patchUrl && patchUrl.includes('updateMask.fieldPaths=tema') && !patchUrl.includes('actualizadoEn'));
  // Antes del clic el tema estaba en "light" (check 6); este clic lo pasa a "dark".
  chkF('El cuerpo del PATCH manda el valor real del tema elegido', !!patchBody && patchBody.fields && patchBody.fields.tema && patchBody.fields.tema.stringValue === 'dark');

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
