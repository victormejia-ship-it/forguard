/* Pedido de Victor (23-sep-2026, con captura del documento de Imagen/
   Aperturas ya cerrando bien con el logo): "Todos los documentos que
   puedas emitir puedes añadirle la última página de Forguard para que se
   vea un final también" — se aplicó el mismo patrón (hoja de cierre solo
   con el logo + arreglo de la hoja en blanco de más al imprimir,
   page-break-after en la última hoja) a los otros 4 documentos que usan
   el mismo molde de paginación por medición (.page/.sheet, isotipo()/
   logotipo()): Cotizaciones, Órdenes de Compra, Levantamientos y Pólizas.

   Quedaron FUERA a propósito plantilla_resultados.html y
   plantilla_ruta_visitas.html: son documentos operativos internos, sin la
   identidad de marca de los otros cinco (sin isotipo/logotipo, sin
   Poppins embebida, paginación automática del navegador en vez de medir/
   cortar) — sus propios comentarios lo dicen explícito ("no es uno que se
   le entrega al cliente"). Agregarles una hoja de cierre grande con el
   logo es una decisión de diseño aparte, no algo que se coló al copiar el
   patrón de los otros cinco. */
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
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'NGK' })];
    datos.sitios = [normalizarSitio({ id:'s1', clienteId:'c1', nombre:'NGK' })];

    datos.cotizaciones = [normalizarCotizacion({
      id:'q1', clienteId:'c1', sitioId:'s1', folio:'COT-001',
      partidas: [{ concepto:'Refacción de prueba', cantidad:1, um:'pza', precioCosto:1000 }]
    })];
    datos.ordenesCompra = [normalizarOrdenCompra({
      id:'o1', folio:'OC-001', proveedorNombre:'Proveedor de prueba',
      renglones: [{ concepto:'Material de prueba', cantidad:1, precioUnitario:500 }]
    })];
    datos.levantamientos = [normalizarLevantamiento({
      id:'l1', clienteId:'c1', sitioId:'s1', sitioNombre:'NGK', folio:'LV-001',
      hallazgos: [{ hallazgo:'Hallazgo de prueba', ubicacion:'Cocina' }]
    })];
    datos.polizas = [normalizarPoliza({
      id:'p1', clienteId:'c1', sitioId:'s1', folio:'POL-001', sitioNombre:'NGK',
      estatus:'activa', facturacion:'mensual', cargoA:'cliente',
      fechaInicio:'2026-01-01', fechaCotizacion:'2026-01-01',
      partidas: [{ id:'x1', concepto:'Equipo de prueba', cantidad:1, precioUnitario:1000, frecuencia:1, mesesServicio:[0] }],
      cobros:[false]
    })];
  });

  async function abrirYRevisar(nombre, prepararEnPagina, archivo){
    const [docPage] = await Promise.all([
      context.waitForEvent('page'),
      page.evaluate(prepararEnPagina)
    ]);
    docPage.on('pageerror', e => errores.push('PAGEERROR (' + nombre + '): ' + e.message));
    await docPage.waitForLoadState();
    await docPage.waitForTimeout(500);

    const totalPaginas = await docPage.locator('.page').count();
    const ultima = docPage.locator('.page').last();
    const traeCierre = await ultima.locator('.pagina-cierre').count() === 1;
    const traeDosSvg = await ultima.locator('.pagina-cierre svg').count() === 2;
    const sinCabecera = await ultima.locator('.metabar, .cab, .cv-titulo').count() === 0;

    chkF(nombre + ': el documento SÍ trae más de una hoja (con la de cierre incluida)', totalPaginas >= 2);
    chkF(nombre + ': la ÚLTIMA hoja es la de cierre (isotipo + wordmark)', traeCierre && traeDosSvg);
    chkF(nombre + ': la hoja de cierre va sola, sin cabecera de las demás hojas', sinCabecera);

    await docPage.emulateMedia({ media: 'print' });
    const salto = await ultima.evaluate(el => getComputedStyle(el).breakAfter || getComputedStyle(el).pageBreakAfter);
    chkF(nombre + ': en impresión, la ÚLTIMA hoja ya no pide salto de página después (sin hoja en blanco extra)', salto === 'auto');

    await docPage.close();
  }

  await abrirYRevisar('Cotización', () => {
    sessionStorage.setItem('forguard.documento.cotizacion', JSON.stringify(armarPayloadCotizacion(cotizacionPorId('q1'), 'cliente')));
    window.open('docs/plantilla_cotizacion.html', '_blank');
  });

  await abrirYRevisar('Orden de compra', () => {
    sessionStorage.setItem('forguard.documento.ordenCompra', JSON.stringify(armarPayloadOrdenCompra(ordenCompraPorId('o1'))));
    window.open('docs/plantilla_orden_compra.html', '_blank');
  });

  await abrirYRevisar('Levantamiento', () => {
    sessionStorage.setItem('forguard.documento.levantamiento', JSON.stringify(armarPayloadLevantamiento(levantamientoPorId('l1'))));
    window.open('docs/plantilla_levantamiento.html', '_blank');
  });

  await abrirYRevisar('Póliza', () => {
    sessionStorage.setItem('forguard.documento.poliza', JSON.stringify(armarPayloadPoliza(polizaPorId('p1'))));
    window.open('docs/plantilla_poliza_forguard.html', '_blank');
  });

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
