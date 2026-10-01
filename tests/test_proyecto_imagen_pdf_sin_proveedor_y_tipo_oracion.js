/* Dos pedidos de Victor sobre Proyectos de Imagen (01-oct-2026), con
   captura de un desglose real importado:

   1) "en la seccion de imagen y poryectos, necesito que al generar un pdf
      pueda ser sin los proveedores, esto solo al momento de darle clic a
      'generar PDF', en el de costos si se pueden seguir mostrando los
      proveedores" — el PDF normal (precio de venta, botón "Generar PDF")
      ya no debe traer la columna Proveedor; el "PDF con costos" (uso
      interno, solo Admin) sí la sigue trayendo. Antes la columna y sus 5
      renglones de totales (colspan=4) aparecían en los dos.

   2) "Adicional requiero que se respete a pesar de ser importado el
      archivo la escritura 'Tipo oración' ya que existen algunos conceptos
      escritos en mayúsculas" — aOracion() ya existía y ya se usaba en
      normalizarConceptoProyecto(), pero se rinde en cuanto el texto trae
      UNA sola minúscula (pensado para no atropellar "Horno Rational") —
      un concepto real importado en mayúsculas casi siempre trae alguna
      abreviatura con minúscula pegada ("Mts.", "m.") que lo salvaba de
      convertirse sin que esa fuera la intención. Se agregó
      aOracionTolerante() —mide la PROPORCIÓN de mayúsculas, no si hay
      alguna minúscula— y se usa solo en normalizarConceptoProyecto(); el
      resto de los ~20 usos de aOracion() en la app no se tocan. */
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
  });

  // --------- 1) aOracionTolerante(): tolera una abreviatura en minúscula sin dejar de convertir ---------
  const casos = await page.evaluate(() => ({
    conAbreviatura: aOracionTolerante('ACRILICO TRANSPARENTE 1.35 X 1.8 Mts. CON 4 CHAPETONES DE ALUMINIO'),
    conAbreviaturaCorta: aOracionTolerante('VINIL MICROPERFORADO VENTANA DE 1.80 X 1.22 m.'),
    marcaPropia: aOracionTolerante('Horno Rational'),
    yaEnMinusculas: aOracionTolerante('suministro de materiales varios'),
    todoMayusSinMinuscula: aOracionTolerante('SUMINISTRO DE MATERIALES ELECTRICOS')
  }));
  chkF('Mayúsculas + abreviatura larga ("Mts.") SÍ se convierte a Tipo oración', casos.conAbreviatura === 'Acrilico transparente 1.35 x 1.8 mts. con 4 chapetones de aluminio');
  chkF('Mayúsculas + abreviatura corta ("m.") SÍ se convierte', casos.conAbreviaturaCorta === 'Vinil microperforado ventana de 1.80 x 1.22 m.');
  chkF('Una marca/nombre propio ya bien escrito ("Horno Rational") NO se toca', casos.marcaPropia === 'Horno Rational');
  chkF('Un texto ya en minúsculas se deja tal cual', casos.yaEnMinusculas === 'suministro de materiales varios');
  chkF('El caso de siempre (todo mayúsculas, sin ninguna minúscula) sigue funcionando', casos.todoMayusSinMinuscula === 'Suministro de materiales electricos');

  // --------- 2) normalizarConceptoProyecto() usa aOracionTolerante, no el aOracion() de siempre ---------
  const conceptoNormalizado = await page.evaluate(() =>
    normalizarConceptoProyecto({ concepto: 'ACRILICO TRANSPARENTE 1.35 X 1.8 Mts. CON 4 CHAPETONES DE ALUMINIO' }).concepto
  );
  chkF('Un concepto real (de Excel importado) se normaliza a Tipo oración de verdad', conceptoNormalizado === 'Acrilico transparente 1.35 x 1.8 mts. con 4 chapetones de aluminio');

  // --------- 3) El PDF normal ("Generar PDF") ya NO trae la columna Proveedor ---------
  await page.evaluate(() => {
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'Cliente Prueba' })];
    datos.sitios = [normalizarSitio({ id:'s1', clienteId:'c1', nombre:'Cliente Prueba' })];
    datos.proyectosImagen = [normalizarProyectoImagen({
      id:'pi1', clienteId:'c1', sitioId:'s1', sitioNombre:'Cliente Prueba', folio:'PI-001',
      responsable:'Arq. Fernando Jasso', fechaObjetivo:'2026-10-01',
      conceptos: [
        { id:'x1', proveedor:'ZODEK', concepto:'ACRILICO TRANSPARENTE 1.35 X 1.8 Mts.', cantidad:1, costoUnitario:3600, precioVenta:4500 },
        { id:'x2', proveedor:'SARO TECH', concepto:'suministro de lambrin sintetico', cantidad:1, costoUnitario:86341, precioVenta:95000 }
      ]
    })];
  });

  const [docNormal] = await Promise.all([
    context.waitForEvent('page'),
    page.evaluate(() => {
      sessionStorage.setItem('forguard.documento.imagen', JSON.stringify(armarPayloadProyectoImagen(proyectoImagenPorId('pi1'), false)));
      window.open('docs/plantilla_imagen.html', '_blank');
    })
  ]);
  await docNormal.waitForLoadState();
  await docNormal.waitForTimeout(500);
  const encabezadosNormal = await docNormal.locator('table.costos-tabla thead th').allTextContents();
  const primeraFilaNormal = await docNormal.locator('table.costos-tabla tbody tr').first().locator('td').count();
  const totalRowNormal = await docNormal.locator('table.costos-tabla tr.total td').first().getAttribute('colspan');
  chkF('"Generar PDF" (precio de venta): el encabezado ya NO trae "Proveedor"', !encabezadosNormal.some(h => /proveedor/i.test(h)));
  chkF('"Generar PDF": cada renglón de concepto trae 4 celdas (Concepto/Cantidad/Precio/Subtotal), no 5', primeraFilaNormal === 4);
  chkF('"Generar PDF": el renglón de total usa colspan=3 (una columna menos que antes)', totalRowNormal === '3');
  const conceptoEnPdfNormal = await docNormal.locator('table.costos-tabla tbody tr').first().locator('td').first().textContent();
  chkF('"Generar PDF": el concepto importado en mayúsculas también sale en Tipo oración en el PDF real', conceptoEnPdfNormal.trim() === 'Acrilico transparente 1.35 x 1.8 mts.');
  await docNormal.close();

  // --------- 4) El "PDF con costos" SIGUE trayendo Proveedor, sin cambios ---------
  const [docCostos] = await Promise.all([
    context.waitForEvent('page'),
    page.evaluate(() => {
      sessionStorage.setItem('forguard.documento.imagen', JSON.stringify(armarPayloadProyectoImagen(proyectoImagenPorId('pi1'), true)));
      window.open('docs/plantilla_imagen.html', '_blank');
    })
  ]);
  await docCostos.waitForLoadState();
  await docCostos.waitForTimeout(500);
  const encabezadosCostos = await docCostos.locator('table.costos-tabla thead th').allTextContents();
  const primeraFilaCostos = await docCostos.locator('table.costos-tabla tbody tr').first().locator('td').allTextContents();
  const totalRowCostos = await docCostos.locator('table.costos-tabla tr.total td').first().getAttribute('colspan');
  chkF('"PDF con costos": el encabezado SÍ sigue trayendo "Proveedor"', encabezadosCostos.some(h => /proveedor/i.test(h)));
  chkF('"PDF con costos": el renglón SÍ trae el nombre del proveedor', primeraFilaCostos[0].trim() === 'ZODEK');
  chkF('"PDF con costos": el renglón de total sigue con colspan=4, sin cambios', totalRowCostos === '4');
  await docCostos.close();

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
