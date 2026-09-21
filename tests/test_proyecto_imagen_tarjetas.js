/* Pedido de Victor (21-sep-2026, con captura de las tarjetas de Proyectos):
   agregar costo, margen y el logo del cliente a las tarjetas de la lista de
   Imagen/Aperturas — antes solo mostraban "Inversión total" (en realidad el
   costo) y el conteo de imágenes. Costo/margen quedan detrás de
   puedeEditar() (Owner/Admin/Analyst, per decisión de Victor: "cualquiera
   que pueda editar"); el logo del cliente se ve siempre, mismo avatarCliente()
   que ya usan las tarjetas de Clientes/Reportes/Cotizaciones. */
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

  // PNG 1x1 real, para simular un logo de cliente ya cargado.
  const LOGO_1X1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

  await page.evaluate((LOGO_1X1) => {
    sesion.correo='owner@a.com'; sesion.uid='u-owner'; sesion.idToken='FAKE'; sesion.refreshToken='F2';
    sesion.expira=Date.now()+3600000; sesion.rol='owner'; sesion.nombre='Victor Owner';
    ocultarAcceso();
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'BANREGIO', logo: LOGO_1X1 })];
    datos.proyectosImagen = [normalizarProyectoImagen({
      id:'pi1', clienteId:'c1', clienteNombre:'BANREGIO', sitioNombre:'Back Office I',
      nombreProyecto:'Remodelación comedor', tipo:'apertura', estatus:'diseno', fecha:hoyISO(),
      conceptos: [
        { concepto:'Panel vinílico', proveedor:'ZODEK', cantidad:2, costoUnitario:1000, precioVenta:1300 },
        { concepto:'Instalación', proveedor:'Servicios', cantidad:1, costoUnitario:500, precioVenta:650 }
      ]
    })];
    irAModulo('imagen');
  }, LOGO_1X1);
  await page.waitForTimeout(200);

  const tarjeta = page.locator('[data-proyecto-imagen="pi1"]');
  const textoTarjeta = await tarjeta.textContent();

  // --------- Owner: ve costo, precio de venta y margen ---------
  chkF('La tarjeta muestra "Costo total"', textoTarjeta.includes('Costo total'));
  chkF('El costo mostrado es correcto (2×1000 + 1×500 = 2,500)', textoTarjeta.includes('$2,500'));
  chkF('La tarjeta muestra "Precio de venta"', textoTarjeta.includes('Precio de venta'));
  chkF('El precio de venta mostrado es correcto (2×1300 + 1×650 = 3,250)', textoTarjeta.includes('$3,250'));
  chkF('La tarjeta muestra "Margen"', textoTarjeta.includes('Margen'));
  chkF('El logo del cliente SÍ aparece en la tarjeta (en vez de las iniciales)', await tarjeta.locator('.t-avatar.con-logo img').count() === 1);

  // --------- Analyst: también ve costo y margen (pedido explícito de Victor) ---------
  await page.evaluate(() => { sesion.rol = 'analyst'; render(); });
  await page.waitForTimeout(150);
  const textoAnalyst = await tarjeta.textContent();
  chkF('Un Analyst TAMBIÉN ve "Costo total" y "Margen"', textoAnalyst.includes('Costo total') && textoAnalyst.includes('Margen'));

  // --------- Viewer/técnico: NO ve costo ni margen, pero sigue viendo el logo ---------
  await page.evaluate(() => { sesion.rol = 'viewer'; render(); });
  await page.waitForTimeout(150);
  const textoViewer = await tarjeta.textContent();
  chkF('Un Viewer NO ve "Costo total"', !textoViewer.includes('Costo total'));
  chkF('Un Viewer NO ve "Precio de venta" ni "Margen"', !textoViewer.includes('Precio de venta') && !textoViewer.includes('Margen'));
  chkF('Un Viewer SÍ sigue viendo el logo del cliente (no es dato sensible)', await tarjeta.locator('.t-avatar.con-logo img').count() === 1);
  chkF('Un Viewer SÍ sigue viendo "Imágenes" (dato no sensible)', textoViewer.includes('Imágenes'));

  // --------- Un prospecto sin cliente real cae en el avatar de iniciales de siempre ---------
  await page.evaluate(() => {
    sesion.rol = 'owner'; render();
    datos.proyectosImagen.push(normalizarProyectoImagen({
      id:'pi2', clienteId:'', clienteNombre:'Prospecto libre', sitioNombre:'Sucursal X',
      nombreProyecto:'Proyecto sin cliente dado de alta', tipo:'apertura', estatus:'diseno', fecha:hoyISO()
    }));
    render();
  });
  await page.waitForTimeout(150);
  const tarjetaProspecto = page.locator('[data-proyecto-imagen="pi2"]');
  chkF('Un proyecto sin cliente real (prospecto) sigue usando el avatar de iniciales, sin tronar',
    await tarjetaProspecto.locator('.t-avatar').count() === 1 && await tarjetaProspecto.locator('.t-avatar.con-logo').count() === 0);

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
