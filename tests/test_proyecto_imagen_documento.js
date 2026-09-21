/* Verifica que el DOCUMENTO real (plantilla_imagen.html) renderiza bien las
   etiquetas dinámicas en los dos modos, y que el modo "costo" trae el
   distintivo de USO INTERNO para no confundirse con el normal. */
const { chromium } = require('playwright');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
const chk = (label, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' - ' + label); return cond; };
let fallas = 0;
const chkF = (label, cond) => { if(!chk(label, cond)) fallas++; };

(async () => {
  const browser = await chromium.launch(OPCIONES_NAVEGADOR);
  const errores = [];

  async function abrirDocumento(usarCosto){
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('pageerror', e => errores.push('PAGEERROR: ' + e.message));
    page.on('console', msg => { if (msg.type() === 'error' && !/404/.test(msg.text())) errores.push('CONSOLE: ' + msg.text()); });
    await page.route('**identitytoolkit.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.route('**securetoken.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.route('**firestore.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.goto(URL_BASE + '/index.html');
    await page.waitForTimeout(400);
    await page.evaluate((usarCosto) => {
      sesion.correo='owner@a.com'; sesion.uid='u-owner'; sesion.idToken='FAKE'; sesion.refreshToken='F2';
      sesion.expira=Date.now()+3600000; sesion.rol='owner'; sesion.nombre='Victor Owner';
      ocultarAcceso();
      datos.clientes = [normalizarCliente({ id:'c1', nombre:'ADIANT' })];
      datos.proyectosImagen = [normalizarProyectoImagen({
        id:'pi1', clienteId:'c1', clienteNombre:'ADIANT', sitioNombre:'Valle Oriente',
        nombreProyecto:'Remodelación ADIANT', tipo:'apertura', estatus:'diseno', fecha:hoyISO(),
        conceptos: [{ concepto:'Panel vinílico', proveedor:'ZODEK', cantidad:2, costoUnitario:1000, precioVenta:1300 }]
      })];
      sessionStorage.setItem('forguard.documento.imagen', JSON.stringify(armarPayloadProyectoImagen(proyectoImagenPorId('pi1'), usarCosto)));
    }, usarCosto);
    const [docPage] = await Promise.all([
      context.waitForEvent('page'),
      page.evaluate(() => window.open('docs/plantilla_imagen.html', '_blank'))
    ]);
    await docPage.waitForLoadState();
    await docPage.waitForTimeout(300);
    /* .costos-tabla y .eyebrow no contienen ningún <script> hijo, así que
       textContent es seguro aquí — a diferencia de 'body' completo, cuyo
       textContent (a propósito, DOM estándar) también arrastra el código
       fuente del <script> que cuelga directo de <body>. */
    const eyebrow = await docPage.locator('.eyebrow').first().textContent();
    const tablaCostos = await docPage.locator('.costos-tabla').first().textContent();
    await context.close();
    return { eyebrow, tablaCostos };
  }

  const normal = await abrirDocumento(false);
  chkF('El documento normal NO trae el distintivo de uso interno', !normal.eyebrow.includes('USO INTERNO'));
  chkF('El documento normal muestra "Precio unitario" como encabezado', normal.tablaCostos.includes('Precio unitario'));
  chkF('El documento normal muestra "Materiales" (sin "Costo de")', /(?<!Costo de )Materiales/.test(normal.tablaCostos));
  chkF('El documento normal muestra el precio de venta ($1,300)', normal.tablaCostos.includes('$1,300'));

  const costo = await abrirDocumento(true);
  chkF('El documento "con costos" SÍ trae el distintivo de uso interno', costo.eyebrow.includes('USO INTERNO'));
  chkF('El documento "con costos" muestra "Costo unitario" como encabezado', costo.tablaCostos.includes('Costo unitario'));
  chkF('El documento "con costos" muestra "Costo de materiales"', costo.tablaCostos.includes('Costo de materiales'));
  chkF('El documento "con costos" muestra el costo real ($1,000), no el de venta', costo.tablaCostos.includes('$1,000') && !costo.tablaCostos.includes('$1,300'));

  console.log('Errores:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
