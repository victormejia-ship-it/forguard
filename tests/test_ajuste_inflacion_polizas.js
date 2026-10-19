/* Aumento de precio por inflación — Pólizas de mantenimiento (16/17-oct-2026,
   pedido de Victor): "necesito que podamos valorar el como impactar un
   aumento de precio conforme a la inflación a todos nuestros servicios,
   analiza como se puede implementar en todas las secciones con punto clave
   en polizas de mtto". Antes de construir se usó AskUserQuestion para
   resolver 3 decisiones de diseño, que Victor contestó así:
   1) Alcance: las 4 secciones que cobran algo (Pólizas, Forpass,
      Cotizaciones, Cotización Forpass) en esta misma entrega — "Las 4
      secciones completas". Esta prueba cubre la primera, Pólizas, que es
      el "punto clave" explícito del pedido; las otras 3 llegan en fases
      siguientes con el mismo patrón.
   2) Mecánica: "Ambas opciones" — un botón individual por póliza Y una
      herramienta masiva con vista previa del impacto antes de aplicar.
   3) Qué se ajusta: "Precio y costo por separado" — dos porcentajes
      independientes (`pctPrecio`/`pctCosto`), nunca un solo % que mueva
      los dos igual.

   Dato real que ya anticipaba esto: el catálogo de equipos trae desde el
   21-sep-2026 un histórico de precio (`normalizarEquipo.historial`) con un
   comentario explícito de Victor sobre inflación — pero ESE historial solo
   vive en el catálogo, nunca mueve una partida ya copiada a una póliza (ver
   precioEquipoParaPoliza). Esta función es la pieza que faltaba para tocar
   lo YA capturado.

   `aplicarPctCampo(valor, pct, tipo)` es el primitivo aritmético compartido
   (reusable en las 3 fases que siguen); `normalizarAjustePrecio` es el molde
   de bitácora (`historialAjustes` en la póliza, más reciente primero) —
   mismo criterio de "nunca se borra solo" que ya usa el historial de precio
   del catálogo. `aplicarAjusteInflacionPoliza(p, tipo, pctPrecio, pctCosto,
   quien)` reescribe TODAS las partidas de una póliza de un jalón (mismo
   patrón que `modalAjusteConceptosProyectoImagen`) y dispara `guardarPoliza`,
   que ya sincroniza sola la copia de portal del cliente.

   Permiso: SIEMPRE `exigirAdmin()`, nunca `puedeEditar()` — ver config/
   firestore.rules, `/polizas`: la regla del servidor congela `partidas`
   (precio) en cuanto una póliza deja de ser 'cotizacion'/'enviada'; solo
   Owner/Admin pueden "corregir precios" ahí. Como el caso real es justo
   subir precio a contratos YA activos, un Analyst ni siquiera ve el botón
   — evita un 403 silencioso del servidor tras haber mostrado "aplicado".

   La herramienta masiva (`modalAjusteInflacionMasivoPolizas`) solo opera
   sobre pólizas con `estatus:'activa'` — una en cotización/enviada se sigue
   negociando, y una cancelada no cobra nada; ambas se ajustan, si hace
   falta, una por una desde la póliza. Antes de aplicar en bloque pide una
   confirmación explícita (`confirmar()`), porque mover el precio de varios
   clientes de un jalón no es tan reversible como un campo de texto.

   Se prueba: el modelo de datos (`historialAjustes` nace vacío,
   `aplicarPctCampo` con aumento/descuento/0%/tope en $0); que un Analyst no
   ve el botón pero un Owner sí; el ajuste individual completo (vista previa,
   aplicación real a precio Y costo con porcentajes distintos, la entrada de
   historial, que otras pólizas —de otro cliente o en cotización— no se
   tocan); la validación de "captura al menos un porcentaje"; la herramienta
   masiva (solo cuenta activas, vista previa del total de pólizas e ingreso
   mensual antes/después, confirmación antes de aplicar, que una póliza en
   cotización queda fuera, y que aplicar DOS VECES seguidas a la misma
   póliza —individual y luego masivo— compone los dos ajustes en vez de
   pisar uno con otro); y el filtro "un solo cliente" del masivo, que no
   toca las pólizas de ningún otro cliente. */
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
    const partidas1 = [
      { concepto:'Horno', cantidad:1, precioUnitario:1000, costoUnitario:600, frecuencia:2, mesesServicio:[0,6] },
      { concepto:'Refrigerador', cantidad:2, precioUnitario:500, costoUnitario:300, frecuencia:1, mesesServicio:[0] }
    ];
    datos.polizas = [
      normalizarPoliza({ id:'p1', clienteId:'c1', estatus:'activa', fechaInicio:'2026-01-01', partidas: partidas1 }),
      normalizarPoliza({ id:'p2', clienteId:'c2', estatus:'activa', fechaInicio:'2026-01-01', partidas: [{ concepto:'Kiosko', cantidad:1, precioUnitario:2000, costoUnitario:1200, frecuencia:1, mesesServicio:[0] }] }),
      normalizarPoliza({ id:'p3', clienteId:'c1', estatus:'cotizacion', fechaInicio:'2026-01-01', partidas: [{ concepto:'Campana', cantidad:1, precioUnitario:800, costoUnitario:500, frecuencia:1, mesesServicio:[0] }] })
    ];
  });

  // --------- 1) Modelo de datos: historialAjustes nace vacío ---------
  const modelo = await page.evaluate(() => {
    const p = polizaPorId('p1');
    return { historialVacio: Array.isArray(p.historialAjustes) && p.historialAjustes.length === 0 };
  });
  chkF('normalizarPoliza() nace con historialAjustes vacío', modelo.historialVacio);

  // --------- 2) aplicarPctCampo(): aritmética básica ---------
  const math = await page.evaluate(() => ({
    aumento10: aplicarPctCampo(1000, 10, 'aumento'),
    descuento10: aplicarPctCampo(1000, 10, 'descuento'),
    sinPct: aplicarPctCampo(1000, 0, 'aumento'),
    nuncaNegativo: aplicarPctCampo(100, 500, 'descuento')
  }));
  chkF('aplicarPctCampo(1000, 10%, aumento) = 1100', math.aumento10 === 1100);
  chkF('aplicarPctCampo(1000, 10%, descuento) = 900', math.descuento10 === 900);
  chkF('pct en 0 deja el valor intacto', math.sinPct === 1000);
  chkF('un descuento nunca deja el campo en menos de $0', math.nuncaNegativo === 0);

  // --------- 3) Rol sin permiso NO ve ningún botón de ajuste ---------
  await page.evaluate(() => { irAModulo('polizas'); estado.vista='poliza'; estado.polizaId='p1'; sesion.rol='analyst'; render(); });
  await page.waitForTimeout(200);
  chkF('Analyst NO ve "Aumento por inflación" en la póliza (precio congelado en Firestore salvo Admin)', (await page.locator('[data-accion="ajuste-inflacion-poliza"]').count()) === 0);
  await page.evaluate(() => { sesion.rol='owner'; render(); });
  await page.waitForTimeout(200);
  chkF('Owner SÍ ve el botón individual', (await page.locator('[data-accion="ajuste-inflacion-poliza"]').count()) === 1);

  // --------- 4) Ajuste individual: aumento de 10% precio / 5% costo ---------
  await page.click('[data-accion="ajuste-inflacion-poliza"]');
  await page.waitForTimeout(150);
  chkF('El modal abre', (await page.locator('#modalTitulo', { hasText: 'Aumento / descuento de precio' }).count()) === 1);
  await page.fill('#apiPctPrecio', '10');
  await page.fill('#apiPctCosto', '5');
  await page.waitForTimeout(100);
  chkF('La vista previa muestra el precio anual antes → después', (await page.locator('#apiPreview').innerText()).includes('→'));
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);

  const tras1 = await page.evaluate(() => {
    const p = polizaPorId('p1');
    return {
      horno: { precio: p.partidas.find(x=>x.concepto==='Horno').precioUnitario, costo: p.partidas.find(x=>x.concepto==='Horno').costoUnitario },
      refri: { precio: p.partidas.find(x=>x.concepto==='Refrigerador').precioUnitario, costo: p.partidas.find(x=>x.concepto==='Refrigerador').costoUnitario },
      historial: p.historialAjustes.length,
      ultimo: p.historialAjustes[0]
    };
  });
  chkF('Horno: precio 1000 → 1100 (+10%)', tras1.horno.precio === 1100);
  chkF('Horno: costo 600 → 630 (+5%)', tras1.horno.costo === 630);
  chkF('Refrigerador: precio 500 → 550 (+10%)', tras1.refri.precio === 550);
  chkF('Refrigerador: costo 300 → 315 (+5%)', tras1.refri.costo === 315);
  chkF('Queda UNA entrada en historialAjustes', tras1.historial === 1);
  chkF('La entrada trae tipo aumento, 10% precio, 5% costo, 2 renglones', tras1.ultimo.tipo === 'aumento' && tras1.ultimo.pctPrecio === 10 && tras1.ultimo.pctCosto === 5 && tras1.ultimo.renglonesAfectados === 2);

  // --------- 5) Otra póliza (p3, cotización) y p2 no se tocaron ---------
  const otras = await page.evaluate(() => ({
    p2: polizaPorId('p2').partidas[0].precioUnitario,
    p3: polizaPorId('p3').partidas[0].precioUnitario
  }));
  chkF('La póliza p2 (de otro cliente) no se tocó', otras.p2 === 2000);
  chkF('La póliza p3 (en cotización) no se tocó', otras.p3 === 800);

  // --------- 6) Validación: no deja aplicar con los dos porcentajes en 0 ---------
  await page.evaluate(() => { estado.vista='poliza'; estado.polizaId='p2'; render(); });
  await page.waitForTimeout(150);
  await page.click('[data-accion="ajuste-inflacion-poliza"]');
  await page.waitForTimeout(150);
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(150);
  chkF('Sin ningún porcentaje capturado, avisa y no aplica', (await page.locator('#toast', { hasText: 'Captura al menos un porcentaje' }).count()) === 1);
  await page.click('[data-modal="cancelar"]');
  await page.waitForTimeout(150);

  // --------- 7) Herramienta masiva: Admin ve el botón en la lista ---------
  await page.evaluate(() => { estado.vista='polizas'; render(); });
  await page.waitForTimeout(150);
  chkF('El botón "Aumento por inflación" aparece en la lista de Pólizas (hay activas)', (await page.locator('[data-accion="ajuste-inflacion-masivo-polizas"]').count()) === 1);

  await page.click('[data-accion="ajuste-inflacion-masivo-polizas"]');
  await page.waitForTimeout(150);
  chkF('El modal masivo abre', (await page.locator('#modalTitulo', { hasText: 'Aumento / descuento de precio por inflación' }).count()) === 1);
  chkF('Menciona que son 2 pólizas activas (p1 y p2, p3 sigue en cotización)', (await page.locator('.pista').first().innerText()).includes('2'));

  await page.fill('#amPctPrecio', '20');
  await page.waitForTimeout(100);
  chkF('La vista previa masiva muestra "Pólizas afectadas: 2"', (await page.locator('#amPreview').innerText()).includes('2'));
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);
  chkF('Pide confirmación antes de aplicar en bloque', (await page.locator('#modalTitulo', { hasText: 'Aplicar aumento de precio' }).count()) === 1);
  await page.click('button[data-modal="guardar"]');
  await page.waitForTimeout(250);

  const tras2 = await page.evaluate(() => ({
    p1Horno: polizaPorId('p1').partidas.find(x=>x.concepto==='Horno').precioUnitario,
    p2Kiosko: polizaPorId('p2').partidas[0].precioUnitario,
    p3Campana: polizaPorId('p3').partidas[0].precioUnitario,
    p1Historial: polizaPorId('p1').historialAjustes.length
  }));
  chkF('p1 (ya tenía 1100) sube otro 20% → 1320', tras2.p1Horno === 1320);
  chkF('p2 (nunca ajustada) sube 20% → 2400', tras2.p2Kiosko === 2400);
  chkF('p3 (en cotización) NO se tocó por el masivo', tras2.p3Campana === 800);
  chkF('p1 ahora trae 2 entradas en su historial (la individual + la masiva)', tras2.p1Historial === 2);

  // --------- 8) Filtro "un solo cliente" en el masivo ---------
  await page.evaluate(() => {
    datos.polizas.push(normalizarPoliza({ id:'p4', clienteId:'c2', estatus:'activa', fechaInicio:'2026-01-01', partidas:[{ concepto:'Vitrina', cantidad:1, precioUnitario:3000, costoUnitario:2000, frecuencia:1, mesesServicio:[0] }] }));
    render();
  });
  await page.waitForTimeout(150);
  await page.click('[data-accion="ajuste-inflacion-masivo-polizas"]');
  await page.waitForTimeout(150);
  await page.selectOption('#amAlcance', 'cliente');
  await page.waitForTimeout(100);
  await page.selectOption('#amCliente', { label: 'NGK' });
  await page.fill('#amPctPrecio', '10');
  await page.waitForTimeout(100);
  chkF('Filtrado a NGK, la vista previa dice 2 pólizas afectadas (p2 y p4)', (await page.locator('#amPreview').innerText()).includes('2'));
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(150);
  await page.click('button[data-modal="guardar"]');
  await page.waitForTimeout(200);
  const tras3 = await page.evaluate(() => ({
    p1Horno: polizaPorId('p1').partidas.find(x=>x.concepto==='Horno').precioUnitario,
    p4Vitrina: polizaPorId('p4').partidas[0].precioUnitario
  }));
  chkF('BANORTE (p1) no se movió con el filtro de NGK', tras3.p1Horno === 1320);
  chkF('NGK (p4) sí subió 10% → 3300', tras3.p4Vitrina === 3300);

  chkF('No hubo errores de página en todo el escenario', errores.length === 0);
  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
