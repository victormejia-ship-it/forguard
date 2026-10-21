/* Fotos separadas por equipo en el registro de servicio (07-oct-2026,
   pedido de Victor con una captura real del modal "Registrar servicio",
   un renglón "Marmita ×2"): "cuando realicemos la captura de un
   preventivo en el calendario, si tenemos mas de un equipo que nos pueda
   brindar la opcion de elegir si dimos a uno o a dos y que despliege la
   opcion de cargar fotografias separadas para cada equipo en caso de ser
   necesario" + "Busca la mejor manera de hacer esto".

   modalServicioPoliza() ya traía una sola galería de evidencia compartida
   para todo el registro (evidenciasTmp, subida a Firebase Storage al
   guardar). En vez de inventar un mecanismo nuevo, se le agregó una
   casilla opcional "Fotos separadas por equipo" (solo visible cuando
   x.cantidad > 1) que REPINTA esa misma evidenciasTmp agrupada por un
   nuevo campo `unidad` en normalizarEvidencia (0 = sin asignar/
   compartida, 1..cantidad = la unidad) — activar/desactivar la casilla
   nunca mueve ni borra una foto, solo cambia cómo se ven agrupadas, y
   cada sección de unidad solo aparece mientras esa unidad siga prendida
   en "Equipos atendidos". Nada de esto toca el mecanismo de subida a
   Storage/compresión, que es exactamente el mismo de siempre. */
const { chromium } = require('playwright');
const path = require('path');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
const chk = (label, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' - ' + label); return cond; };
let fallas = 0;
const chkF = (label, cond) => { if(!chk(label, cond)) fallas++; };

const FOTO_PRUEBA = path.join(__dirname, 'fixtures', 'foto_prueba.png');

(async () => {
  const browser = await chromium.launch(OPCIONES_NAVEGADOR);
  const page = await browser.newPage({ viewport: { width: 1200, height: 1400 } });
  const errores = [];
  page.on('pageerror', e => errores.push('PAGEERROR: ' + e.message));
  await page.route('**identitytoolkit.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**securetoken.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**firestore.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**firebasestorage.googleapis.com/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ name: 'x', downloadTokens: 'tok123' })
  }));
  await page.goto(URL_BASE + '/index.html');
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    sesion.correo='owner@a.com'; sesion.uid='u-owner'; sesion.idToken='FAKE'; sesion.refreshToken='F2';
    sesion.expira=Date.now()+3600000; sesion.rol='owner'; sesion.nombre='Victor Owner';
    ocultarAcceso();
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'GRUPO SALINAS' })];
    datos.polizas = [normalizarPoliza({
      id:'p1', clienteId:'c1', folio:'POL-050', sitioNombre:'Torre Esmeralda',
      estatus:'activa', facturacion:'anual', fechaInicio:'2024-01-01', fechaCotizacion:'2024-01-01',
      partidas: [{ id:'x1', concepto:'Marmita', marca:'Madipsa', cantidad:2, precioUnitario:1000, frecuencia:1, mesesServicio:[0] }],
      cobros:[true]
    })];
  });

  // --------- 1) cantidad=1: sin casilla, todo igual que siempre ---------
  await page.evaluate(() => {
    datos.polizas[0].partidas.push(normalizarPartida({ id:'x0', concepto:'Equipo solo', cantidad:1, precioUnitario:500, frecuencia:1, mesesServicio:[0] }));
    modalServicioPoliza('p1', 'x0', 0, false);
  });
  await page.waitForTimeout(150);
  chkF('Con cantidad=1 NO aparece la casilla "Fotos separadas por equipo"', await page.locator('#svFotosSeparadas').count() === 0);
  chkF('Con cantidad=1 la galería sigue siendo una sola, sin secciones de unidad', await page.locator('#svFotosWrap .fotos-unidad').count() === 0);
  chkF('Con cantidad=1 el botón de agregar sigue ahí ("Tomar o elegir foto")', /Tomar o elegir foto/.test(await page.locator('#svFotosWrap').innerText()));
  await page.evaluate(() => cerrarModal());
  await page.waitForTimeout(100);

  // --------- 2) cantidad=2: la casilla existe, empieza apagada ---------
  await page.evaluate(() => modalServicioPoliza('p1', 'x1', 0, false));
  await page.waitForTimeout(150);
  chkF('Con cantidad=2 SÍ aparece la casilla "Fotos separadas por equipo"', await page.locator('#svFotosSeparadas').count() === 1);
  chkF('Empieza apagada (registro nuevo, sin fotos todavía)', !(await page.locator('#svFotosSeparadas').isChecked()));
  chkF('Apagada: una sola galería, sin secciones "Unidad N"', await page.locator('#svFotosWrap .fotos-unidad').count() === 0);

  // --------- 3) Activarla despliega una sección por cada unidad prendida ---------
  await page.check('#svFotosSeparadas');
  await page.waitForTimeout(100);
  // (.fotos-unidad-titulo va en mayúsculas por CSS -text-transform-, igual que
  // el resto de los títulos de sección de la app; se compara en minúsculas.)
  const titulos = (await page.locator('#svFotosWrap .fotos-unidad-titulo').allInnerTexts()).map(t=>t.toLowerCase());
  chkF('Al activarla aparecen 2 secciones (las 2 unidades siguen prendidas por omisión)', titulos.length === 2);
  chkF('Las secciones se llaman "Unidad 1" y "Unidad 2"', titulos.includes('unidad 1') && titulos.includes('unidad 2'));

  // --------- 4) Apagar una unidad en "Equipos atendidos" quita su sección ---------
  await page.locator('.sv-uni').nth(1).click(); // apaga la unidad 2
  await page.waitForTimeout(100);
  const titulosTrasApagar = (await page.locator('#svFotosWrap .fotos-unidad-titulo').allInnerTexts()).map(t=>t.toLowerCase());
  chkF('Al apagar la unidad 2 en "Equipos atendidos", su sección de fotos desaparece', titulosTrasApagar.length === 1 && titulosTrasApagar[0] === 'unidad 1');
  await page.locator('.sv-uni').nth(1).click(); // la vuelve a prender
  await page.waitForTimeout(100);
  chkF('Al prenderla de nuevo, su sección de fotos vuelve a aparecer', (await page.locator('#svFotosWrap .fotos-unidad-titulo').allInnerTexts()).length === 2);

  // --------- 5) Subir una foto a la Unidad 1 la deja SOLO en esa sección ---------
  await page.click('[data-agregar-unidad="1"]');
  await page.setInputFiles('#svArchivoEvidencia', FOTO_PRUEBA);
  await page.waitForTimeout(400);
  const fotosUnidad1 = await page.locator('#svFotosWrap .fotos-unidad').nth(0).locator('.evidencia-foto').count();
  const fotosUnidad2Tras1 = await page.locator('#svFotosWrap .fotos-unidad').nth(1).locator('.evidencia-foto').count();
  chkF('La foto subida a "Foto de la unidad 1" aparece en la sección Unidad 1', fotosUnidad1 === 1);
  chkF('...y NO en la sección Unidad 2', fotosUnidad2Tras1 === 0);

  // --------- 6) Subir otra a la Unidad 2 ---------
  await page.click('[data-agregar-unidad="2"]');
  await page.setInputFiles('#svArchivoEvidencia', FOTO_PRUEBA);
  await page.waitForTimeout(400);
  chkF('La segunda foto, subida a la unidad 2, aparece ahí', await page.locator('#svFotosWrap .fotos-unidad').nth(1).locator('.evidencia-foto').count() === 1);
  chkF('La unidad 1 sigue con solo su propia foto (no se mezclaron)', await page.locator('#svFotosWrap .fotos-unidad').nth(0).locator('.evidencia-foto').count() === 1);

  // --------- 7) Apagar la casilla junta todo en una sola galería, sin perder nada ---------
  await page.uncheck('#svFotosSeparadas');
  await page.waitForTimeout(100);
  chkF('Al apagar la casilla, desaparecen las secciones por unidad', await page.locator('#svFotosWrap .fotos-unidad').count() === 0);
  chkF('Las 2 fotos siguen ahí, juntas en una sola galería', await page.locator('#svFotosWrap .galeria-evidencia .evidencia-foto').count() === 2);

  // --------- 8) Reactivarla reparte las fotos EXACTAMENTE como estaban ---------
  await page.check('#svFotosSeparadas');
  await page.waitForTimeout(100);
  chkF('Al reactivar, la unidad 1 sigue con su foto', await page.locator('#svFotosWrap .fotos-unidad').nth(0).locator('.evidencia-foto').count() === 1);
  chkF('...y la unidad 2 con la suya — nada se perdió ni se movió', await page.locator('#svFotosWrap .fotos-unidad').nth(1).locator('.evidencia-foto').count() === 1);

  // --------- 9) Guardar: el registro final trae cada foto con su `unidad` correcta ---------
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(600);
  const hechos = await page.evaluate(() => (datos.polizas.find(p=>p.id==='p1').hechos.x1 || {})['0']);
  chkF('El servicio quedó guardado con las 2 unidades atendidas', !!hechos && hechos.hechas === 2);
  chkF('Quedaron 2 evidencias en total', !!hechos && Array.isArray(hechos.evidencias) && hechos.evidencias.length === 2);
  chkF('Una evidencia quedó marcada unidad:1 y la otra unidad:2',
    !!hechos && hechos.evidencias.some(e=>e.unidad===1) && hechos.evidencias.some(e=>e.unidad===2));
  chkF('Las dos evidencias ya traen URL de Storage, no base64 (se subieron de verdad)',
    !!hechos && hechos.evidencias.every(e=>e.dataUrl.startsWith('https://firebasestorage.googleapis.com/')));

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);
  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
