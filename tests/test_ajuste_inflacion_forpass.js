/* Aumento de precio por inflación — Forpass (16/17-oct-2026, fase 2 del
   mismo pedido de Victor que test_ajuste_inflacion_polizas.js: "necesito
   que podamos valorar el como impactar un aumento de precio conforme a la
   inflación a todos nuestros servicios... en todas las secciones"). Mismo
   primitivo compartido (`aplicarPctCampo`) y mismo molde de bitácora
   (`normalizarAjustePrecio`/`historialAjustes`) que Pólizas — ver ese
   archivo para el porqué de las 3 decisiones de AskUserQuestion (alcance de
   4 secciones, ambas mecánicas, precio y costo por separado).

   En Forpass el precio vive en `mensualidad` (lo que se cobra, sea renta/
   licencia recurrente o venta) y el costo en `forpassCosto` (nuestro costo
   del hardware instalado) — ambos campos de `datos.sitios`, no una colección
   aparte (`normalizarSitio`). `aplicarAjusteInflacionSitio(s, tipo,
   pctPrecio, pctCosto, quien)` reescribe los dos y dispara `guardarSitio`.
   `forpassRentaAdicional` se deja fuera a propósito: es un campo secundario
   (solo aplica con Tipo de cargo "Venta") que Victor no pidió tocar aquí —
   se sigue editando a mano si hiciera falta.

   El botón individual (`modalAjusteInflacionSitio`) vive en la tarjeta de
   CADA sitio, dentro de la ficha del cliente en Forpass (`vistaCliente()`,
   `tarjetaSitio()`) — no en el dashboard general de Forpass, que solo lista
   clientes. La herramienta masiva (`modalAjusteInflacionMasivoForpass`) sí
   vive en ese dashboard (`vistaClientes()`) y solo opera sobre sitios con
   Forpass ACTIVO (`modulos > 0 && estado === 'activo'`, el mismo candado
   que ya usa Resultados para contar MRR) — uno pausado o de baja no cobra
   nada hoy, así que se ajusta aparte si hiciera falta.

   Permiso: SIEMPRE `exigirAdmin()`, igual que en Pólizas — aunque Forpass no
   tiene una regla de Firestore que congele precios por campo como `/polizas`,
   se mantiene el mismo criterio de "esto es una decisión de negocio, no una
   captura diaria" en las dos secciones, para que el comportamiento sea
   predecible en cualquier parte de la app.

   Se prueba: el modelo de datos (`historialAjustes` nace vacío); que un
   Analyst no ve ni el botón individual ni el masivo, pero un Owner sí (el
   individual aparece en CUALQUIER sitio del cliente, activo o pausado — es
   una corrección manual, no está sujeto al mismo candado que el masivo); el
   ajuste individual completo (vista previa antes→después, aplicación real a
   mensualidad Y costo con porcentajes distintos, la entrada de historial,
   que otro sitio —de otro cliente o pausado— no se toca); la validación de
   "captura al menos un porcentaje"; la herramienta masiva (solo cuenta
   sitios activos, vista previa del total de sitios y mensualidad antes/
   después, confirmación antes de aplicar, que un sitio pausado queda fuera,
   y que aplicar dos veces seguidas —individual y luego masivo— COMPONE los
   dos ajustes); y el filtro "un solo cliente" del masivo. */
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
    datos.sitios = [
      normalizarSitio({ id:'s1', clienteId:'c1', nombre:'Torre Esmeralda', modulos:2, estado:'activo', mensualidad:1000, forpassCosto:600, fechaInicio:'2026-01-01' }),
      normalizarSitio({ id:'s2', clienteId:'c2', nombre:'Planta NGK', modulos:3, estado:'activo', mensualidad:2000, forpassCosto:1200, fechaInicio:'2026-01-01' }),
      normalizarSitio({ id:'s3', clienteId:'c1', nombre:'Pausado', modulos:1, estado:'pausado', mensualidad:500, forpassCosto:300, fechaInicio:'2026-01-01' })
    ];
  });

  // --------- 1) Modelo de datos ---------
  const modelo = await page.evaluate(() => {
    const s = sitioPorId('s1');
    return { historialVacio: Array.isArray(s.historialAjustes) && s.historialAjustes.length === 0 };
  });
  chkF('normalizarSitio() nace con historialAjustes vacío', modelo.historialVacio);

  // --------- 2) Permiso: Analyst no ve el botón, Owner sí ---------
  // Los sitios se muestran en la ficha de CADA cliente dentro de Forpass
  // (vistaCliente()), no en el dashboard general — s1 y s3 son de c1.
  await page.evaluate(() => { irAModulo('forpass'); estado.vista='cliente'; estado.clienteId='c1'; sesion.rol='analyst'; render(); });
  await page.waitForTimeout(200);
  chkF('Analyst NO ve "Aumento por inflación" por sitio', (await page.locator('[data-ajuste-inflacion-sitio]').count()) === 0);
  await page.evaluate(() => { estado.vista='clientes'; render(); });
  await page.waitForTimeout(150);
  chkF('Analyst NO ve el botón masivo en el encabezado de Forpass', (await page.locator('[data-accion="ajuste-inflacion-masivo-forpass"]').count()) === 0);
  await page.evaluate(() => { sesion.rol='owner'; render(); });
  await page.waitForTimeout(200);
  chkF('Owner SÍ ve el botón masivo', (await page.locator('[data-accion="ajuste-inflacion-masivo-forpass"]').count()) === 1);
  await page.evaluate(() => { estado.vista='cliente'; estado.clienteId='c1'; render(); });
  await page.waitForTimeout(200);
  chkF('Owner SÍ ve "Aumento por inflación" en la tarjeta del sitio activo s1 de c1 (s3 está pausado, también sin el botón de fusionar pero sí este)', (await page.locator('[data-ajuste-inflacion-sitio]').count()) === 2);

  // --------- 3) Ajuste individual sobre s1 ---------
  await page.click('[data-ajuste-inflacion-sitio="s1"]');
  await page.waitForTimeout(150);
  chkF('El modal individual abre', (await page.locator('#modalTitulo', { hasText: 'Aumento / descuento de precio — Forpass' }).count()) === 1);
  await page.fill('#afiPctPrecio', '10');
  await page.fill('#afiPctCosto', '5');
  await page.waitForTimeout(100);
  chkF('La vista previa muestra mensualidad antes → después', (await page.locator('#afiPreview').innerText()).includes('→'));
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);

  const tras1 = await page.evaluate(() => {
    const s = sitioPorId('s1');
    return { mensualidad: s.mensualidad, costo: s.forpassCosto, historial: s.historialAjustes.length, ultimo: s.historialAjustes[0] };
  });
  chkF('s1: mensualidad 1000 → 1100 (+10%)', tras1.mensualidad === 1100);
  chkF('s1: costo 600 → 630 (+5%)', tras1.costo === 630);
  chkF('Queda una entrada en historialAjustes', tras1.historial === 1);
  chkF('La entrada trae tipo aumento, 10% precio, 5% costo', tras1.ultimo.tipo === 'aumento' && tras1.ultimo.pctPrecio === 10 && tras1.ultimo.pctCosto === 5);

  const otros = await page.evaluate(() => ({ s2: sitioPorId('s2').mensualidad, s3: sitioPorId('s3').mensualidad }));
  chkF('s2 (otro cliente) no se tocó', otros.s2 === 2000);
  chkF('s3 (pausado) no se tocó', otros.s3 === 500);

  // --------- 4) Validación sin porcentajes ---------
  await page.evaluate(() => { estado.vista='cliente'; estado.clienteId='c2'; render(); });
  await page.waitForTimeout(150);
  await page.click('[data-ajuste-inflacion-sitio="s2"]');
  await page.waitForTimeout(150);
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(150);
  chkF('Sin porcentaje capturado, avisa y no aplica', (await page.locator('#toast', { hasText: 'Captura al menos un porcentaje' }).count()) === 1);
  await page.click('[data-modal="cancelar"]');
  await page.waitForTimeout(150);

  // --------- 5) Herramienta masiva: solo sitios activos, vista previa, confirmación ---------
  await page.evaluate(() => { estado.vista='clientes'; render(); });
  await page.waitForTimeout(150);
  await page.click('[data-accion="ajuste-inflacion-masivo-forpass"]');
  await page.waitForTimeout(150);
  chkF('El modal masivo abre', (await page.locator('#modalTitulo', { hasText: 'Aumento / descuento de precio por inflación — Forpass' }).count()) === 1);
  chkF('Menciona 2 sitios activos (s3 pausado queda fuera)', (await page.locator('.pista').first().innerText()).includes('2'));

  await page.fill('#afmPctPrecio', '20');
  await page.waitForTimeout(100);
  chkF('La vista previa masiva dice "Sitios afectados: 2"', (await page.locator('#afmPreview').innerText()).includes('2'));
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);
  chkF('Pide confirmación antes de aplicar en bloque', (await page.locator('#modalTitulo', { hasText: 'Aplicar aumento de precio' }).count()) === 1);
  await page.click('button[data-modal="guardar"]');
  await page.waitForTimeout(250);

  const tras2 = await page.evaluate(() => ({
    s1: sitioPorId('s1').mensualidad, s2: sitioPorId('s2').mensualidad, s3: sitioPorId('s3').mensualidad,
    s1Historial: sitioPorId('s1').historialAjustes.length
  }));
  chkF('s1 (ya en 1100) sube otro 20% → 1320', tras2.s1 === 1320);
  chkF('s2 (nunca ajustado) sube 20% → 2400', tras2.s2 === 2400);
  chkF('s3 (pausado) sigue sin tocarse', tras2.s3 === 500);
  chkF('s1 ahora trae 2 entradas en su historial', tras2.s1Historial === 2);

  // --------- 6) Filtro por cliente en el masivo ---------
  await page.click('[data-accion="ajuste-inflacion-masivo-forpass"]');
  await page.waitForTimeout(150);
  await page.selectOption('#afmAlcance', 'cliente');
  await page.waitForTimeout(100);
  await page.selectOption('#afmCliente', { label: 'NGK' });
  await page.fill('#afmPctPrecio', '10');
  await page.waitForTimeout(100);
  chkF('Filtrado a NGK, la vista previa dice 1 sitio afectado', (await page.locator('#afmPreview').innerText()).includes('1'));
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(150);
  await page.click('button[data-modal="guardar"]');
  await page.waitForTimeout(200);
  const tras3 = await page.evaluate(() => ({ s1: sitioPorId('s1').mensualidad, s2: sitioPorId('s2').mensualidad }));
  chkF('BANORTE (s1) no se movió con el filtro de NGK', tras3.s1 === 1320);
  chkF('NGK (s2) sí subió otro 10% → 2640', tras3.s2 === 2640);

  chkF('No hubo errores de página en todo el escenario', errores.length === 0);
  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
