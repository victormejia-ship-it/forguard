/* El botón "atrás" del navegador: pila real de navegación (09-oct-2026,
   pedido de Victor: "que si doy para atras en la pagina web no me saque de
   la pagina sino se vaya a donde anteriormente estabas").

   Ya existía un mecanismo desde el 14-sep-2026 (empujarCandadoHistorial +
   un historial ficticio) que evitaba salir de la pestaña, pero "atrás" solo
   subía UN nivel con una heurística fija: vista del módulo actual → inicio
   del módulo actual → el primer módulo permitido. Si entrabas a Pólizas,
   saltabas a otro módulo y le dabas "atrás", te mandaba al primer módulo de
   la lista (Resultados), NO de regreso a Pólizas — exactamente lo que
   Victor reportó.

   Ahora es una pila real (CAMPOS_NAVEGACION/fotoNavegacion/
   empujarNavegacionSiCambio, ver el comentario junto a ellas en el código):
   cada combinación DISTINTA de módulo/vista/detalle se empuja al historial
   real del navegador al terminar render(), y "popstate" restaura la foto
   anterior tal cual sobre `estado` — sin heurística, la pantalla exacta de
   antes, sin importar cuántos módulos de por medio se hayan visitado. Un
   modal abierto o la vista previa de rol se resuelven PRIMERO y aparte (son
   capas encima de la pantalla, no la pantalla en sí). Buscar/filtrar/
   cambiar tarjetas↔tabla NO cuenta como "otra pantalla" a propósito (si no,
   cada letra tecleada en un buscador metería su propio "atrás"). */
const { chromium } = require('playwright');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
const chk = (label, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' - ' + label); return cond; };
let fallas = 0;
const chkF = (label, cond) => { if(!chk(label, cond)) fallas++; };

(async () => {
  const browser = await chromium.launch(OPCIONES_NAVEGADOR);
  const page = await browser.newPage({ viewport: { width: 1200, height: 1400 } });
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
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'BORGWARNER' })];
    datos.polizas = [normalizarPoliza({
      id:'p1', clienteId:'c1', folio:'POL-01', sitioNombre:'Planta BorgWarner',
      estatus:'activa', facturacion:'anual', fechaInicio:'2024-01-01', fechaCotizacion:'2024-01-01',
      partidas: [{ id:'x1', concepto:'Horno Rational', marca:'Rational', modelo:'iCOMBIPRO', serie:'SER-1', cantidad:1, precioUnitario:1000, frecuencia:3, mesesServicio:[9] }],
      cobros:[true]
    })];
    irAInicio();
  });
  await page.waitForTimeout(200);
  const urlInicial = page.url();

  // --------- 1) Navegar de verdad por varios módulos y niveles ---------
  // Pólizas (lista) -> detalle de la póliza -> módulo RATIONAL (tablero) ->
  // checklist (sub-vista DENTRO de RATIONAL). Cuatro pantallas distintas, en
  // DOS módulos distintos.
  await page.evaluate(() => irAModulo('polizas'));
  await page.waitForTimeout(150);
  chkF('1) Arranca en la lista de Pólizas', await page.evaluate(() => estado.modulo === 'polizas' && estado.vista === 'polizas'));

  await page.evaluate(() => entrarPoliza('p1'));
  await page.waitForTimeout(150);
  chkF('2) Entra al detalle de la póliza', await page.evaluate(() => estado.vista === 'poliza' && estado.polizaId === 'p1'));

  await page.evaluate(() => irAModulo('rational'));
  await page.waitForTimeout(150);
  chkF('3) Salta al tablero de RATIONAL (otro módulo)', await page.evaluate(() => estado.modulo === 'rational' && estado.vista === 'rational'));

  await page.evaluate(() => irAChecklistRational());
  await page.waitForTimeout(150);
  chkF('4) Entra al checklist (sub-vista dentro de RATIONAL)', await page.evaluate(() => estado.vista === 'checklist-rational'));

  // --------- 2) "Atrás" deshace esas CUATRO pantallas una por una, EN ORDEN ---------
  // Esto es lo que antes NO pasaba: la heurística vieja, desde el checklist,
  // hubiera saltado directo al primer módulo permitido (Resultados), nunca
  // de regreso al tablero de RATIONAL ni al detalle de la póliza.
  await page.goBack();
  await page.waitForTimeout(250);
  chkF('Atrás #1: regresa al tablero de RATIONAL (no salta a otro módulo)', await page.evaluate(() => estado.modulo === 'rational' && estado.vista === 'rational'));

  await page.goBack();
  await page.waitForTimeout(250);
  const trasAtras2 = await page.evaluate(() => ({ modulo: estado.modulo, vista: estado.vista, polizaId: estado.polizaId }));
  chkF('Atrás #2: regresa al detalle de la póliza en Pólizas (donde SÍ estaba antes) y no al primer módulo de la lista', trasAtras2.modulo === 'polizas' && trasAtras2.vista === 'poliza' && trasAtras2.polizaId === 'p1');

  await page.goBack();
  await page.waitForTimeout(250);
  chkF('Atrás #3: sube de el detalle a la lista de Pólizas', await page.evaluate(() => estado.modulo === 'polizas' && estado.vista === 'polizas'));

  // --------- 3) Un "atrás" más real todavía: la pantalla de ANTES de tocar nada en esta prueba ---------
  // Al cargar la página, antes de que esta prueba navegara a ningún lado, ya
  // se había empujado una foto del arranque real (Resultados, el primer
  // módulo) — ESA es "donde estaba antes" de verdad, así que un "atrás" más
  // sí debe llegar ahí, no quedarse pegado en Pólizas.
  await page.goBack();
  await page.waitForTimeout(250);
  chkF('Un "atrás" más regresa a la pantalla real de antes de esta prueba (Resultados)', await page.evaluate(() => estado.modulo === 'resultados' && estado.vista === 'resultados'));

  // --------- 4) Ahí sí se acabó la pila real: más "atrás" se absorbe, nunca saca de la pestaña ---------
  for (let i = 0; i < 3; i++) {
    await page.goBack();
    await page.waitForTimeout(200);
  }
  chkF('Varios "atrás" de más, ya sin pila real, no sacan de la pestaña (la URL sigue siendo la app)', page.url() === urlInicial);
  chkF('...y la pantalla se queda clavada en Resultados (no hay más a dónde "subir")', await page.evaluate(() => estado.modulo === 'resultados' && estado.vista === 'resultados'));

  // --------- 4) Un modal abierto: "atrás" lo cierra PRIMERO, sin tocar la pantalla de atrás ---------
  await page.evaluate(() => entrarPoliza('p1'));
  await page.waitForTimeout(150);
  await page.evaluate(() => modalServicioPoliza('p1', 'x1', 9, false));
  await page.waitForTimeout(150);
  chkF('El modal está abierto', await page.locator('#telon.abierto').count() === 1);
  await page.goBack();
  await page.waitForTimeout(250);
  chkF('"Atrás" con un modal abierto lo cierra...', await page.locator('#telon.abierto').count() === 0);
  chkF('...sin cambiar de pantalla (sigue en el detalle de la póliza, no se movió el historial de navegación)', await page.evaluate(() => estado.vista === 'poliza' && estado.polizaId === 'p1'));

  // --------- 5) Buscar NO mete su propia parada en el historial ---------
  // Si cada letra tecleada empujara una entrada, un solo "atrás" después de
  // escribir "BORGWARNER" solo borraría la última letra en vez de regresar
  // de verdad a la pantalla anterior — justo el tipo de historial inútil que
  // se evita excluyendo `busca` de CAMPOS_NAVEGACION.
  await page.evaluate(() => irAPolizas());
  await page.waitForTimeout(150);
  const historialAntesDeBuscar = await page.evaluate(() => history.length);
  await page.fill('#buscaPoliza', 'BORGWARNER');
  await page.waitForTimeout(200);
  await page.fill('#buscaPoliza', 'BORGWARNER falta');
  await page.waitForTimeout(200);
  const historialTrasBuscar = await page.evaluate(() => history.length);
  chkF('Escribir en el buscador no agrega entradas al historial del navegador', historialTrasBuscar === historialAntesDeBuscar);
  await page.evaluate(() => { estado.busca = ''; render(); });
  await page.waitForTimeout(150);

  // --------- 6) La vista previa de rol: "atrás" sale de ella primero (sin romper nada) ---------
  await page.evaluate(() => { estado.vistaPrevia = { rol:'tecnico', uid:'', nombre:'', clienteId:null }; render(); });
  await page.waitForTimeout(150);
  chkF('Entra en vista previa', await page.evaluate(() => enVistaPrevia()));
  await page.goBack();
  await page.waitForTimeout(250);
  chkF('"Atrás" en vista previa sale de ella (no navega dentro del rol simulado)', await page.evaluate(() => !enVistaPrevia()));

  chkF('No hubo errores de página en todo el escenario', errores.length === 0);
  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
