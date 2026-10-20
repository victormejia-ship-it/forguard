/* Orden alfabético por proveedor en "Costos / conceptos" de un proyecto de
   Imagen/Aperturas (20-oct-2026, pedido de Victor viendo la tabla real de un
   proyecto en producción): "acomoda los conceptos por orden alfabetico de
   proveedor". Al confirmar el alcance contestó "aplicalo a los anteriores y
   los actuales las modificaciones" — es decir, no solo a los conceptos que
   se capturen de ahora en adelante, sino también a los proyectos que ya
   existían antes de este cambio, sin importar en qué orden se habían
   guardado sus conceptos.

   Por eso el orden se calcula SOLO al pintar (`conceptosOrdenadosPorProveedor`,
   justo después de `esConceptoManoDeObra`) y nunca se guarda reordenado en
   `p.conceptos` — un proyecto viejo, cuyos conceptos se capturaron en el
   orden en que se fueron agregando (o se importaron de un Excel con su
   propio orden), sale ordenado la primera vez que se vuelve a ver o a
   imprimir, sin ninguna migración de datos ni reescritura. Aplica tanto a
   la tabla de la vista (`vistaProyectoImagen`) como al PDF
   (`armarPayloadProyectoImagen`, en los dos modos: precio de venta y
   costos) — los dos leen de la misma función.

   Un proveedor en blanco se manda al FINAL, no al principio (que es donde
   cae una cadena vacía con un simple `localeCompare`) — un concepto sin
   proveedor capturado es la excepción, no debería encabezar la lista. El
   orden es insensible a mayúsculas/acentos (`sensitivity:'base'`), porque
   un desglose real trae proveedores escritos de formas distintas ("LUXDEX",
   "Luxdex") que deben quedar juntos, no separados por un orden de texto
   estrictamente literal.

   La tabla EDITABLE del modal (`pintarConceptosPI`, dentro de
   `modalProyectoImagen`) queda A PROPÓSITO fuera de este cambio: ahí el
   orden sigue siendo el de captura, para no reacomodar filas debajo del
   cursor de alguien que todavía está escribiendo el proveedor de un
   renglón recién agregado (el botón "+ Agregar concepto" enfoca la fila
   nueva por su índice — si esa fila saltara de lugar al re-pintar, el foco
   se perdería o caería en el campo equivocado). */
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
  await page.route('**identitytoolkit.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**securetoken.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**firestore.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.goto(URL_BASE + '/index.html');
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    sesion.correo='owner@a.com'; sesion.uid='u-owner'; sesion.idToken='FAKE'; sesion.refreshToken='F2';
    sesion.expira=Date.now()+3600000; sesion.rol='owner'; sesion.nombre='Victor Owner';
    ocultarAcceso();
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'BANORTE' })];
    datos.proyectosImagen = [normalizarProyectoImagen({
      id:'pi1', clienteId:'c1', clienteNombre:'BANORTE', sitioNombre:'Sucursal Centro', folio:'PI-001',
      conceptos: [
        { proveedor:'SERVICIOS', concepto:'Gastos indirecto', cantidad:1, costoUnitario:3825, precioVenta:4500 },
        { proveedor:'LUXDEX', concepto:'Suministro vinil chef', cantidad:1, costoUnitario:2737, precioVenta:3220 },
        { proveedor:'HOME DEPOT', concepto:'Suministro de materiales varios', cantidad:1, costoUnitario:4675, precioVenta:5500 },
        { proveedor:'', concepto:'Concepto sin proveedor capturado', cantidad:1, costoUnitario:100, precioVenta:150 },
        { proveedor:'Luxdex', concepto:'Instalaciones (viniles y canvas)', cantidad:1, costoUnitario:3715, precioVenta:4370 }
      ]
    })];
  });

  // --------- 1) conceptosOrdenadosPorProveedor(): aritmética/orden puro ---------
  const orden = await page.evaluate(() => conceptosOrdenadosPorProveedor(proyectoImagenPorId('pi1').conceptos).map(c => c.proveedor));
  chkF('Queda alfabético (insensible a mayúsculas) y el proveedor en blanco se manda al final',
    JSON.stringify(orden) === JSON.stringify(['HOME DEPOT', 'LUXDEX', 'Luxdex', 'SERVICIOS', '']));

  // --------- 2) El dato GUARDADO nunca se reordena ---------
  const guardado = await page.evaluate(() => proyectoImagenPorId('pi1').conceptos.map(c => c.proveedor));
  chkF('p.conceptos conserva el orden de captura tal cual se guardó (no se reescribe)',
    JSON.stringify(guardado) === JSON.stringify(['SERVICIOS', 'LUXDEX', 'HOME DEPOT', '', 'Luxdex']));

  // --------- 3) La vista del proyecto pinta la tabla ya ordenada ---------
  await page.evaluate(() => { irAModulo('imagen'); estado.vista='proyecto-imagen'; estado.proyectoImagenId='pi1'; render(); });
  await page.waitForTimeout(200);
  const enPantalla = await page.$$eval('table.tabla tbody tr', trs => trs.map(tr => tr.children[0].textContent.trim()));
  chkF('La tabla "Costos / conceptos" en pantalla sale ordenada por proveedor, en blanco (—) al final',
    JSON.stringify(enPantalla) === JSON.stringify(['HOME DEPOT', 'LUXDEX', 'Luxdex', 'SERVICIOS', '—']));

  // --------- 4) El PDF (precio de venta) también sale ordenado ---------
  const [docNormal] = await Promise.all([
    context.waitForEvent('page'),
    page.evaluate(() => {
      sessionStorage.setItem('forguard.documento.imagen', JSON.stringify(armarPayloadProyectoImagen(proyectoImagenPorId('pi1'), false)));
      window.open('docs/plantilla_imagen.html', '_blank');
    })
  ]);
  await docNormal.waitForLoadState();
  await docNormal.waitForTimeout(500);
  const conceptosPdf = await docNormal.locator('table.costos-tabla tbody tr').allTextContents();
  chkF('En el PDF de precio de venta, "Home Depot" aparece ANTES que "Servicios" (orden alfabético respetado)',
    conceptosPdf.findIndex(t => /materiales varios/i.test(t)) < conceptosPdf.findIndex(t => /gastos indirecto/i.test(t)));
  await docNormal.close();

  // --------- 5) La tabla EDITABLE del modal NO se reordena (orden de captura) ---------
  await page.evaluate(() => { modalProyectoImagen('pi1'); });
  await page.waitForTimeout(200);
  const enModal = await page.$$eval('#listaConceptosPI tbody tr [data-campo="proveedor"]', inputs => inputs.map(i => i.value));
  chkF('La tabla EDITABLE del modal conserva el orden de captura (no se reordena mientras se edita)',
    JSON.stringify(enModal) === JSON.stringify(['SERVICIOS', 'LUXDEX', 'HOME DEPOT', '', 'Luxdex']));

  chkF('No hubo errores de página en todo el escenario', errores.length === 0);
  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
