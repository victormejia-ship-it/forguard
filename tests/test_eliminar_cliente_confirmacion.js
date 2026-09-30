/* "Eliminar cliente" ahora pide escribir el nombre exacto (30-sep-2026,
   incidente real de Victor): fue dándole al icono de basura en varios
   clientes de Forpass seguidos —BANORTE, JD-CUTTERS, JD-TRACTORES, GM-TRIM,
   Cedis-Oxxo y varios más, todos en el mismo minuto del Historial de
   cambios— "pensando que era más seguro" (creía que solo los quitaba de la
   vista de Forpass, no que los borraba para siempre). Sin respaldo
   disponible, esos clientes se perdieron de verdad — el botón "Sí,
   eliminar" de la confirmación de siempre se puede aceptar de reflejo,
   sobre todo yendo tarjeta por tarjeta rápido.

   Arreglo: confirmarEscribiendoNombre() — el botón de confirmar nace
   deshabilitado y solo se activa cuando se escribe el nombre EXACTO del
   cliente, letra por letra (mismo patrón que GitHub al borrar un
   repositorio). De paso, la ventana ahora también avisa si el cliente
   tiene pólizas/cotizaciones/reportes/levantamientos — eliminar un cliente
   NUNCA los ha borrado (solo borra sus sitios), así que sin este aviso se
   quedaban huérfanos sin que quien borra se enterara del alcance real. */
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
    datos.clientes = [
      normalizarCliente({ id:'c1', nombre:'BANORTE' }),
      normalizarCliente({ id:'c2', nombre:'JD-TRACTORES' })
    ];
    datos.sitios = [ normalizarSitio({ id:'s1', clienteId:'c2', nombre:'Sitio JD', modulos:1, mensualidad:1000, fechaInicio:hoyISO(), meses:12 }) ];
    datos.polizas = [ normalizarPoliza({ id:'p1', clienteId:'c2', sitioId:'s1', estatus:'activa' }) ];
    irAModulo('forpass');
    render();
  });
  await page.waitForTimeout(150);

  // --------- 1) El botón "Eliminar cliente" abre la confirmación reforzada, no la de un solo clic ---------
  await page.click('[data-borrar-cliente="c1"]');
  await page.waitForTimeout(150);
  chkF('La ventana trae el campo para escribir el nombre', await page.locator('#confirmaEscritoInput').count() === 1);
  const botonInicial = await page.locator('#btnConfirmaEscrito').isDisabled();
  chkF('El botón "Sí, eliminar" nace DESHABILITADO — no se puede confirmar de un solo clic', botonInicial === true);

  // --------- 2) Un nombre a medias o incorrecto NO habilita el botón ---------
  await page.fill('#confirmaEscritoInput', 'BANO');
  await page.waitForTimeout(50);
  chkF('Con el nombre a medias, el botón sigue deshabilitado', await page.locator('#btnConfirmaEscrito').isDisabled());
  await page.fill('#confirmaEscritoInput', 'banorte');
  await page.waitForTimeout(50);
  chkF('En minúsculas (no exacto) el botón sigue deshabilitado — tiene que calzar letra por letra', await page.locator('#btnConfirmaEscrito').isDisabled());

  // --------- 3) El nombre exacto SÍ habilita el botón, y clic real elimina al cliente ---------
  await page.fill('#confirmaEscritoInput', 'BANORTE');
  await page.waitForTimeout(50);
  chkF('Con el nombre exacto, el botón se habilita', !(await page.locator('#btnConfirmaEscrito').isDisabled()));
  await page.click('#btnConfirmaEscrito');
  await page.waitForTimeout(150);
  const trasBorrarC1 = await page.evaluate(() => datos.clientes.some(c => c.id === 'c1'));
  chkF('Con el nombre exacto confirmado, el cliente SÍ se elimina de verdad', trasBorrarC1 === false);

  // --------- 4) Si el cliente tiene pólizas/cotizaciones/etc., la ventana avisa el alcance real ---------
  await page.click('[data-borrar-cliente="c2"]');
  await page.waitForTimeout(150);
  const textoAviso = await page.locator('#modalCuerpo').textContent();
  chkF('Avisa que tiene 1 sitio', /1 sitio/.test(textoAviso));
  chkF('Avisa que tiene 1 póliza que NO se borra y queda huérfana', /1 póliza/.test(textoAviso) && /huérfan/i.test(textoAviso));
  await page.fill('#confirmaEscritoInput', 'JD-TRACTORES');
  await page.waitForTimeout(50);
  await page.click('#btnConfirmaEscrito');
  await page.waitForTimeout(150);
  const estadoFinal = await page.evaluate(() => ({
    clienteExiste: datos.clientes.some(c => c.id === 'c2'),
    sitioExiste: datos.sitios.some(s => s.id === 's1'),
    polizaSigueViva: datos.polizas.some(p => p.id === 'p1')
  }));
  chkF('El cliente JD-TRACTORES sí se eliminó', estadoFinal.clienteExiste === false);
  chkF('Su sitio también se eliminó (como siempre)', estadoFinal.sitioExiste === false);
  chkF('Su póliza NO se borra (nunca lo ha hecho) — queda huérfana, tal como avisó la ventana', estadoFinal.polizaSigueViva === true);

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
