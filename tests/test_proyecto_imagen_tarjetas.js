/* Pedido de Victor (21-sep-2026, con captura de las tarjetas de Proyectos):
   agregar costo, margen y el logo del cliente a las tarjetas de la lista de
   Imagen/Aperturas — antes solo mostraban "Inversión total" (en realidad el
   costo) y el conteo de imágenes. Costo/margen quedan detrás de
   puedeEditar() (Owner/Admin/Analyst, per decisión de Victor: "cualquiera
   que pueda editar"); el logo del cliente se ve siempre, mismo avatarCliente()
   que ya usan las tarjetas de Clientes/Reportes/Cotizaciones.

   Actualización 20-oct-2026 (pedido de Victor con otra captura de las
   mismas tarjetas, ya en producción): "coloca los datos de las fechas de
   inicio, de termino y de apertura" — las tarjetas traían el cronograma
   completo escondido dentro del detalle del proyecto (fechaEntrada/
   fechaSalida/fechaObjetivo, ver vistaProyectoImagen) pero ninguna fecha se
   veía desde la lista. Se agregaron 3 datos más ("Inicio de obra",
   "Término de obra", "Fecha de apertura") con `fmtFecha()` — mismo
   formateador compacto que ya usa el Gantt/Cronograma de este módulo —, SIN
   nada detrás de permisos: a diferencia de costo/margen, una fecha no es
   información sensible, así que la ve cualquiera que vea la tarjeta,
   incluido un Viewer. Sin capturar, cae en el "—" de siempre de
   `fmtFecha('')`, nunca un hueco en blanco. */
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
      fechaEntrada:'2026-10-07', fechaSalida:'2026-11-20', fechaObjetivo:'2026-11-25',
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

  // --------- Las 3 fechas (inicio, término, apertura) se ven en la tarjeta ---------
  chkF('La tarjeta muestra "Inicio de obra" con la fecha correcta', textoTarjeta.includes('Inicio de obra') && textoTarjeta.includes('07 oct 2026'));
  chkF('La tarjeta muestra "Término de obra" con la fecha correcta', textoTarjeta.includes('Término de obra') && textoTarjeta.includes('20 nov 2026'));
  chkF('La tarjeta muestra "Fecha de apertura" con la fecha correcta', textoTarjeta.includes('Fecha de apertura') && textoTarjeta.includes('25 nov 2026'));

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
  chkF('Un Viewer SÍ sigue viendo las 3 fechas (tampoco son dato sensible)',
    textoViewer.includes('Inicio de obra') && textoViewer.includes('Término de obra') && textoViewer.includes('Fecha de apertura'));

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
  const textoProspecto = await tarjetaProspecto.textContent();
  chkF('Un proyecto sin ninguna fecha capturada muestra "—" en las 3, nunca un hueco en blanco',
    /Inicio de obra\s*—/.test(textoProspecto) && /Término de obra\s*—/.test(textoProspecto) && /Fecha de apertura\s*—/.test(textoProspecto));

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
