/* Eliminar activos, para el rol control_activos (09-oct-2026, aclaración de
   Victor sobre un pedido anterior: "en la vista para el de activos, puedes
   habilitarle la seleccion y eliminacion cada uno de los activos" — y al
   preguntarle a cuál pantalla se refería, aclaró: "no es para el cliente
   sino para la persona que administra el activo").

   "La persona que administra el activo" es justo el rol control_activos:
   su ÚNICO módulo es Activos (ver modulosPermitidos()), ya podía dar de
   alta e importar (puedeGestionarActivos() ya lo incluía desde antes), pero
   NUNCA podía borrar uno — ni el botón "Eliminar" de la ficha individual ni
   el modo "Seleccionar"/eliminar en lote existían para él, los dos estaban
   acotados a esAdmin() (Owner/Admin). Si se equivocaba al importar un lote
   o capturaba algo de más, se quedaba atorado esperando siempre a un Admin
   para corregirlo.

   Nuevo candado propio, nada más para esto (puedeBorrarActivos()/
   exigirBorrarActivos(), separado de exigirAdmin() para no aflojar ESE
   candado en el resto de la app — proveedores, cuentas, etc. siguen solo
   Owner/Admin): esAdmin() || rolEfectivo() === 'control_activos'. Mismo
   candado replicado del lado del servidor en config/firestore.rules
   (`allow delete` de /activos). */
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
    sesion.correo='c1@a.com'; sesion.uid='u-c1'; sesion.idToken='FAKE'; sesion.refreshToken='F2';
    sesion.expira=Date.now()+3600000; sesion.rol='control_activos'; sesion.nombre='Quien administra activos';
    ocultarAcceso();
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'BORGWARNER' })];
    datos.activos = [
      normalizarActivo({ id:'a1', tipo:'cliente', nombre:'Horno 1', clienteId:'c1', sitioNombre:'Sitio A' }),
      normalizarActivo({ id:'a2', tipo:'cliente', nombre:'Horno 2', clienteId:'c1', sitioNombre:'Sitio A' }),
      normalizarActivo({ id:'a3', tipo:'forguard', nombre:'Taladro', asignadoA:'Juan' }),
    ];
    irAModulo('activos');
  });
  await page.waitForTimeout(200);

  chkF('control_activos sigue teniendo acceso al módulo Activos', await page.evaluate(() => modulosPermitidos().includes('activos') && modulosPermitidos().length === 1));

  // --------- 1) Eliminar UN activo desde su propia ficha ---------
  await page.evaluate(() => entrarActivo('a3'));
  await page.waitForTimeout(150);
  chkF('El botón "Eliminar" SÍ aparece en la ficha del activo (antes solo Owner/Admin)', await page.locator('[data-accion="borrar-activo"]').count() === 1);
  await page.click('[data-accion="borrar-activo"]');
  await page.waitForTimeout(150);
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);
  chkF('El activo quedó borrado de verdad (datos.activos)', await page.evaluate(() => !datos.activos.some(a => a.id === 'a3')));
  chkF('Regresa a la lista tras borrar', await page.evaluate(() => estado.vista === 'activos'));

  // --------- 2) Seleccionar y eliminar EN LOTE ---------
  await page.evaluate(() => { estado.activosClienteId = '__todos__'; render(); });
  await page.waitForTimeout(150);
  chkF('El botón "Seleccionar" SÍ aparece en la lista (antes solo Owner/Admin)', await page.locator('[data-accion="alternar-seleccion-activos"]').count() === 1);

  await page.click('[data-accion="alternar-seleccion-activos"]');
  await page.waitForTimeout(150);
  chkF('Aparecen los checkboxes de selección', await page.locator('.chkSeleccionActivo').count() === 2);

  await page.locator('#chkTodosActivos').check();
  await page.waitForTimeout(150);
  chkF('"Seleccionar todos" marca los dos activos que quedan', await page.locator('.chkSeleccionActivo:checked').count() === 2);
  chkF('El botón "Eliminar seleccionados" se habilita', await page.locator('#btnEliminarSeleccionActivos').isEnabled());

  await page.click('#btnEliminarSeleccionActivos');
  await page.waitForTimeout(150);
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);
  chkF('Los dos activos seleccionados quedan borrados de verdad', await page.evaluate(() => datos.activos.length === 0));

  // --------- 3) Un rol SIN acceso a Activos no llega ni a ver el módulo ---------
  // (no es un candado nuevo de este cambio, pero confirma que no se aflojó
  // nada más allá de lo pedido: reportero sigue sin ver Activos para nada.)
  await page.evaluate(() => { sesion.rol='reportero'; render(); });
  await page.waitForTimeout(150);
  chkF('Un rol sin acceso a Activos (reportero) sigue sin verlo en absoluto', !(await page.evaluate(() => modulosPermitidos().includes('activos'))));

  chkF('No hubo errores de página en todo el escenario', errores.length === 0);
  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
