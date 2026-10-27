/* La búsqueda de la lista de Pólizas sobrevive a entrar y regresar de una
   póliza (27-oct-2026, pedido de Victor: "cada que entramos a una poliza y
   queremos regresar a la ventana anterior se eliminan las busquedas
   tratemos de que si se genera una solicitud para regresar regresemos a la
   ventana en donde estabamos").

   Diagnóstico: `estado.busca` es un campo GENÉRICO compartido por casi toda
   la app —Catálogo, Clientes, Cotizaciones, Reportes… e incluso el
   buscador de EQUIPOS que vive DENTRO del detalle de una póliza
   (vistaPoliza, #buscaEquipo)— y cada módulo lo vacía al entrar o salir
   para que la búsqueda de uno no se cuele filtrando la lista de otro.
   irAPolizas() (el botón "Regresar a pólizas" del detalle) hacía
   exactamente eso: `estado.busca = ''`, con el comentario "el buscador de
   equipos no debe seguir filtrando pólizas" — necesario para que un texto
   tecleado en el buscador de equipos del detalle no se colara a Agenda u
   otras vistas hermanas que SIGUEN usando ese mismo campo compartido, pero
   de paso también borraba lo que ya traías escrito en la LISTA de pólizas.

   Arreglo: la lista de pólizas ahora tiene su PROPIA llave,
   `estado.buscaPolizas`, separada del `busca` compartido — igual que
   `estado.vistaPolizas` (tarjetas/tabla/clientes), que ya era "sticky" sin
   que nadie lo reseteara al entrar/salir de un detalle. entrarPoliza() e
   irAPolizas() nunca tocan `estado.buscaPolizas`, así que sobrevive sola. */
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
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'ACME' })];
    datos.polizas = [normalizarPoliza({
      id:'p1', clienteId:'c1', folio:'POL-001', sitioNombre:'Sitio ACME', estatus:'activa', facturacion:'anual',
      fechaInicio:'2026-01-01', fechaCotizacion:'2026-01-01', cargoA:'cliente',
      partidas: [{ id:'x1', concepto:'Equipo del detalle', cantidad:1, precioUnitario:1000, costoUnitario:500, frecuencia:1, mesesServicio:[0] }],
      cobros:[true]
    })];
    irAModulo('polizas');
  });

  // --------- 1) Se escribe en el buscador de la LISTA ---------
  await page.fill('#buscaPoliza', 'ACME');
  await page.waitForTimeout(150);
  const buscaGuardada = await page.evaluate(() => estado.buscaPolizas);
  chkF('Lo tecleado en el buscador de la lista vive en estado.buscaPolizas (su propia llave, no la compartida)', buscaGuardada === 'ACME');

  // --------- 2) Entrar al detalle de la póliza NO toca esa búsqueda ---------
  await page.evaluate(() => { entrarPoliza('p1'); });
  await page.waitForTimeout(150);
  chkF('estado.buscaPolizas sigue intacta mientras se ve el detalle', await page.evaluate(() => estado.buscaPolizas) === 'ACME');

  // --------- 3) "Regresar a pólizas": la búsqueda de la LISTA sigue ahí ---------
  await page.evaluate(() => { irAPolizas(); });
  await page.waitForTimeout(150);
  const buscaTrasRegresar = await page.$eval('#buscaPoliza', i => i.value);
  chkF('Al regresar del detalle, el buscador de la LISTA todavía dice "ACME" (ya no se borra)', buscaTrasRegresar === 'ACME');
  chkF('La lista sigue filtrada por esa búsqueda (solo la póliza de ACME, ninguna otra)', (await page.locator('.tarjeta').count()) === 1);

  // --------- 4) Regresión: irAPolizas() SIGUE limpiando el `busca` compartido,
  //              para que no se cuele en una vista HERMANA del mismo módulo
  //              que todavía lo usa (ej. vistaPrecios, #buscaEquipo) ---------
  await page.evaluate(() => { estado.busca = 'texto que no debería sobrevivir'; irAPolizas(); });
  chkF('irAPolizas() sigue vaciando el campo `busca` compartido (no es lo mismo que buscaPolizas, y otras vistas del módulo aún lo usan)',
    await page.evaluate(() => estado.busca) === '');
  chkF('...pero buscaPolizas (la búsqueda de ESTA lista) no se vio afectada por eso', await page.evaluate(() => estado.buscaPolizas) === 'ACME');

  chkF('No hubo errores de página en todo el escenario', errores.length === 0);
  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
