/* Reporte de Victor (21-sep-2026, con la vista previa de "Guardar como PDF"
   mostrando "6 páginas" y una hoja en blanco al final): "al momento de
   guardarlo emite una hoja al final en blanco, puedes hacer que la ultima
   hoja se vea como la de la portada pero sola y exclusivamente con el
   logotipo de forguard".

   Dos cosas distintas, las dos en este archivo:

   1) Causa raíz de la hoja en blanco: @media print le pedía a CADA .page
      (con page-break-after:always) un salto de página después de ella —
      incluida la ÚLTIMA. Chrome obedece ese salto abriendo una hoja extra
      en blanco al guardar como PDF. Se agrega .page:last-child{page-break-
      after:auto} para que ya no lo pida.

   2) Pedido explícito: en vez de que la última hoja quede vacía sin más,
      ahora la plantilla agrega a propósito una hoja de cierre — mismo
      logotipo de Forguard que trae la portada (página 1), pero SOLA, sin
      cabecera, metabar, tabla ni pie — como página final de branding.

   Actualización (23-sep-2026, mismo pedido de Victor): "añade la hoja de
   azul del inicio de pólizas de portada a ... proyectos imagen" — ahora
   además hay una portada de verdad al principio (antes la "página 1" ERA
   el resumen de costos; ahora es la portada navy/azul, y el resumen pasa
   a ser la segunda hoja). Por eso el documento de este test pasa de 2 a 3
   hojas: portada + resumen de costos + cierre. */
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
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'BANREGIO' })];
    datos.proyectosImagen = [normalizarProyectoImagen({
      id:'pi1', clienteId:'c1', clienteNombre:'BANREGIO', sitioNombre:'Back Office I',
      nombreProyecto:'Remodelación comedor', tipo:'apertura', estatus:'diseno', fecha:hoyISO(),
      conceptos: [{ concepto:'Panel vinílico', proveedor:'ZODEK', cantidad:2, costoUnitario:1000, precioVenta:1300 }]
    })];
    sessionStorage.setItem('forguard.documento.imagen', JSON.stringify(armarPayloadProyectoImagen(proyectoImagenPorId('pi1'), false)));
  });

  const [docPage] = await Promise.all([
    context.waitForEvent('page'),
    page.evaluate(() => window.open('docs/plantilla_imagen.html', '_blank'))
  ]);
  docPage.on('pageerror', e => errores.push('PAGEERROR (doc): ' + e.message));
  await docPage.waitForLoadState();
  await docPage.waitForTimeout(400);

  const paginas = await docPage.locator('.page').all();
  chkF('El documento trae exactamente 3 hojas (portada + resumen de costos + cierre, sin imágenes)', paginas.length === 3);

  const portada = paginas[0];
  chkF('La PRIMERA hoja es la portada azul (fondo navy + marca de agua)',
    await portada.evaluate(el => el.classList.contains('cover')) && await portada.locator('.cv-marca').count() === 1);
  chkF('La portada trae el logo y los datos de Cliente/Fecha/Proyecto (con el nombre real del proyecto)',
    await portada.locator('.cv-iso, .cv-logo').count() === 2 && (await portada.locator('.cv-meta').textContent()).includes('Remodelación comedor'));

  const ultima = paginas[paginas.length - 1];
  chkF('La última hoja SÍ trae el logo (isotipo + wordmark)', await ultima.locator('.pagina-cierre svg').count() === 2);
  chkF('La última hoja NO trae cabecera/metabar (va "sola")', await ultima.locator('.metabar').count() === 0 && await ultima.locator('.eyebrow').count() === 0);
  chkF('La última hoja NO trae el pie de contacto', await ultima.locator('.footwrap').count() === 0);
  chkF('La última hoja NO trae la tabla de costos', await ultima.locator('.costos-tabla').count() === 0);

  // La causa raíz de la hoja en blanco: en @media print, la última .page ya
  // NO debe pedir salto de página después de ella (las demás sí).
  await docPage.emulateMedia({ media: 'print' });
  const saltoUltima = await ultima.evaluate(el => getComputedStyle(el).breakAfter || getComputedStyle(el).pageBreakAfter);
  chkF('En impresión, la ÚLTIMA hoja ya NO pide salto de página después (ya no hay hoja en blanco extra)',
    saltoUltima === 'auto');
  if(paginas.length > 1){
    const saltoPrimera = await paginas[0].evaluate(el => getComputedStyle(el).breakAfter || getComputedStyle(el).pageBreakAfter);
    chkF('Las hojas que SÍ tienen una siguiente siguen pidiendo su salto de página normal',
      saltoPrimera === 'always' || saltoPrimera === 'page');
  }

  chkF('No hubo errores de página', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
