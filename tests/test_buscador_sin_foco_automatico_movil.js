/* No abrir el teclado solo porque la página cargó con un buscador enfocado,
   en móvil (27-oct-2026, pedido de Victor: "en dispositivos moviles no
   abras en automatico el teclado donde existan buscadores porque es
   molesto para cuando se carga la pagina").

   Ningún buscador de la app llama a su propio .focus() al renderizar una
   vista —cada uno solo se enfoca cuando la propia persona le da clic—, así
   que el teclado que describe Victor no lo dispara código de aquí: lo
   dispara el NAVEGADOR al restaurar el foco de una visita anterior
   (Safari/Chrome en iOS/Android pueden reenfocar el último campo activo al
   volver de un "atrás" con el caché de retroceso —bfcache, evento
   "pageshow" con persisted:true— o al reabrir la PWA desde donde se había
   quedado). quitarFocoBuscadorMovil() le quita el foco a cualquier
   <input type="search"> que así haya quedado enfocado, SOLO en pantallas
   angostas (mismo punto de quiebre de móvil que ya usa el resto de la app,
   @media max-width:700px) — en escritorio un foco heredado no dispara
   ningún teclado, así que ahí no se toca nada. Se llama una vez al cargar
   y de nuevo en cada "pageshow" (la señal real de un regreso por bfcache). */
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

  await page.evaluate(() => {
    sesion.correo='owner@a.com'; sesion.uid='u-owner'; sesion.idToken='FAKE'; sesion.refreshToken='F2';
    sesion.expira=Date.now()+3600000; sesion.rol='owner'; sesion.nombre='Victor Owner';
    ocultarAcceso();
    /* vistaPolizas() enseña la pantalla de "vacío" (sin #buscaPoliza) si no
       hay ninguna póliza — se necesita al menos una para que exista el
       buscador que esta prueba va a enfocar. */
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'ACME' })];
    datos.polizas = [normalizarPoliza({
      id:'p1', clienteId:'c1', folio:'POL-001', sitioNombre:'Sitio ACME', estatus:'activa', facturacion:'anual',
      fechaInicio:'2026-01-01', fechaCotizacion:'2026-01-01', cargoA:'cliente',
      partidas: [{ id:'x1', concepto:'Equipo', cantidad:1, precioUnitario:1000, costoUnitario:500, frecuencia:1, mesesServicio:[0] }],
      cobros:[true]
    })];
    irAModulo('polizas');
  });

  // --------- 1) En ESCRITORIO, un foco heredado en el buscador NO se toca ---------
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => { $('buscaPoliza').focus(); quitarFocoBuscadorMovil(); });
  chkF('En escritorio (>700px), quitarFocoBuscadorMovil() NO le quita el foco al buscador', await page.evaluate(() => document.activeElement.id) === 'buscaPoliza');

  // --------- 2) En MÓVIL, un buscador enfocado SÍ pierde el foco ---------
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { $('buscaPoliza').focus(); });
  chkF('(de control) el buscador sí quedó enfocado antes de llamar la función', await page.evaluate(() => document.activeElement.id) === 'buscaPoliza');
  await page.evaluate(() => { quitarFocoBuscadorMovil(); });
  chkF('En móvil (≤700px), quitarFocoBuscadorMovil() SÍ le quita el foco a un <input type="search"> heredado',
    await page.evaluate(() => document.activeElement === document.body));

  // --------- 3) En MÓVIL, un campo que NO es buscador (ej. el correo de acceso) no se toca ---------
  await page.evaluate(() => { mostrarAcceso(); $('aCorreo').focus(); quitarFocoBuscadorMovil(); });
  chkF('Un campo que no es buscador (type != "search", ej. el correo de acceso) conserva su foco: esto NO es un bloqueo general de foco en móvil',
    await page.evaluate(() => document.activeElement.id) === 'aCorreo');
  await page.evaluate(() => ocultarAcceso());

  // --------- 4) Se reaplica solo en "pageshow" (bfcache), no en cualquier evento ---------
  await page.evaluate(() => { $('buscaPoliza').focus(); });
  chkF('(de control) vuelve a quedar enfocado', await page.evaluate(() => document.activeElement.id) === 'buscaPoliza');
  await page.evaluate(() => { window.dispatchEvent(new Event('pageshow')); });
  await page.waitForTimeout(50);
  chkF('El evento "pageshow" (regreso por bfcache) también dispara la limpieza, sin que nadie más lo llame a mano',
    await page.evaluate(() => document.activeElement === document.body));

  chkF('No hubo errores de página en todo el escenario', errores.length === 0);
  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
