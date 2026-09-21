/* Pedido de Victor (21-sep-2026) sobre el PDF de Imagen/Aperturas:
   "realiza que solo al momento de generar el PDF se genere en automatico con
   los precios de venta / Si deseamos exportar nuestros costos que sera muy
   rara la vez añade la opcion". El PDF normal ("Generar PDF") debe salir
   siempre con precio de venta; "PDF con costos" es la excepción, solo para
   Admin, y debe marcarse como "USO INTERNO" para no confundirse con el
   documento normal si se comparte por error. */
const { chromium } = require('playwright');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
const chk = (label, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' - ' + label); return cond; };
let fallas = 0;
const chkF = (label, cond) => { if(!chk(label, cond)) fallas++; };

(async () => {
  const browser = await chromium.launch(OPCIONES_NAVEGADOR);
  const page = await browser.newPage({ viewport: { width: 1500, height: 1300 } });
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
    datos.proyectosImagen = [normalizarProyectoImagen({
      id:'pi1', clienteId:'c1', clienteNombre:'ADIANT', sitioNombre:'Valle Oriente',
      nombreProyecto:'Remodelación ADIANT', tipo:'apertura', estatus:'diseno', fecha:hoyISO(),
      conceptos: [
        { concepto:'Panel vinílico', proveedor:'ZODEK', cantidad:2, costoUnitario:1000, precioVenta:1300 },
        { concepto:'Instalación', proveedor:'Servicios', cantidad:1, costoUnitario:500, precioVenta:650 }
      ]
    })];
    irAModulo('imagen');
  });
  await page.waitForTimeout(200);
  await page.click('[data-proyecto-imagen="pi1"]');
  await page.waitForTimeout(200);

  // --------- Botones disponibles en el detalle ---------
  chkF('Existe el botón normal "Generar PDF"', await page.locator('[data-accion="imprimir-proyecto-imagen"]').count() === 1);
  chkF('Existe el botón secundario "PDF con costos" (solo Admin/Owner)', await page.locator('[data-accion="imprimir-proyecto-imagen-costo"]').count() === 1);

  // --------- Payload del PDF normal: usa precio de venta ---------
  const payloadVenta = await page.evaluate(() => armarPayloadProyectoImagen(proyectoImagenPorId('pi1')));
  console.log('Conceptos (venta):', JSON.stringify(payloadVenta.conceptos.map(c => c.precioUnitario)));
  chkF('El PDF normal muestra el PRECIO DE VENTA por renglón (1,300 y 650), no el costo (1,000/500)',
    payloadVenta.conceptos[0].precioUnitario === '$1,300' && payloadVenta.conceptos[1].precioUnitario === '$650');
  chkF('El total del PDF normal es el de venta: (2×1300)+(1×650)=3,250', payloadVenta.totalConceptos === '$3,250');
  chkF('La etiqueta de materiales dice "Materiales" (sin la palabra Costo)', payloadVenta.etiquetas.materiales === 'Materiales');
  chkF('La etiqueta del total dice "Monto total del proyecto"', payloadVenta.etiquetas.total === 'Monto total del proyecto');
  chkF('esCosto es false en el modo normal', payloadVenta.esCosto === false);

  // --------- Payload del PDF "con costos": usa el costo real ---------
  const payloadCosto = await page.evaluate(() => armarPayloadProyectoImagen(proyectoImagenPorId('pi1'), true));
  console.log('Conceptos (costo):', JSON.stringify(payloadCosto.conceptos.map(c => c.precioUnitario)));
  chkF('El PDF "con costos" muestra el COSTO por renglón (1,000 y 500)',
    payloadCosto.conceptos[0].precioUnitario === '$1,000' && payloadCosto.conceptos[1].precioUnitario === '$500');
  chkF('El total del PDF "con costos" es el de costo: (2×1000)+(1×500)=2,500', payloadCosto.totalConceptos === '$2,500');
  chkF('La etiqueta de materiales dice "Costo de materiales"', payloadCosto.etiquetas.materiales === 'Costo de materiales');
  chkF('esCosto es true en el modo de costos', payloadCosto.esCosto === true);

  // --------- El botón "PDF con costos" exige permiso de Admin ---------
  await page.evaluate(() => { sesion.rol = 'analyst'; });
  await page.evaluate(() => { estado.vista = 'proyectos-imagen'; render(); });
  await page.evaluate(() => { entrarProyectoImagen('pi1'); });
  await page.waitForTimeout(150);
  chkF('Con un rol que no es Admin (analyst), el botón "PDF con costos" no aparece', await page.locator('[data-accion="imprimir-proyecto-imagen-costo"]').count() === 0);
  chkF('El botón normal "Generar PDF" sigue disponible para cualquier rol', await page.locator('[data-accion="imprimir-proyecto-imagen"]').count() === 1);

  console.log('Errores:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
