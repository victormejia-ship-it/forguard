/* Regresión: confirma que editar un proyecto ya existente y el listado
   (tarjetas/tabla) siguen funcionando tras el cambio de modelo costo/precio. */
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
    datos.proyectosImagen = [normalizarProyectoImagen({
      id:'pi1', clienteId:'c1', clienteNombre:'ADIANT', sitioNombre:'Valle Oriente',
      nombreProyecto:'Remodelación existente', tipo:'apertura', estatus:'diseno', fecha:hoyISO(),
      conceptos: [
        { concepto:'Panel', proveedor:'ZODEK', cantidad:1, costoUnitario:20000, precioVenta:25000 },
        { concepto:'Instalación', proveedor:'Servicios', cantidad:1, costoUnitario:5000, precioVenta:6000 }
      ]
    })];
    irAModulo('imagen');
  });
  await page.waitForTimeout(200);

  // --------- Listado: tarjetas y tabla siguen funcionando ---------
  chkF('La tarjeta del proyecto existente aparece en el listado', await page.locator('[data-proyecto-imagen="pi1"]').count() === 1);

  // --------- Entrar al detalle ---------
  await page.click('[data-proyecto-imagen="pi1"]');
  await page.waitForTimeout(200);
  chkF('Entra al detalle del proyecto', (await page.textContent('h2')) === 'Remodelación existente');
  const c = await page.evaluate(() => desgloseConceptosProyecto(proyectoImagenPorId('pi1')));
  chkF('Costo total correcto (20000+5000=25000)', c.total === 25000);
  chkF('Precio de venta total correcto (25000+6000=31000)', c.totalVenta === 31000);
  chkF('Utilidad correcta (31000-25000=6000)', c.utilidad === 6000);

  // --------- Editar el proyecto existente: los valores de costo/precio se conservan ---------
  await page.click('[data-accion="editar-proyecto-imagen"]');
  await page.waitForTimeout(200);
  const costos = await page.$$eval('#listaConceptosPI input[data-campo="costoUnitario"]', els => els.map(e => e.value));
  const precios = await page.$$eval('#listaConceptosPI input[data-campo="precioVenta"]', els => els.map(e => e.value));
  chkF('Al editar, los costos existentes se prellenan (20,000 y 5,000)', costos.includes('20,000') && costos.includes('5,000'));
  chkF('Al editar, los precios de venta existentes se prellenan (25,000 y 6,000)', precios.includes('25,000') && precios.includes('6,000'));
  await page.click('[data-modal="cancelar"]');
  await page.waitForTimeout(150);

  console.log('Errores:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
