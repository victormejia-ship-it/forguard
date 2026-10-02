/* El bloque "Sitios" del resumen 360° de un cliente (módulo Clientes) traía
   un "y N más…" puramente de texto, sin ningún data-accion — a diferencia
   de los otros 4 bloques del mismo resumen (Pólizas/Cotizaciones/Reportes/
   Activos), que SÍ traen un botón real "Ver todas/todos" que navega a su
   propio módulo. Un cliente con más de 8 sitios (MAX_FILAS) se quedaba sin
   forma de ver el resto (02-oct-2026, pedido de Victor con captura real de
   un cliente con 14 sitios: "revisa que el boton mas pueda funcionar ya
   que actualmente no funciona... me refiero al 'y 11 más' debido a que no
   permite ver todo el listado de los sitios").

   A diferencia de los otros 4 bloques, Sitios no tiene un módulo propio al
   que mandar un "ver todos": vive repartido entre Clientes (alta/edición,
   movido ahí el 30-sep-2026) y Forpass (cobranza, que además solo lista
   sitios con Forpass activo — ver vistaCliente() — así que ni siquiera
   serviría como destino completo). Por eso la solución no es un botón que
   navegue, sino un expandir/colapsar EN EL MISMO bloque (mismo mecanismo
   genérico data-accion="vista-lista" que ya usa "Ver los 12 meses" en
   Resultados), con estado.sitiosResumenVista ('compacto'/'todos'). */
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
      normalizarCliente({ id:'c1', nombre:'MERCADO LIBRE' }),
      normalizarCliente({ id:'c2', nombre:'CLIENTE CHICO' })
    ];
    // 14 sitios (como en la captura real), la mayoría sin Forpass — así
    // "Ver cobranza en Forpass" NO los traería a todos de vuelta.
    datos.sitios = Array.from({ length: 14 }, (_, i) =>
      normalizarSitio({ id:'s'+i, clienteId:'c1', nombre:'MXCD' + String(i).padStart(2,'0'), modulos: i < 3 ? 1 : 0 })
    ).concat([
      normalizarSitio({ id:'sc2-1', clienteId:'c2', nombre:'ÚNICO', modulos:0 })
    ]);
    irAlClienteEnClientes('c1');
  });
  await page.waitForTimeout(300);

  // --------- 1) Estado inicial: compacto, 8 filas, botón "y 6 más…" ---------
  const inicial = await page.evaluate(() => {
    const boton = document.querySelector('[data-accion="vista-lista"][data-campo="sitiosResumenVista"]');
    return {
      filas: document.querySelectorAll('.fila-resumen [data-ir-sitio-resumen]').length,
      textoBoton: boton ? boton.textContent.trim() : null,
      modoBoton: boton ? boton.dataset.modo : null,
      esBoton: boton ? boton.tagName === 'BUTTON' : false
    };
  });
  chkF('Arranca compacto: 8 sitios visibles de 14', inicial.filas === 8);
  chkF('El "y N más…" SÍ es un <button> real (antes era un <div> sin acción)', inicial.esBoton);
  chkF('Dice "y 6 más…" (14 - 8)', inicial.textoBoton === 'y 6 más…');
  chkF('Su data-modo apunta a "todos" (para expandir)', inicial.modoBoton === 'todos');

  // --------- 2) Clic real: expande a los 14, cambia a "Ver menos" ---------
  await page.locator('[data-accion="vista-lista"][data-campo="sitiosResumenVista"]').click();
  await page.waitForTimeout(150);
  const expandido = await page.evaluate(() => {
    const boton = document.querySelector('[data-accion="vista-lista"][data-campo="sitiosResumenVista"]');
    return {
      filas: document.querySelectorAll('.fila-resumen [data-ir-sitio-resumen]').length,
      textoBoton: boton.textContent.trim(),
      modoBoton: boton.dataset.modo,
      ultimoVisible: document.querySelector('[data-ir-sitio-resumen="s13"]') !== null
    };
  });
  chkF('Clic real en "y N más…" expande a los 14 sitios completos', expandido.filas === 14);
  chkF('El último sitio (antes oculto) ya está en el DOM', expandido.ultimoVisible);
  chkF('El botón ahora dice "Ver menos"', expandido.textoBoton === 'Ver menos');
  chkF('Su data-modo ahora apunta a "compacto" (para volver a colapsar)', expandido.modoBoton === 'compacto');

  // --------- 3) Clic en "Ver menos": vuelve a colapsar a 8 ---------
  await page.locator('[data-accion="vista-lista"][data-campo="sitiosResumenVista"]').click();
  await page.waitForTimeout(150);
  const colapsado = await page.evaluate(() => document.querySelectorAll('.fila-resumen [data-ir-sitio-resumen]').length);
  chkF('Clic en "Ver menos" vuelve a colapsar a 8 sitios', colapsado === 8);

  // --------- 4) Un cliente sin sitios de sobra no trae el botón ---------
  await page.evaluate(() => { irAlClienteEnClientes('c2'); });
  await page.waitForTimeout(200);
  const sinBoton = await page.evaluate(() => document.querySelector('[data-accion="vista-lista"][data-campo="sitiosResumenVista"]') === null);
  chkF('Un cliente con 1 solo sitio no muestra ningún botón de "ver más" (nada que expandir)', sinBoton);

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
