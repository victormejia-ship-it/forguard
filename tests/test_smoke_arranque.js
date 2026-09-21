const { chromium } = require('playwright');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
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
  });
  await page.waitForTimeout(200);
  for(const modulo of ['clientes','forpass','reportes','cocinas','levantamientos','visitas','polizas','cotizaciones','activos','proveedores','imagen']){
    await page.evaluate((m) => irAModulo(m), modulo);
    await page.waitForTimeout(150);
  }
  console.log('Errores acumulados:', JSON.stringify(errores.filter(e => e.startsWith('PAGEERROR'))));
  await browser.close();
  const pageerrors = errores.filter(e => e.startsWith('PAGEERROR'));
  console.log('\nTotal de fallas:', pageerrors.length);
  process.exit(pageerrors.length > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
