/* Aumento de precio por inflación — Cotizaciones (16/17-oct-2026, fase 3 del
   mismo pedido de Victor que test_ajuste_inflacion_polizas.js/forpass.js).
   Mismo primitivo compartido (`aplicarPctCampo`) y mismo molde de bitácora
   (`normalizarAjustePrecio`/`historialAjustes`) — ver esos archivos para las
   3 decisiones de `AskUserQuestion` (alcance de 4 secciones, ambas
   mecánicas, precio y costo por separado).

   A diferencia de Pólizas/Forpass, Cotizaciones NO tiene un precio plano por
   renglón: el costo sí vive en cada partida (`precioCosto`), pero el precio
   al cliente normalmente se DERIVA de costo × margen (`q.margen`, un solo
   número a nivel de TODA la cotización — ver `calcularCotizacion`). Por eso
   el control de precio aquí se llama "Puntos de margen" y se SUMA/RESTA
   directo al margen (15% + 5 puntos = 20%) en vez de aplicarse como % del
   precio final — es la forma honesta de mostrar lo que de verdad cambia, sin
   esconder una fórmula inversa (recalcular qué margen nuevo produciría
   exactamente +X% de precio final) detrás de un campo que diría "%". Un
   renglón con `precioClienteManual` capturado (la única excepción que SÍ es
   un precio plano, no margen) recibe los "puntos de margen" como % normal
   sobre ese número — ahí no hay margen que mover.

   La herramienta masiva solo opera sobre cotizaciones en `estatus:'borrador'`
   — una ya enviada/aceptada/en el pipeline de 13 etapas es un trato ya
   comunicado al cliente; cambiarle el precio por detrás sería lo que
   "congelar precios" en Pólizas trata de evitar. Si hiciera falta corregir
   una de esas, se hace individual desde su propia cotización, a sabiendas.

   Se prueba: el modelo de datos (`historialAjustes` nace vacío); que un
   Analyst no ve ni el botón individual ni el masivo pero un Owner sí; el
   ajuste individual completo (vista previa del margen y totales antes→
   después, que el costo sube igual en TODOS los renglones —incluido uno con
   precio manual—, que un renglón con precio manual recibe los puntos de
   margen como % directo sobre su propio precio en vez de tocar el margen
   general, la entrada de historial, que otra cotización —de otro cliente o
   ya enviada— no se toca); la validación de "captura al menos un
   porcentaje"; y la herramienta masiva (solo cuenta borradores, vista previa
   del total cotizado al cliente, confirmación antes de aplicar, que una
   cotización ya enviada queda fuera, y que aplicar dos veces seguidas
   —individual y luego masivo— COMPONE los dos ajustes sobre el margen). */
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
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'BANORTE' }), normalizarCliente({ id:'c2', nombre:'NGK' })];
    datos.cotizaciones = [
      normalizarCotizacion({ id:'q1', clienteId:'c1', folio:'COT-001', estatus:'borrador', margen:15,
        partidas:[
          { concepto:'Refacción A', cantidad:1, precioCosto:1000 },
          { concepto:'Refacción manual', cantidad:1, precioCosto:500, precioClienteManual:800 }
        ] }),
      normalizarCotizacion({ id:'q2', clienteId:'c2', folio:'COT-002', estatus:'borrador', margen:20,
        partidas:[ { concepto:'Servicio B', cantidad:1, precioCosto:2000 } ] }),
      normalizarCotizacion({ id:'q3', clienteId:'c1', folio:'COT-003', estatus:'enviada', margen:15,
        partidas:[ { concepto:'Ya enviada', cantidad:1, precioCosto:300 } ] })
    ];
  });

  // --------- 1) Modelo de datos ---------
  const modelo = await page.evaluate(() => {
    const q = cotizacionPorId('q1');
    return { historialVacio: Array.isArray(q.historialAjustes) && q.historialAjustes.length === 0 };
  });
  chkF('normalizarCotizacion() nace con historialAjustes vacío', modelo.historialVacio);

  // --------- 2) Rol sin permiso no ve los botones ---------
  await page.evaluate(() => { irAModulo('cotizaciones'); estado.vista='cotizacion'; estado.cotizacionId='q1'; sesion.rol='analyst'; render(); });
  await page.waitForTimeout(200);
  chkF('Analyst NO ve "Aumento por inflación" en la cotización', (await page.locator('[data-accion="ajuste-inflacion-cotizacion"]').count()) === 0);
  await page.evaluate(() => { estado.vista='cotizaciones'; render(); });
  await page.waitForTimeout(150);
  chkF('Analyst NO ve el botón masivo', (await page.locator('[data-accion="ajuste-inflacion-masivo-cotizaciones"]').count()) === 0);
  await page.evaluate(() => { sesion.rol='owner'; render(); });
  await page.waitForTimeout(200);
  chkF('Owner SÍ ve el botón masivo (hay borradores)', (await page.locator('[data-accion="ajuste-inflacion-masivo-cotizaciones"]').count()) === 1);

  // --------- 3) Ajuste individual: 5 puntos de margen + 10% costo en q1 ---------
  await page.evaluate(() => { estado.vista='cotizacion'; estado.cotizacionId='q1'; render(); });
  await page.waitForTimeout(200);
  chkF('Owner SÍ ve "Aumento por inflación" en la cotización', (await page.locator('[data-accion="ajuste-inflacion-cotizacion"]').count()) === 1);
  await page.click('[data-accion="ajuste-inflacion-cotizacion"]');
  await page.waitForTimeout(150);
  chkF('El modal individual abre', (await page.locator('#modalTitulo', { hasText: 'Aumento / descuento de precio' }).count()) === 1);
  await page.fill('#aciPuntosMargen', '5');
  await page.fill('#aciPctCosto', '10');
  await page.waitForTimeout(100);
  chkF('La vista previa muestra el margen antes → después', (await page.locator('#aciPreview').innerText()).includes('15%') && (await page.locator('#aciPreview').innerText()).includes('20%'));
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);

  const tras1 = await page.evaluate(() => {
    const q = cotizacionPorId('q1');
    return {
      margen: q.margen,
      costoA: q.partidas.find(x=>x.concepto==='Refacción A').precioCosto,
      manualCosto: q.partidas.find(x=>x.concepto==='Refacción manual').precioCosto,
      manualPrecio: q.partidas.find(x=>x.concepto==='Refacción manual').precioClienteManual,
      historial: q.historialAjustes.length,
      ultimo: q.historialAjustes[0]
    };
  });
  chkF('Margen 15% + 5 puntos = 20%', tras1.margen === 20);
  chkF('Costo de "Refacción A" 1000 → 1100 (+10%)', tras1.costoA === 1100);
  chkF('Costo de "Refacción manual" 500 → 550 (+10%, el costo SIEMPRE sube igual)', tras1.manualCosto === 550);
  chkF('precioClienteManual 800 → 840 (+5%, puntosMargen aplicado como % directo a un precio manual)', tras1.manualPrecio === 840);
  chkF('Queda una entrada en historialAjustes', tras1.historial === 1);
  chkF('La entrada trae tipo aumento, pctPrecio=5 (puntos), pctCosto=10', tras1.ultimo.tipo === 'aumento' && tras1.ultimo.pctPrecio === 5 && tras1.ultimo.pctCosto === 10);

  const otras = await page.evaluate(() => ({
    q2margen: cotizacionPorId('q2').margen,
    q3costo: cotizacionPorId('q3').partidas[0].precioCosto
  }));
  chkF('q2 (otro cliente) no se tocó', otras.q2margen === 20);
  chkF('q3 (ya enviada) no se tocó', otras.q3costo === 300);

  // --------- 4) Validación sin porcentajes ---------
  await page.evaluate(() => { estado.vista='cotizacion'; estado.cotizacionId='q2'; render(); });
  await page.waitForTimeout(150);
  await page.click('[data-accion="ajuste-inflacion-cotizacion"]');
  await page.waitForTimeout(150);
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(150);
  chkF('Sin porcentaje capturado, avisa y no aplica', (await page.locator('#toast', { hasText: 'Captura al menos un porcentaje' }).count()) === 1);
  await page.click('[data-modal="cancelar"]');
  await page.waitForTimeout(150);

  // --------- 5) Herramienta masiva: solo borradores ---------
  await page.evaluate(() => { estado.vista='cotizaciones'; render(); });
  await page.waitForTimeout(150);
  await page.click('[data-accion="ajuste-inflacion-masivo-cotizaciones"]');
  await page.waitForTimeout(150);
  chkF('El modal masivo abre', (await page.locator('#modalTitulo', { hasText: 'Aumento / descuento de precio por inflación — Cotizaciones' }).count()) === 1);
  chkF('Menciona 2 borradores (q3 enviada queda fuera)', (await page.locator('.pista').first().innerText()).includes('2'));

  await page.fill('#acmPuntosMargen', '5');
  await page.waitForTimeout(100);
  chkF('La vista previa masiva dice "Cotizaciones afectadas: 2"', (await page.locator('#acmPreview').innerText()).includes('2'));
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);
  chkF('Pide confirmación antes de aplicar en bloque', (await page.locator('#modalTitulo', { hasText: 'Aplicar aumento de precio' }).count()) === 1);
  await page.click('button[data-modal="guardar"]');
  await page.waitForTimeout(250);

  const tras2 = await page.evaluate(() => ({
    q1Margen: cotizacionPorId('q1').margen,
    q2Margen: cotizacionPorId('q2').margen,
    q3Margen: cotizacionPorId('q3').margen,
    q1Historial: cotizacionPorId('q1').historialAjustes.length
  }));
  chkF('q1 (ya en 20%) sube otros 5 puntos → 25%', tras2.q1Margen === 25);
  chkF('q2 (nunca ajustada) sube 5 puntos → 25%', tras2.q2Margen === 25);
  chkF('q3 (ya enviada) sigue sin tocarse', tras2.q3Margen === 15);
  chkF('q1 ahora trae 2 entradas en su historial', tras2.q1Historial === 2);

  chkF('No hubo errores de página en todo el escenario', errores.length === 0);
  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
