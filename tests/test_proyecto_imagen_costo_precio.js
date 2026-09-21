/* Pedido de Victor (21-sep-2026) sobre Imagen/Aperturas:
   1. Diferenciar en los conceptos una columna de Costo y otra de Precio.
   2. Poder aumentar esas columnas desde la importación con un % desde el
      inicio, y calcular el margen de utilidad del proyecto (como en Pólizas).
   3. Modal un poco más ancho (no de página completa, pero más que el actual).
   Este test cubre el modal de edición (tabla inline costo/precio + resumen),
   la vista de detalle (KPIs + tabla + resumen), el flujo de importación con
   margen, y que un concepto sin precio de venta definido no aparente pérdida. */
const { chromium } = require('playwright');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
const chk = (label, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' - ' + label); return cond; };
let fallas = 0;
const chkF = (label, cond) => { if(!chk(label, cond)) fallas++; };

(async () => {
  const browser = await chromium.launch(OPCIONES_NAVEGADOR);
  const page = await browser.newPage({ viewport: { width: 1500, height: 1400 } });
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
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'ADIANT' })];
    irAModulo('imagen');
  });
  await page.waitForTimeout(200);

  // --------- Modal más ancho ---------
  await page.click('[data-accion="nuevo-proyecto-imagen"]');
  await page.waitForTimeout(150);
  chkF('El modal trae la clase "ancho" (más ancho que el default, no "enorme")', await page.locator('#modal.ancho').count() === 1);
  chkF('El modal NO es el "enorme" de página completa', await page.locator('#modal.enorme').count() === 0);

  // --------- Tabla inline: columnas de Costo y Precio, ambas editables ---------
  await page.fill('#piClienteLibre', 'ADIANT prospecto');
  await page.fill('#piUbicacionLibre', 'Valle Oriente');
  await page.fill('#piNombreProyecto', 'Remodelación ADIANT');
  await page.click('#piBtnAgregarConcepto');
  await page.waitForTimeout(100);
  const encabezados = await page.locator('#listaConceptosPI thead th').allTextContents();
  console.log('Encabezados de la tabla:', JSON.stringify(encabezados));
  chkF('La tabla trae "Costo unitario"', encabezados.includes('Costo unitario'));
  chkF('La tabla trae "Precio unitario" (venta)', encabezados.includes('Precio unitario'));

  await page.fill('[data-campo="concepto"]', 'Barra deslizadora');
  const costoInput = page.locator('[data-campo="costoUnitario"]');
  const precioInput = page.locator('[data-campo="precioVenta"]');
  await costoInput.fill('');
  await costoInput.type('1000');
  await precioInput.fill('');
  await precioInput.type('1300');
  await page.waitForTimeout(150);

  const resumenModal = await page.textContent('#resumenConceptosPI');
  chkF('El resumen del modal muestra Costo total ($1,000)', resumenModal.includes('$1,000'));
  chkF('El resumen del modal muestra Precio de venta total ($1,300)', resumenModal.includes('$1,300'));
  chkF('El resumen del modal muestra la Utilidad ($300, 23.1%)', resumenModal.includes('$300') && resumenModal.includes('23.1%'));

  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);

  // --------- Vista de detalle: KPIs + tabla + resumen con costo/precio/margen ---------
  const textoDetalle = await page.textContent('body');
  chkF('El detalle muestra "Costo total"', /Costo total/.test(textoDetalle));
  chkF('El detalle muestra "Precio de venta total"', /Precio de venta total/.test(textoDetalle));
  chkF('El detalle muestra "Utilidad"', /Utilidad/.test(textoDetalle));

  const filaTabla = await page.locator('table.tabla tbody tr').first().innerText();
  console.log('Fila de la tabla de detalle:', JSON.stringify(filaTabla));
  chkF('La fila trae el costo unitario (1,000) y el precio unitario (1,300)', filaTabla.includes('1,000') && filaTabla.includes('1,300'));

  // --------- Concepto SIN precio de venta definido: no aparenta pérdida ---------
  const margenSinDefinir = await page.evaluate(() => {
    const c = normalizarConceptoProyecto({ concepto:'Equipo sin cotizar', cantidad:1, costoUnitario:500 });
    return { costoUnitario: c.costoUnitario, precioVenta: c.precioVenta };
  });
  chkF('Un concepto sin precio de venta definido arranca con precio = costo (margen 0%, no "pérdida")',
    margenSinDefinir.precioVenta === margenSinDefinir.costoUnitario && margenSinDefinir.precioVenta === 500);

  // --------- Dato legado: un concepto guardado antes de este cambio (solo precioUnitario) sigue leyéndose bien ---------
  const migracionLegado = await page.evaluate(() => {
    const c = normalizarConceptoProyecto({ concepto:'Concepto viejo', cantidad:2, precioUnitario:750 });
    return { costoUnitario: c.costoUnitario, precioVenta: c.precioVenta };
  });
  chkF('Un concepto guardado antes del cambio (campo viejo "precioUnitario") migra su costo correctamente', migracionLegado.costoUnitario === 750);
  chkF('Ese mismo concepto legado también arranca con precio = costo', migracionLegado.precioVenta === 750);

  // --------- Importación con % de margen ---------
  const resultadoImport = await page.evaluate(() => {
    const conceptos = [
      normalizarConceptoProyecto({ concepto:'Panel vinílico', cantidad:1, costoUnitario:1000 }),
      normalizarConceptoProyecto({ concepto:'Instalación', proveedor:'Servicios', cantidad:1, costoUnitario:500 })
    ];
    modalMargenImportacionProyectoImagen(conceptos, { nombreProyecto:'Prueba import', notas:'' }, 'prueba.xlsx');
    return true;
  });
  await page.waitForTimeout(150);
  chkF('Se abre el modal de margen de importación', (await page.textContent('#modalTitulo')).includes('Margen de venta'));

  await page.fill('#piMargenImport', '20');
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);

  chkF('Tras aplicar 20% de margen, se abre el modal del proyecto ya prellenado', (await page.textContent('#modalTitulo')) === 'Nuevo proyecto de imagen');
  const costosImportados = await page.$$eval('#listaConceptosPI input[data-campo="costoUnitario"]', els => els.map(e => e.value));
  const preciosImportados = await page.$$eval('#listaConceptosPI input[data-campo="precioVenta"]', els => els.map(e => e.value));
  console.log('Costos importados:', costosImportados, 'Precios importados:', preciosImportados);
  chkF('El costo de "Panel vinílico" se conserva (1,000)', costosImportados.includes('1,000'));
  chkF('El precio con 20% de margen sobre 1,000 es 1,200', preciosImportados.includes('1,200'));
  chkF('El precio con 20% de margen sobre 500 es 600', preciosImportados.includes('600'));
  await page.click('[data-modal="cancelar"]');
  await page.waitForTimeout(150);

  // --------- Cancelar el modal de margen cancela toda la importación ---------
  await page.evaluate(() => {
    const conceptos = [normalizarConceptoProyecto({ concepto:'X', cantidad:1, costoUnitario:100 })];
    modalMargenImportacionProyectoImagen(conceptos, { nombreProyecto:'No debe abrirse' }, 'otro.xlsx');
  });
  await page.waitForTimeout(150);
  await page.click('[data-modal="cancelar"]');
  await page.waitForTimeout(150);
  chkF('"Cancelar importación" no deja abierto el modal del proyecto', await page.locator('#telon.abierto').count() === 0);

  console.log('Errores:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
