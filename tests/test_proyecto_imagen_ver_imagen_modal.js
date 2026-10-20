/* "Ver imagen en grande" en la galería de un proyecto de Imagen/Aperturas
   (20-oct-2026, pedido de Victor viendo la galería de renders de un
   proyecto real): "adicional que si quiero ver la imagen en directo pueda
   desplegar un pequeño modal para poder visaulizar las imagenes adjuntas".

   Hasta ahora `.evidencia-foto img` ya traía `cursor:pointer` en el CSS
   (desde que existe la galería) pero SIN ningún listener real detrás en
   ninguna de las ~10 galerías de evidencia de la app — era un sobrante
   visual sin función. Se agregó la función aquí, pero SOLO en la galería de
   "Imágenes" de un proyecto de Imagen/Aperturas (`vistaProyectoImagen`),
   que es el caso concreto que Victor señaló; las demás galerías no se
   tocaron.

   `modalVerImagenProyecto(proyectoId, imagenId)` reusa el modal genérico de
   la app (`abrirModal`/`cerrarModal`) con un <img> a tamaño completo y un
   solo botón "Cerrar" — mismo patrón que ya usa, por ejemplo, el modal de
   "Reporte de ventas" (de solo lectura, sin "Guardar"). El click vive en el
   delegate global vía `[data-ver-imagen-proyecto]`, leyendo
   `estado.proyectoImagenId` (igual que ya hace
   `migrarImagenesProyectoImagenAStorage` en esta misma vista) en vez de
   repetir el id del proyecto en cada miniatura.

   Un PDF de la galería (planos, por ejemplo) se deja FUERA a propósito: ya
   es un `<a>` que abre el archivo real en una pestaña aparte —convertirlo
   también en un trigger del modal duplicaría la función con un
   comportamiento distinto (un modal no puede mostrar un PDF como imagen). */
const { chromium } = require('playwright');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
const chk = (label, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' - ' + label); return cond; };
let fallas = 0;
const chkF = (label, cond) => { if(!chk(label, cond)) fallas++; };

const DATA_URL_PRUEBA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

(async () => {
  const browser = await chromium.launch(OPCIONES_NAVEGADOR);
  const page = await browser.newPage({ viewport: { width: 1300, height: 1200 } });
  const errores = [];
  page.on('pageerror', e => errores.push('PAGEERROR: ' + e.message));
  await page.route('**identitytoolkit.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**securetoken.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**firestore.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.goto(URL_BASE + '/index.html');
  await page.waitForTimeout(400);

  await page.evaluate((dataUrl) => {
    sesion.correo='owner@a.com'; sesion.uid='u-owner'; sesion.idToken='FAKE'; sesion.refreshToken='F2';
    sesion.expira=Date.now()+3600000; sesion.rol='owner'; sesion.nombre='Victor Owner';
    ocultarAcceso();
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'BANORTE' })];
    datos.proyectosImagen = [normalizarProyectoImagen({
      id:'pi1', clienteId:'c1', clienteNombre:'BANORTE', sitioNombre:'Sucursal Centro', folio:'PI-001',
      nombreProyecto:'Remodelación sucursal',
      imagenes: [
        { id:'im1', dataUrl, formato:'imagen', tipo:'render', nota:'Vista general del comedor' },
        { id:'im2', dataUrl, formato:'imagen', tipo:'foto' },
        { id:'im3', dataUrl, formato:'pdf', nombre:'plano.pdf', tipo:'plano' }
      ]
    })];
    irAModulo('imagen');
    estado.vista='proyecto-imagen'; estado.proyectoImagenId='pi1'; render();
  }, DATA_URL_PRUEBA);
  await page.waitForTimeout(200);

  // --------- 1) Solo las imágenes de verdad son clicables, el PDF no ---------
  chkF('Hay exactamente 2 miniaturas clicables (las 2 imágenes, no el PDF)', (await page.locator('[data-ver-imagen-proyecto]').count()) === 2);
  chkF('El PDF de la galería sigue siendo un enlace normal (abre aparte)', (await page.locator('.evidencia-foto.respaldo-pdf a[href]').count()) === 1);

  // --------- 2) Clic en una miniatura abre el modal con la imagen y el título correcto ---------
  await page.click('[data-ver-imagen-proyecto="im1"]');
  await page.waitForTimeout(200);
  chkF('El modal se abre', await page.locator('#telon').evaluate(el => el.classList.contains('abierto')));
  chkF('El título del modal trae el tipo y la nota de la imagen', (await page.locator('#modalTitulo').textContent()).trim() === 'Render · Vista general del comedor');
  chkF('El modal muestra la imagen completa', (await page.locator('#modalCuerpo img').count()) === 1);
  const srcEnModal = await page.locator('#modalCuerpo img').getAttribute('src');
  chkF('La imagen en el modal es la MISMA imagen de la miniatura (no un placeholder)', srcEnModal === DATA_URL_PRUEBA);
  chkF('El pie solo trae "Cerrar" (es de solo lectura, no un formulario)', (await page.locator('#modalPie button').allTextContents()).map(t=>t.trim()).join(',') === 'Cerrar');

  // --------- 3) "Cerrar" cierra el modal sin dejar nada pendiente ---------
  await page.click('[data-modal="cancelar"]');
  await page.waitForTimeout(150);
  chkF('El modal se cierra con "Cerrar"', !(await page.locator('#telon').evaluate(el => el.classList.contains('abierto'))));

  // --------- 4) La segunda imagen (sin nota) también abre, con título más corto ---------
  await page.click('[data-ver-imagen-proyecto="im2"]');
  await page.waitForTimeout(200);
  chkF('Una imagen sin nota capturada abre con solo el tipo como título', (await page.locator('#modalTitulo').textContent()).trim() === 'Foto');
  await page.click('[data-modal="cancelar"]');
  await page.waitForTimeout(150);

  chkF('No hubo errores de página en todo el escenario', errores.length === 0);
  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
