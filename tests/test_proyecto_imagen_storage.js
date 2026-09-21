/* Reporte de Victor (21-sep-2026, con captura de pantalla): "Este proyecto
   ya no tiene espacio para otra imagen/PDF (el documento no puede pasar de
   800 KB entre todas)". Causa raíz: hasta ahora, TODAS las imágenes/PDFs de
   un proyecto de Imagen/Aperturas se guardaban embebidos en base64 dentro
   del propio documento de Firestore, con un presupuesto compartido de
   800 KB entre los 12 archivos posibles — el mismo síntoma exacto que ya
   tronó a POL-024 en Pólizas ("Tope de 1 MB por registro", veredicto de
   auditoría). Ahora cada imagen/PDF se sube a Storage al guardar de
   verdad (mismo camino que reportes/pólizas), y el documento solo guarda
   la URL de descarga — sin presupuesto compartido.

   Este test cubre:
   1) Guardar un proyecto NUEVO con una imagen todavía en base64: al
      guardar, sube a Storage y el documento se queda con la URL, NO con
      el dataUrl original.
   2) Un proyecto YA GUARDADO con imágenes viejas embebidas (de antes de
      este cambio) se detecta como "sin migrar" y migrarImagenesProyectoImagenAStorage()
      las sube y las reemplaza.
   3) subirEvidenciaStorage() ya sabe nombrar un PDF con la extensión
      correcta (antes cualquier cosa que no fuera png/webp caía a .jpg,
      lo cual era incorrecto para un plano en PDF de verdad). */
const { chromium } = require('playwright');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
const chk = (label, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' - ' + label); return cond; };
let fallas = 0;
const chkF = (label, cond) => { if(!chk(label, cond)) fallas++; };

/* Un PNG 1x1 real, mínimo, para tener un data: URL válido con el que
   trabajar sin depender de ningún archivo externo. */
const PNG_1X1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

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

  const r1 = await page.evaluate(async (PNG_1X1) => {
    sesion.correo='owner@a.com'; sesion.uid='u-owner'; sesion.idToken='FAKE'; sesion.refreshToken='F2';
    sesion.expira=Date.now()+3600000; sesion.rol='owner'; sesion.nombre='Victor Owner';
    ocultarAcceso();

    /* Firestore de Storage de mentiras: en vez de mockear la red real
       (net::ERR_FAILED en este sandbox, ver tests/README.md), se
       reemplaza la función directo — devuelve una URL predecible que se
       puede verificar, y registra con qué carpeta/id se llamó cada vez. */
    window._llamadasSubida = [];
    window._subirEvidenciaStorageOriginal = window.subirEvidenciaStorage;
    window.subirEvidenciaStorage = async (dataUrl, carpeta, idArchivo) => {
      window._llamadasSubida.push({ carpeta, idArchivo });
      const m = /^data:([^;]+);/.exec(dataUrl);
      const ext = m[1] === 'application/pdf' ? 'pdf' : 'png';
      return 'https://firebasestorage.fake/o/' + encodeURIComponent(carpeta + '/' + idArchivo + '.' + ext) + '?alt=media&token=FAKE';
    };

    datos.clientes = [normalizarCliente({ id:'c1', nombre:'BANREGIO' })];

    // --------- 1) Proyecto NUEVO con una imagen en base64 ---------
    irAModulo('imagen');
    modalProyectoImagen(null);
    document.getElementById('piCliente').value = 'c1';
    document.getElementById('piCliente').dispatchEvent(new Event('change', { bubbles:true }));
    document.getElementById('piClienteLibre').value = 'BANREGIO';
    document.getElementById('piUbicacionLibre').value = 'Back Office I';
    document.getElementById('piNombreProyecto').value = 'Remodelación comedor';

    // Se inyecta directo en imagenesTmp vía el mismo camino que usa el <input type=file>:
    // más simple y confiable en la prueba, llamar la función interna de la app no es
    // posible desde afuera (closure), así que se dispara el flujo real con un File falso.
    const dt = new DataTransfer();
    const bin = atob(PNG_1X1.split(',')[1]);
    const bytes = new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
    dt.items.add(new File([bytes], 'render.png', { type:'image/png' }));
    const input = document.getElementById('piArchivoImagen');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles:true }));
    return true;
  }, PNG_1X1);
  await page.waitForTimeout(400); // leerEvidencia/comprimirEvidencia son async

  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(300);

  const r2 = await page.evaluate(() => {
    const p = datos.proyectosImagen.find(x => x.nombreProyecto === 'Remodelación comedor');
    return {
      existe: !!p,
      imagenes: p ? p.imagenes.length : 0,
      urlEsStorage: p && p.imagenes[0] ? p.imagenes[0].dataUrl.startsWith('https://firebasestorage.fake/') : false,
      urlNoEsBase64: p && p.imagenes[0] ? !p.imagenes[0].dataUrl.startsWith('data:') : false,
      llamadas: window._llamadasSubida
    };
  });
  chkF('El proyecto se creó', r2.existe);
  chkF('El proyecto se quedó con 1 imagen', r2.imagenes === 1);
  chkF('La imagen guardada YA ES la URL de Storage, no el data: URL original', r2.urlEsStorage && r2.urlNoEsBase64);
  chkF('subirEvidenciaStorage() se llamó con la carpeta evidencias/proyectosImagen/<id>', r2.llamadas.length === 1 && /^evidencias\/proyectosImagen\//.test(r2.llamadas[0].carpeta));

  // --------- 2) Proyecto YA GUARDADO con imágenes viejas embebidas ---------
  const r3 = await page.evaluate(async (PNG_1X1) => {
    datos.proyectosImagen.push(normalizarProyectoImagen({
      id: 'pi-viejo', clienteId:'c1', clienteNombre:'BANREGIO', sitioNombre:'Sucursal Centro',
      nombreProyecto: 'Proyecto de antes del cambio', tipo:'apertura', estatus:'diseno', fecha: hoyISO(),
      imagenes: [{ id:'img-vieja', dataUrl: PNG_1X1, tipo:'render' }]
    }));
    const antes = proyectoImagenTieneImagenesSinMigrar(proyectoImagenPorId('pi-viejo'));
    window._llamadasSubida = [];
    await migrarImagenesProyectoImagenAStorage('pi-viejo', true);
    const p = proyectoImagenPorId('pi-viejo');
    return {
      detectadoAntes: antes,
      detectadoDespues: proyectoImagenTieneImagenesSinMigrar(p),
      urlEsStorage: p.imagenes[0].dataUrl.startsWith('https://firebasestorage.fake/'),
      llamadas: window._llamadasSubida.length
    };
  }, PNG_1X1);
  chkF('proyectoImagenTieneImagenesSinMigrar() SÍ detecta el proyecto viejo antes de migrar', r3.detectadoAntes === true);
  chkF('migrarImagenesProyectoImagenAStorage() SÍ subió la imagen (1 llamada)', r3.llamadas === 1);
  chkF('Tras migrar, la imagen queda con URL de Storage', r3.urlEsStorage === true);
  chkF('Tras migrar, ya no se detecta como pendiente', r3.detectadoDespues === false);

  // --------- 3) El código REAL de subirEvidenciaStorage() ya sabe nombrar un PDF ---------
  /* No se puede ejercitar subirEvidenciaStorage() de punta a punta aquí
     (fetchConTimeout() llama directo a firebasestorage.googleapis.com, un
     dominio real que este sandbox no alcanza — ver tests/README.md), pero
     SÍ se puede confirmar que el código que de verdad se sirvió trae el
     arreglo, leyendo su propio código fuente en vivo — no una copia
     reescrita en la prueba, que podría quedar desincronizada. */
  const r4 = await page.evaluate(() => window._subirEvidenciaStorageOriginal.toString());
  chkF('El código real de subirEvidenciaStorage() mapea application/pdf a la extensión .pdf', /application\/pdf['"]\s*\?\s*['"]pdf['"]/.test(r4));

  chkF('El código real YA NO cae a .jpg para cualquier cosa que no sea png/webp (el PDF tiene su propio caso)', /pdf['"]\s*:\s*['"]jpg['"]/.test(r4));

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
