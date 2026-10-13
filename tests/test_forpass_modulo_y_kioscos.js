/* Forpass: encabezado correcto + inventario de kioscos (13-oct-2026).

   Victor mandó una captura real de la pantalla de Forpass con el mensaje:
   "Revisa que esta ventana sea correcta ya que al seleccionar forpass en
   la parte de arriba dice clientes" — el botón de arriba sí decía
   "Forpass" (ETIQUETA_MODULO ya traía 'forpass':'Forpass'), pero la
   pantalla que se abría traía un <h2> que decía "Clientes". La causa real:
   'forpass' es el ÚNICO id de MODULOS que nunca tuvo su propio renglón en
   el switch gigante de render() — siempre cayó al `else` final por
   eliminación, que por accidente SÍ es la pantalla correcta
   (vistaClientes()/vistaCliente(), el par de funciones que en realidad es
   el tablero de Forpass desde que "el módulo que debe regir es el de
   cliente, forpass es un anexo", 30-sep-2026) pero que arrastraba un <h2>
   nunca corregido de cuando Forpass y Clientes todavía eran la misma
   pestaña. Arreglo: un caso explícito para 'forpass' en el switch (en vez
   de depender de la eliminación) + el <h2> corregido a "Forpass".

   En el mismo mensaje, Victor pidió explícitamente: "permite agregar
   activos de Forpass para ingresar sus datos... el forpass genera gasto y
   genera venta, entonces delimita como se puede añadir esta información
   en ese modulo". Antes de construir nada, se le preguntó CÓMO lo quería
   (AskUserQuestion, porque Forpass ya calcula costo/venta por SITIO
   —forpassCosto/mensualidad— y cualquier cosa que tocara esos números de
   forma distinta hubiera sido un cambio de contabilidad, no solo de
   pantalla) y eligió: "Inventario dentro de Forpass" — una lista de
   kioscos físicos (serie/modelo/fecha de instalación) colgada de CADA
   sitio, puramente informativa, SIN tocar el dinero que ya existe.

   Mismo molde que modalContactos() (el icono de "quién manda la OC" que
   ya vivía en la tarjeta del sitio): una lista de trabajo que se edita
   completa en memoria y se guarda de un golpe. Se edita SOLO desde
   modalSitio/su tarjeta (que vive en Clientes/Forpass, nunca un formulario
   nuevo aparte) — mismo criterio de siempre: "el módulo que debe regir es
   el de cliente". Crítico: modalSitio() (el formulario grande de
   nombre/zona/módulos/mensualidad/etc.) NO toca `kioscos` en su propio
   formulario, así que tiene que arrastrarlo en `conservado` igual que ya
   hace con pagosDetalle/contactos/encargado — si no, guardar cualquier
   OTRO campo del sitio borraría silenciosamente el inventario ya
   capturado. */
const { chromium } = require('playwright');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
const chk = (label, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' - ' + label); return cond; };
let fallas = 0;
const chkF = (label, cond) => { if(!chk(label, cond)) fallas++; };

(async () => {
  const browser = await chromium.launch(OPCIONES_NAVEGADOR);
  const page = await browser.newPage({ viewport: { width: 1300, height: 1500 } });
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
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'Cliente Kioscos' })];
    datos.sitios = [normalizarSitio({ id:'s1', clienteId:'c1', nombre:'Sucursal Uno', modulos:2, mensualidad:1500, notas:'nota original' })];
  });

  // --------- 1) El módulo Forpass muestra su propio encabezado, no "Clientes" ---------
  await page.evaluate(() => { irAModulo('forpass'); });
  await page.waitForTimeout(250);
  chkF('estado.modulo queda en "forpass"', await page.evaluate(() => estado.modulo === 'forpass'));
  chkF('El encabezado dice "Forpass", no "Clientes"', (await page.locator('h2').first().textContent()).trim() === 'Forpass');
  chkF('...y de verdad es el tablero de Forpass (trae sus 5 KPIs)', (await page.locator('.kpis').textContent()).includes('Forpass activos'));

  await page.evaluate(() => { irAModulo('clientes'); });
  await page.waitForTimeout(200);
  chkF('El módulo Clientes sigue diciendo "Clientes" (no se rompió por el cambio)', (await page.locator('h2').first().textContent()).trim() === 'Clientes');

  // --------- 2) El botón "Equipos" vive en la tarjeta del sitio, dentro de Forpass ---------
  await page.evaluate(() => { irAModulo('forpass'); estado.vista='cliente'; estado.clienteId='c1'; render(); });
  await page.waitForTimeout(250);
  chkF('La tarjeta del sitio trae el botón de Equipos', await page.locator('[data-kioscos="s1"]').count() === 1);
  chkF('...marcado como "sin-datos" mientras no hay ningún kiosco capturado', await page.locator('[data-kioscos="s1"]').evaluate(el => el.classList.contains('sin-datos')));

  // --------- 3) Agregar kioscos: formulario, guardar, no toca dinero ---------
  await page.click('[data-kioscos="s1"]');
  await page.waitForTimeout(150);
  chkF('El modal abre con el título correcto', (await page.locator('#modalTitulo').textContent()).includes('Kioscos instalados'));

  await page.click('#btnAgregarKiosco');
  await page.waitForTimeout(100);
  await page.fill('[data-kc="serie"][data-i="0"]', 'FP-001');
  chkF('Con 1 de 2 módulos capturado, avisa el descuadre (sin bloquear nada)', (await page.locator('#modalCuerpo').innerText()).includes('1 de 2 módulos'));
  await page.fill('[data-kc="modelo"][data-i="0"]', 'Kiosco Touch 15');
  await page.fill('[data-kc="fechaInstalacion"][data-i="0"]', '2026-01-15');

  await page.click('#btnAgregarKiosco');
  await page.waitForTimeout(100);
  await page.fill('[data-kc="serie"][data-i="1"]', 'FP-002');
  await page.selectOption('[data-kc="estatus"][data-i="1"]', 'baja');
  await page.fill('[data-kc="notas"][data-i="1"]', 'se dañó, pendiente reemplazo');

  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);

  const sitioGuardado = await page.evaluate(() => sitioPorId('s1'));
  chkF('Quedan guardados los 2 kioscos', sitioGuardado.kioscos.length === 2);
  chkF('...con serie/modelo/fecha correctos', sitioGuardado.kioscos[0].serie === 'FP-001' && sitioGuardado.kioscos[0].modelo === 'Kiosco Touch 15' && sitioGuardado.kioscos[0].fechaInstalacion === '2026-01-15');
  chkF('...y el estatus "baja" del segundo', sitioGuardado.kioscos[1].estatus === 'baja' && sitioGuardado.kioscos[1].notas === 'se dañó, pendiente reemplazo');
  chkF('"modulos" NO se tocó (sigue en 2, es dato de cobranza aparte)', sitioGuardado.modulos === 2);
  chkF('"mensualidad" NO se tocó (sigue en 1500)', sitioGuardado.mensualidad === 1500);
  chkF('El botón ya no trae la clase "sin-datos"', !(await page.locator('[data-kioscos="s1"]').evaluate(el => el.classList.contains('sin-datos'))));

  // --------- 4) Quitar un renglón ---------
  await page.click('[data-kioscos="s1"]');
  await page.waitForTimeout(150);
  await page.click('[data-quitar-kiosco="1"]');
  await page.waitForTimeout(100);
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);
  const sitioTrasQuitar = await page.evaluate(() => sitioPorId('s1'));
  chkF('Quitar un renglón deja solo el que quedó', sitioTrasQuitar.kioscos.length === 1 && sitioTrasQuitar.kioscos[0].serie === 'FP-001');

  // --------- 5) Editar OTRO campo del sitio NO borra el inventario ya guardado ---------
  // (el bug que de verdad importaba prevenir: modalSitio() no toca `kioscos`
  // en su propio formulario, así que tiene que arrastrarlo en `conservado`.)
  await page.evaluate(() => { modalSitio('c1', 's1'); });
  await page.waitForTimeout(150);
  await page.fill('#sNotas', 'nota distinta, no relacionada con kioscos');
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);
  const sitioTrasEditarOtro = await page.evaluate(() => sitioPorId('s1'));
  chkF('Guardar otro campo del sitio (notas) NO borra el kiosco ya capturado', sitioTrasEditarOtro.kioscos.length === 1 && sitioTrasEditarOtro.kioscos[0].serie === 'FP-001');
  chkF('...y el otro campo sí se actualizó de verdad', sitioTrasEditarOtro.notas === 'nota distinta, no relacionada con kioscos');

  // --------- 6) Viewer: consulta de solo lectura, con los datos reales a la vista ---------
  await page.evaluate(() => { sesion.rol='viewer'; render(); });
  await page.waitForTimeout(150);
  await page.click('[data-kioscos="s1"]');
  await page.waitForTimeout(150);
  chkF('Viewer ve el detalle sin botón de "Guardar"', await page.locator('[data-modal="guardar"]').count() === 0);
  chkF('...sin ningún campo editable', await page.locator('[data-kc]').count() === 0);
  chkF('...pero SÍ ve el dato real (FP-001)', (await page.locator('#modalCuerpo').innerText()).includes('FP-001'));
  await page.evaluate(() => { cerrarModal(); sesion.rol='owner'; });

  chkF('No hubo errores de página en todo el escenario', errores.length === 0);
  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
