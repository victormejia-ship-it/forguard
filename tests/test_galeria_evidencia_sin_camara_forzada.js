/* Botón "Tomar o elegir foto" sin opción real de "elegir" (16-oct-2026,
   reporte de Victor con una captura real de "Registrar servicio" en
   Pólizas): "En la sección de las pólizas da e la opción de subir la foto
   no precisamente tomándola sino acceder a la galería de mi fotografías".

   Causa: el `<input type="file">` detrás de ese botón traía
   `capture="environment"`. El atributo `capture` le dice al navegador que
   prefiera la cámara de una vez — en varios navegadores móviles (sobre
   todo Android/Chrome) eso significa que la cámara se abre DIRECTO, sin
   mostrar el selector nativo que deja elegir entre "Cámara" o "Galería".
   El botón ya decía "Tomar O ELEGIR foto" desde antes, pero `capture`
   rompía esa segunda mitad de la promesa.

   No era solo el input de Pólizas (`svArchivoEvidencia`, el de la
   captura): el mismo patrón —mismo botón, mismo texto, mismo problema—
   estaba repetido en otros 9 lugares de la app (Trabajo correctivo de
   cotización, Reportes, Activos ×2, Proyectos de Imagen, Resolver
   reporte ×2 —hoja de servicio y evidencia—, Levantamientos/hallazgo, y
   el propio Registrar servicio de Pólizas). Se quitó `capture` de los 10,
   no solo del que se vio en la captura — dejar los otros 9 con el mismo
   bug habría sido arreglar el síntoma una vez y dejarlo pendiente en todos
   lados más donde aparece el mismo botón.

   `accept="image/*"` se queda igual (solo imágenes) — el único cambio es
   que ya no se fuerza la cámara, así que el navegador ofrece su selector
   normal (Cámara / Galería / Archivos, según el dispositivo).

   Esta prueba cubre: 1) una revisión del código fuente completo de
   index.html para confirmar que `capture="environment"` no aparece en
   NINGÚN lado (así, si alguien agrega un input de evidencia nuevo
   copiando el patrón viejo con capture, esto lo detecta); y 2) una
   verificación en vivo, abriendo el modal real de la captura (Registrar
   servicio de Pólizas) y otro distinto (Nuevo reporte), de que su input
   de evidencia no trae el atributo `capture` pero sigue aceptando solo
   imágenes. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
const chk = (label, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' - ' + label); return cond; };
let fallas = 0;
const chkF = (label, cond) => { if(!chk(label, cond)) fallas++; };

// --------- 1) El código fuente ya no trae capture="environment" en ningún lado ---------
const fuente = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
chkF('index.html ya no contiene capture="environment" en ningún input de evidencia',
  !fuente.includes('capture="environment"') && !/capture=/.test(fuente));

(async () => {
  const browser = await chromium.launch(OPCIONES_NAVEGADOR);
  const page = await browser.newPage({ viewport: { width: 1200, height: 1400 } });
  const errores = [];
  page.on('pageerror', e => errores.push('PAGEERROR: ' + e.message));
  await page.route('**identitytoolkit.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**securetoken.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**firestore.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.goto(URL_BASE + '/index.html');
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    sesion.correo='owner@a.com'; sesion.uid='u-owner'; sesion.idToken='FAKE'; sesion.refreshToken='F2';
    sesion.expira=Date.now()+3600000; sesion.rol='owner'; sesion.nombre='Victor Owner';
    ocultarAcceso();
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'GRUPO SALINAS' })];
    datos.polizas = [normalizarPoliza({
      id:'p1', clienteId:'c1', folio:'POL-050', sitioNombre:'Torre Esmeralda',
      estatus:'activa', facturacion:'anual', fechaInicio:'2024-01-01', fechaCotizacion:'2024-01-01',
      partidas: [{ id:'x1', concepto:'Marmita', marca:'Madipsa', cantidad:2, precioUnitario:1000, frecuencia:1, mesesServicio:[0] }],
      cobros:[true]
    })];
  });

  // --------- 2) Registrar servicio de Pólizas — el modal exacto de la captura ---------
  await page.evaluate(() => modalServicioPoliza('p1', 'x1', 0, false));
  await page.waitForTimeout(200);
  const inputPoliza = await page.evaluate(() => {
    const inp = document.getElementById('svArchivoEvidencia');
    return { existe: !!inp, capture: inp && inp.getAttribute('capture'), accept: inp && inp.getAttribute('accept') };
  });
  chkF('El input de evidencia de "Registrar servicio" existe', inputPoliza.existe);
  chkF('Ya NO trae el atributo capture (el navegador ofrece su selector normal: cámara o galería)', inputPoliza.capture === null);
  chkF('Sigue aceptando solo imágenes', inputPoliza.accept === 'image/*');
  await page.evaluate(() => cerrarModal());
  await page.waitForTimeout(150);

  // --------- 3) Nuevo reporte — mismo patrón, modal distinto, para confirmar que no fue solo Pólizas ---------
  await page.evaluate(() => modalReporte(null));
  await page.waitForTimeout(200);
  const inputReporte = await page.evaluate(() => {
    const inp = document.getElementById('archivoEvidenciaR');
    return { existe: !!inp, capture: inp && inp.getAttribute('capture') };
  });
  chkF('El input de evidencia de "Nuevo reporte" también existe', inputReporte.existe);
  chkF('Tampoco trae capture — el arreglo no fue exclusivo de Pólizas', inputReporte.capture === null);

  chkF('No hubo errores de página en todo el escenario', errores.length === 0);
  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
