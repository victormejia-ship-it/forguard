/* "Fusionar sitio" ya existía (modalFusionSitio()/fusionarSitios()) pero
   vivía SOLO en Forpass (tablaSitios()/tarjetaSitio(), dentro de
   vistaCliente()) — y esa pantalla filtra a sitios con `modulos > 0`
   (30-sep-2026, pedido de Victor tras "Quitar Forpass": un sitio sin
   Forpass ya no debe verse en Forpass). El problema: un sitio capturado
   dos veces casi nunca tiene Forpass en AMBAS copias —de hecho, lo más
   común es que ninguna de las dos lo tenga—, así que el botón "Fusionar"
   quedaba inalcanzable justo para el caso que existe para resolver
   (02-oct-2026, pedido de Victor con captura real de un cliente —Mercado
   Libre— con varios sitios repetidos, todos "Sin Forpass activo":
   "COMO PUEDO FUSIONAR SITIOS TAMBIEN"). De paso aclaró una duda real:
   "SI LE CAMBIO UNA NOMENCLATURA PERMITE QUE SE FUSIONE CON EL REGISTRO
   EXISTENTE" — no, renombrar un sitio NUNCA lo fusiona solo; la fusión
   siempre es una acción manual y explícita (fusionarSitios() no se llama
   desde ningún lado automático, ver grep en el código).

   El arreglo agrega el mismo botón "Fusionar" (icono, Admin/Owner) al
   bloque "Sitios" de `vistaResumenCliente()` (Clientes) — que SÍ lista
   todos los sitios del cliente, con o sin Forpass — reusando el mismo
   `modalFusionSitio()`/`fusionarSitios()` de siempre, sin tocarlos: el
   título del modal se generaliza de "Fusionar sitio de Forpass" a
   "Fusionar sitio" porque ya no es exclusivo de ahí. */
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
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'MERCADO LIBRE' })];
    // Las dos copias del mismo sitio real, SIN Forpass en ninguna —el caso
    // típico de un duplicado real, y justo el que Forpass no puede mostrar.
    datos.sitios = [
      normalizarSitio({ id:'s1', clienteId:'c1', nombre:'MXNL01', modulos:0 }),
      normalizarSitio({ id:'s2', clienteId:'c1', nombre:'MXNL01 (dup)', modulos:0 })
    ];
    datos.polizas = [normalizarPoliza({ id:'p1', clienteId:'c1', sitioId:'s2', nombreSitio:'MXNL01 (dup)', cliente:'MERCADO LIBRE', estatus:'activa' })];
    datos.cotizaciones = [normalizarCotizacion({ id:'q1', clienteId:'c1', sitioId:'s2', cliente:'MERCADO LIBRE', estatus:'cotizacion' })];
    irAlClienteEnClientes('c1');
  });
  await page.waitForTimeout(300);

  // --------- 1) El botón "Fusionar" ya es alcanzable desde Clientes ---------
  const botones = await page.locator('[data-fusionar-sitio]').count();
  chkF('El bloque "Sitios" de Clientes ya trae un botón "Fusionar" por cada sitio (antes no existía ahí)', botones === 2);

  // --------- 2) Clic real: abre el modal genérico, ya sin decir "de Forpass" ---------
  await page.locator('[data-fusionar-sitio="s2"]').click();
  await page.waitForTimeout(200);
  const titulo = await page.evaluate(() => document.getElementById('modalTitulo').textContent);
  chkF('El modal abre con título "Fusionar sitio" (ya no "...de Forpass", porque ya no es exclusivo de ahí)', titulo.trim() === 'Fusionar sitio');

  // --------- 3) Elegir el sitio bueno y ver el preview correcto ---------
  await page.selectOption('#fsSitio', 's1');
  await page.waitForTimeout(100);
  const preview = await page.evaluate(() => document.getElementById('fsPreview').textContent);
  chkF('El preview dice qué se elimina, qué se conserva, y cuánto recibe (1 póliza, 1 cotización)',
    preview.includes('MXNL01 (dup)') && preview.includes('MXNL01') && /1\s*póliza/.test(preview) && /1\s*cotizaci/.test(preview));

  // --------- 4) Aplicar de verdad: el duplicado desaparece, todo se reasigna ---------
  await page.locator('[data-modal="guardar"]').click();
  await page.waitForTimeout(200);
  const resultado = await page.evaluate(() => ({
    quedan: datos.sitios.map(s => s.id),
    polizaSitio: datos.polizas.find(p => p.id === 'p1').sitioId,
    cotizacionSitio: datos.cotizaciones.find(q => q.id === 'q1').sitioId,
    modalCerrado: !document.getElementById('telon').classList.contains('abierto')
  }));
  chkF('Tras fusionar de verdad, el sitio duplicado (s2) ya no existe, solo queda el bueno (s1)',
    resultado.quedan.length === 1 && resultado.quedan[0] === 's1');
  chkF('La póliza que colgaba del duplicado ya quedó reasignada al sitio que se conservó',
    resultado.polizaSitio === 's1');
  chkF('La cotización que colgaba del duplicado también quedó reasignada',
    resultado.cotizacionSitio === 's1');
  chkF('El modal se cerró solo tras aplicar', resultado.modalCerrado);

  // --------- 5) Sin permiso de Admin, el botón ni siquiera se dibuja ---------
  await page.evaluate(() => {
    datos.sitios = [
      normalizarSitio({ id:'s3', clienteId:'c1', nombre:'OTRO SITIO', modulos:0 })
    ];
    sesion.rol = 'analyst';
    render();
  });
  await page.waitForTimeout(200);
  const sinBotonAnalyst = await page.evaluate(() => document.querySelector('[data-fusionar-sitio]') === null);
  chkF('Un Analyst (no Admin/Owner) no ve el botón "Fusionar" en Clientes', sinBotonAnalyst);

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
