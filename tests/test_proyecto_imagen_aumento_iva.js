/* Pedido de Victor (21-sep-2026): en Proyectos de Imagen/Aperturas,
   1) poder subir/bajar de un jalón el costo o el precio de venta de TODOS
      los conceptos de un proyecto ya creado, por porcentaje — no solo al
      importar (ver modalMargenImportacionProyectoImagen), sino en
      cualquier momento (modalAjusteConceptosProyectoImagen); y
   2) que el documento/PDF muestre el IVA, pero SOLO hasta el total final
      (cada concepto se sigue viendo sin IVA por renglón), mismo molde que
      ya usan Cotizaciones/Órdenes de Compra: Subtotal / IVA 16% / Total. */
const { chromium } = require('playwright');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
const chk = (label, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' - ' + label); return cond; };
let fallas = 0;
const chkF = (label, cond) => { if(!chk(label, cond)) fallas++; };

(async () => {
  const browser = await chromium.launch(OPCIONES_NAVEGADOR);
  const page = await browser.newPage({ viewport: { width: 1400, height: 1300 } });
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
      conceptos: [
        { concepto:'Panel vinílico', proveedor:'ZODEK', cantidad:2, costoUnitario:1000, precioVenta:1300 },
        { concepto:'Instalación', proveedor:'Servicios', cantidad:1, costoUnitario:500, precioVenta:650 }
      ]
    })];
  });

  // --------- 1) El botón solo aparece para Admin/Owner ---------
  await page.evaluate(() => { irAModulo('imagen'); });
  await page.waitForTimeout(150);
  await page.locator('[data-proyecto-imagen="pi1"]').first().click();
  await page.waitForTimeout(150);
  chkF('El botón "Aumento / descuento" SÍ aparece para Owner', await page.locator('[data-accion="ajuste-proyecto-imagen"]').count() === 1);

  await page.evaluate(() => { sesion.rol = 'analyst'; render(); entrarProyectoImagen('pi1'); });
  await page.waitForTimeout(150);
  chkF('El botón "Aumento / descuento" NO aparece para un rol que no es Admin', await page.locator('[data-accion="ajuste-proyecto-imagen"]').count() === 0);
  await page.evaluate(() => { sesion.rol = 'owner'; render(); entrarProyectoImagen('pi1'); });
  await page.waitForTimeout(150);

  // --------- 2) Aumento 10% al COSTO: no toca el precio de venta ---------
  await page.click('[data-accion="ajuste-proyecto-imagen"]');
  await page.waitForTimeout(150);
  await page.selectOption('#piAjusteCampo', 'costoUnitario');
  await page.selectOption('#piAjusteTipo', 'aumento');
  await page.fill('#piAjustePct', '10');
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(150);
  const tras10 = await page.evaluate(() => proyectoImagenPorId('pi1').conceptos.map(c => ({ costo:c.costoUnitario, venta:c.precioVenta })));
  chkF('El costo del renglón 1 subió 10% (1000 -> 1100)', tras10[0].costo === 1100);
  chkF('El costo del renglón 2 subió 10% (500 -> 550)', tras10[1].costo === 550);
  chkF('El precio de venta NO se tocó (sigue en 1300 y 650)', tras10[0].venta === 1300 && tras10[1].venta === 650);

  // --------- 3) Descuento 20% al PRECIO DE VENTA: no toca el costo ---------
  await page.evaluate(() => { entrarProyectoImagen('pi1'); });
  await page.waitForTimeout(150);
  await page.click('[data-accion="ajuste-proyecto-imagen"]');
  await page.waitForTimeout(150);
  await page.selectOption('#piAjusteCampo', 'precioVenta');
  await page.selectOption('#piAjusteTipo', 'descuento');
  await page.fill('#piAjustePct', '20');
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(150);
  const tras20 = await page.evaluate(() => proyectoImagenPorId('pi1').conceptos.map(c => ({ costo:c.costoUnitario, venta:c.precioVenta })));
  chkF('El precio de venta del renglón 1 bajó 20% (1300 -> 1040)', tras20[0].venta === 1040);
  chkF('El costo NO se tocó esta vez (sigue en 1100 y 550, del paso anterior)', tras20[0].costo === 1100 && tras20[1].costo === 550);

  // --------- 4) Un descuento grande nunca deja el campo en negativo ---------
  await page.evaluate(() => { entrarProyectoImagen('pi1'); });
  await page.waitForTimeout(150);
  await page.click('[data-accion="ajuste-proyecto-imagen"]');
  await page.waitForTimeout(150);
  await page.selectOption('#piAjusteCampo', 'costoUnitario');
  await page.selectOption('#piAjusteTipo', 'descuento');
  await page.fill('#piAjustePct', '150');
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(150);
  const trasExceso = await page.evaluate(() => proyectoImagenPorId('pi1').conceptos.map(c => c.costoUnitario));
  chkF('Un descuento de 150% deja el costo en $0, nunca negativo', trasExceso.every(c => c === 0));

  // --------- 5) El documento SÍ trae IVA, solo en el total final ---------
  const payload = await page.evaluate(() => {
    const p = proyectoImagenPorId('pi1');
    p.conceptos = [{ id:'x1', concepto:'Panel', proveedor:'ZODEK', cantidad:1, costoUnitario:1000, precioVenta:1000 }];
    return armarPayloadProyectoImagen(p, false);
  });
  chkF('El renglón del concepto NO trae IVA (sigue siendo el precio tal cual)', payload.conceptos[0].precioUnitario === '$1,000');
  chkF('El payload trae el subtotal sin IVA', payload.totalConceptos === '$1,000');
  chkF('El payload trae el IVA calculado al 16%', payload.iva === '$160');
  chkF('El payload trae el total CON IVA (1,000 + 160 = 1,160)', payload.totalConIva === '$1,160');
  chkF('El payload trae la etiqueta del porcentaje de IVA', payload.ivaPct === '16%');

  const payloadCosto = await page.evaluate(() => armarPayloadProyectoImagen(proyectoImagenPorId('pi1'), true));
  chkF('El modo "con costos" también calcula el IVA, sobre el costo', payloadCosto.iva === '$160' && payloadCosto.totalConIva === '$1,160');

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
