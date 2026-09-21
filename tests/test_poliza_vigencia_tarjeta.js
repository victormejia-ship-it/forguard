/* Pedido de Victor (21-sep-2026): "podrias colocar tambien en los recuadros
   la vigencia de la poliza" — las tarjetas de Pólizas no mostraban en
   ningún lado el rango de vigencia (inicio–fin), solo la tabla lo traía
   (y nada más la fecha de inicio). */
const { chromium } = require('playwright');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
const chk = (label, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' - ' + label); return cond; };
let fallas = 0;
const chkF = (label, cond) => { if(!chk(label, cond)) fallas++; };

(async () => {
  const browser = await chromium.launch(OPCIONES_NAVEGADOR);
  const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });
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
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'DAIMLER' })];
    datos.polizas = [normalizarPoliza({
      id:'p1', clienteId:'c1', folio:'POL-037', sitioNombre:'Daimler Derramadero',
      estatus:'activa', facturacion:'anual', fechaInicio:'2025-09-01', fechaCotizacion:'2025-09-01',
      partidas: [{ id:'x1', concepto:'Equipo', cantidad:1, precioUnitario:1000, frecuencia:1, mesesServicio:[0] }],
      cobros:[true]
    })];
    estado.vistaPolizas = 'tarjetas';
    irAModulo('polizas');
  });
  await page.waitForTimeout(250);

  const textoTarjeta = await page.locator('[data-poliza="p1"]').innerText();
  console.log('Texto de la tarjeta:', JSON.stringify(textoTarjeta));
  chkF('La tarjeta muestra la etiqueta "Vigencia"', /vigencia/i.test(textoTarjeta));
  chkF('Muestra la fecha de inicio (1 sep 2025)', textoTarjeta.includes('1 sep 2025') || /1[\s-]sep[\s-]2025/i.test(textoTarjeta));
  chkF('Muestra la fecha de fin, 12 meses después (2026)', /2026/.test(textoTarjeta));

  console.log('Errores:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
