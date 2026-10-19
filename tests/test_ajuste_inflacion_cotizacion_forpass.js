/* Aumento de precio por inflación — Cotización Forpass (16/17-oct-2026,
   cuarta y última fase del mismo pedido de Victor que
   test_ajuste_inflacion_polizas.js/forpass.js/cotizaciones.js). Mismo
   primitivo compartido (`aplicarPctCampo`) y mismo molde de bitácora
   (`normalizarAjustePrecio`/`historialAjustes`).

   A diferencia de las otras 3 secciones, aquí NO hay ningún campo de costo:
   una Cotización Forpass es puramente un documento de venta (licenciamiento
   tipo SaaS, ver el comentario grande junto a `normalizarCotizacionForpass`
   — "no tiene costo/margen/precio al cliente como esas"), así que solo
   existe UN porcentaje, de precio. `aplicarAjusteInflacionCotizacionForpass`
   lo aplica a TODO número de venta del documento para que quede consistente:
   `precioBase`/`adicional` de cada sitio, el `precio` de cada renglón de
   implementación (costo de arranque) y el `total` de cada renglón de
   referencia mensual (la tabla informativa).

   El botón individual vive como ícono junto a "Vista previa"/Editar en la
   lista de cotizaciones de CADA cliente (Cotización Forpass no tiene su
   propia pantalla de lista, sus documentos se ven dentro de la ficha de cada
   cliente en Forpass). La herramienta masiva vive en el encabezado del
   dashboard general de Forpass, junto a la de sitios/mensualidad — ambas
   claramente etiquetadas distinto ("Aumento por inflación" para sitios,
   "Aumento en cotizaciones" para estas) para no confundirlas. Solo opera
   sobre cotizaciones en `estatus:'borrador'`, mismo criterio que
   Cotizaciones de servicio: una ya enviada/aceptada es un trato ya
   comunicado al cliente, se corrige individual si hiciera falta.

   Se prueba: el modelo de datos (`historialAjustes` nace vacío); que un
   Analyst no ve ni el ícono individual ni el botón masivo pero un Owner sí;
   el ajuste individual completo (vista previa antes→después, que el % se
   aplica a precioBase/adicional/implementación/referencia mensual TODOS a
   la vez, la entrada de historial con pctCosto=0 porque aquí no aplica, que
   otra cotización —de otro cliente o ya enviada— no se toca); la validación
   de "captura un porcentaje"; la herramienta masiva (solo cuenta borradores,
   vista previa del total mensual cotizado, confirmación antes de aplicar,
   que una enviada queda fuera, y que aplicar dos veces seguidas —individual
   y luego masivo— COMPONE los dos ajustes); y el filtro "un solo cliente". */
const { chromium } = require('playwright');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
const chk = (label, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' - ' + label); return cond; };
let fallas = 0;
const chkF = (label, cond) => { if(!chk(label, cond)) fallas++; };

(async () => {
  const browser = await chromium.launch(OPCIONES_NAVEGADOR);
  const page = await browser.newPage({ viewport: { width: 1300, height: 1600 } });
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
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'Prolec GE' }), normalizarCliente({ id:'c2', nombre:'NGK' })];
    datos.cotizacionesForpass = [
      normalizarCotizacionForpass({ id:'q1', clienteId:'c1', folio:'COTFP-1', estatus:'borrador',
        implementacion:[{ concepto:'Arranque', precio:10000, cantidad:1 }],
        referenciaMensual:[{ concepto:'Base', modulosIncluidos:'2', total:5000 }],
        sitios:[{ nombre:'Planta A', cantidadModulos:2, precioBase:10000, adicional:1000 }] }),
      normalizarCotizacionForpass({ id:'q2', clienteId:'c2', folio:'COTFP-2', estatus:'borrador',
        sitios:[{ nombre:'Planta NGK', cantidadModulos:1, precioBase:5000, adicional:0 }] }),
      normalizarCotizacionForpass({ id:'q3', clienteId:'c1', folio:'COTFP-3', estatus:'enviada',
        sitios:[{ nombre:'Ya enviada', cantidadModulos:1, precioBase:2000, adicional:0 }] })
    ];
  });

  // --------- 1) Modelo de datos ---------
  const modelo = await page.evaluate(() => {
    const q = cotizacionForpassPorId('q1');
    return { historialVacio: Array.isArray(q.historialAjustes) && q.historialAjustes.length === 0 };
  });
  chkF('normalizarCotizacionForpass() nace con historialAjustes vacío', modelo.historialVacio);

  // --------- 2) Permiso y botón individual en la lista por cliente ---------
  await page.evaluate(() => { irAModulo('forpass'); estado.vista='cliente'; estado.clienteId='c1'; sesion.rol='analyst'; render(); });
  await page.waitForTimeout(200);
  chkF('Analyst NO ve el icono de aumento por inflación en la cotización', (await page.locator('[data-ajuste-inflacion-cotizacion-forpass]').count()) === 0);
  await page.evaluate(() => { estado.vista='clientes'; render(); });
  await page.waitForTimeout(150);
  chkF('Analyst NO ve el botón masivo en el dashboard de Forpass', (await page.locator('[data-accion="ajuste-inflacion-masivo-cotizaciones-forpass"]').count()) === 0);
  await page.evaluate(() => { sesion.rol='owner'; render(); });
  await page.waitForTimeout(200);
  chkF('Owner SÍ ve el botón masivo', (await page.locator('[data-accion="ajuste-inflacion-masivo-cotizaciones-forpass"]').count()) === 1);
  await page.evaluate(() => { estado.vista='cliente'; estado.clienteId='c1'; render(); });
  await page.waitForTimeout(200);
  chkF('Owner SÍ ve el icono por cotización (q1 y q3, las 2 de este cliente)', (await page.locator('[data-ajuste-inflacion-cotizacion-forpass]').count()) === 2);

  // --------- 3) Ajuste individual sobre q1: +10% ---------
  await page.click('[data-ajuste-inflacion-cotizacion-forpass="q1"]');
  await page.waitForTimeout(150);
  chkF('El modal individual abre', (await page.locator('#modalTitulo', { hasText: 'Aumento / descuento de precio — Cotización Forpass' }).count()) === 1);
  await page.fill('#acfiPct', '10');
  await page.waitForTimeout(100);
  chkF('La vista previa muestra totales antes → después', (await page.locator('#acfiPreview').innerText()).includes('→'));
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);

  const tras1 = await page.evaluate(() => {
    const q = cotizacionForpassPorId('q1');
    return {
      precioBase: q.sitios[0].precioBase, adicional: q.sitios[0].adicional,
      implPrecio: q.implementacion[0].precio, refTotal: q.referenciaMensual[0].total,
      historial: q.historialAjustes.length, ultimo: q.historialAjustes[0]
    };
  });
  chkF('precioBase 10000 → 11000 (+10%)', tras1.precioBase === 11000);
  chkF('adicional 1000 → 1100 (+10%)', tras1.adicional === 1100);
  chkF('implementación: precio 10000 → 11000 (+10%)', tras1.implPrecio === 11000);
  chkF('referencia mensual: total 5000 → 5500 (+10%)', tras1.refTotal === 5500);
  chkF('Queda una entrada en historialAjustes', tras1.historial === 1);
  chkF('La entrada trae tipo aumento, pctPrecio=10, pctCosto=0 (no aplica aquí)', tras1.ultimo.tipo === 'aumento' && tras1.ultimo.pctPrecio === 10 && tras1.ultimo.pctCosto === 0);

  const otras = await page.evaluate(() => ({
    q2precio: cotizacionForpassPorId('q2').sitios[0].precioBase,
    q3precio: cotizacionForpassPorId('q3').sitios[0].precioBase
  }));
  chkF('q2 (otro cliente) no se tocó', otras.q2precio === 5000);
  chkF('q3 (ya enviada) no se tocó', otras.q3precio === 2000);

  // --------- 4) Validación sin porcentaje ---------
  await page.click('[data-ajuste-inflacion-cotizacion-forpass="q3"]');
  await page.waitForTimeout(150);
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(150);
  chkF('Sin porcentaje capturado, avisa y no aplica', (await page.locator('#toast', { hasText: 'Captura un porcentaje' }).count()) === 1);
  await page.click('[data-modal="cancelar"]');
  await page.waitForTimeout(150);

  // --------- 5) Herramienta masiva: solo borradores ---------
  await page.evaluate(() => { estado.vista='clientes'; render(); });
  await page.waitForTimeout(150);
  await page.click('[data-accion="ajuste-inflacion-masivo-cotizaciones-forpass"]');
  await page.waitForTimeout(150);
  chkF('El modal masivo abre', (await page.locator('#modalTitulo', { hasText: 'Aumento / descuento de precio por inflación — Cotizaciones Forpass' }).count()) === 1);
  chkF('Menciona 2 borradores (q3 enviada queda fuera)', (await page.locator('.pista').first().innerText()).includes('2'));

  await page.fill('#acfmPct', '20');
  await page.waitForTimeout(100);
  chkF('La vista previa masiva dice "Cotizaciones afectadas: 2"', (await page.locator('#acfmPreview').innerText()).includes('2'));
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);
  chkF('Pide confirmación antes de aplicar en bloque', (await page.locator('#modalTitulo', { hasText: 'Aplicar aumento de precio' }).count()) === 1);
  await page.click('button[data-modal="guardar"]');
  await page.waitForTimeout(250);

  const tras2 = await page.evaluate(() => ({
    q1: cotizacionForpassPorId('q1').sitios[0].precioBase,
    q2: cotizacionForpassPorId('q2').sitios[0].precioBase,
    q3: cotizacionForpassPorId('q3').sitios[0].precioBase,
    q1Historial: cotizacionForpassPorId('q1').historialAjustes.length
  }));
  chkF('q1 (ya en 11000) sube otro 20% → 13200', tras2.q1 === 13200);
  chkF('q2 (nunca ajustada) sube 20% → 6000', tras2.q2 === 6000);
  chkF('q3 (ya enviada) sigue sin tocarse', tras2.q3 === 2000);
  chkF('q1 ahora trae 2 entradas en su historial', tras2.q1Historial === 2);

  // --------- 6) Filtro por cliente en el masivo ---------
  await page.click('[data-accion="ajuste-inflacion-masivo-cotizaciones-forpass"]');
  await page.waitForTimeout(150);
  await page.selectOption('#acfmAlcance', 'cliente');
  await page.waitForTimeout(100);
  await page.selectOption('#acfmCliente', { label: 'NGK' });
  await page.fill('#acfmPct', '10');
  await page.waitForTimeout(100);
  chkF('Filtrado a NGK, la vista previa dice 1 cotización afectada', (await page.locator('#acfmPreview').innerText()).includes('1'));
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(150);
  await page.click('button[data-modal="guardar"]');
  await page.waitForTimeout(200);
  const tras3 = await page.evaluate(() => ({ q1: cotizacionForpassPorId('q1').sitios[0].precioBase, q2: cotizacionForpassPorId('q2').sitios[0].precioBase }));
  chkF('Prolec (q1) no se movió con el filtro de NGK', tras3.q1 === 13200);
  chkF('NGK (q2) sí subió otro 10% → 6600', tras3.q2 === 6600);

  chkF('No hubo errores de página en todo el escenario', errores.length === 0);
  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
