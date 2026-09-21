/* Regresión: el fix a esImportacionExcel (excluir origenLevantamiento.duplicado)
   no debe romper el camino real de "Nueva póliza importada de Excel". */
const { chromium } = require('playwright');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
const chk = (label, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' - ' + label); return cond; };
let fallas = 0;
const chkF = (label, cond) => { if(!chk(label, cond)) fallas++; };

(async () => {
  const browser = await chromium.launch(OPCIONES_NAVEGADOR);
  const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });
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
    irAModulo('polizas');
    modalPoliza(null, { clienteId:'c1', sitioNombre:'NGK Planta 1', partidas: [
      { concepto:'Equipo importado 1', cantidad:1, precioUnitario:500, frecuencia:1, mesesServicio:[0] },
      { concepto:'Equipo importado 2', cantidad:2, precioUnitario:800, frecuencia:2, mesesServicio:[0,6] }
    ]});
  });
  await page.waitForTimeout(200);

  chkF('Título "Nueva póliza importada de Excel"', (await page.textContent('#modalTitulo')) === 'Nueva póliza importada de Excel');
  chkF('Cliente prellenado (NGK)', await page.locator('#pCliente').inputValue() === 'c1');
  chkF('Sitio prellenado', await page.inputValue('#pSitioNombre') === 'NGK Planta 1');
  const conceptos = await page.$$eval('#listaPartidas input[data-campo="concepto"]', els => els.map(e => e.value));
  chkF('Los 2 equipos importados se cargaron', conceptos.includes('Equipo importado 1') && conceptos.includes('Equipo importado 2'));

  console.log('Errores:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
