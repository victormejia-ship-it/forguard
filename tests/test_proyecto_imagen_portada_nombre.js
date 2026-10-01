/* La portada del PDF de un Proyecto de Imagen ya no trae la leyenda fija
   "Imagen / Apertura" como título — trae el NOMBRE del proyecto, en Tipo
   oración (01-oct-2026, pedido de Victor con captura real: "retira la
   leyenda 'imagen / apertura' y coloca el nombre del proyecto en
   escritura 'Tipo oración'").

   El Tipo oración ya se resolvía para los conceptos (ver
   test_proyecto_imagen_pdf_sin_proveedor_y_tipo_oracion.js); este pedido
   es sobre el NOMBRE DEL PROYECTO, un campo aparte, que también se
   captura libre y a veces llega en mayúsculas — armarPayloadProyectoImagen()
   ahora le aplica aOracionTolerante() antes de mandarlo a la plantilla.

   El título en sí dejó de ser un texto fijo de 2 líneas medido una sola
   vez (como "Mantenimiento Preventivo" en Pólizas) — el nombre de un
   proyecto no tiene largo conocido de antemano, así que la plantilla mide
   de verdad (mismo principio que paginarImagenes()/paginarCostos()): prueba
   una lista de tamaños de letra de mayor a menor hasta encontrar el más
   grande que cabe arriba de cv-meta sin encimarse. Se prueba con un nombre
   corto (debe quedar grande), uno largo de verdad (debe quedar chico pero
   sin desbordarse) y sin nombre (cae al tipo de proyecto). */
const { chromium } = require('playwright');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
const chk = (label, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' - ' + label); return cond; };
let fallas = 0;
const chkF = (label, cond) => { if(!chk(label, cond)) fallas++; };

(async () => {
  const browser = await chromium.launch(OPCIONES_NAVEGADOR);
  const context = await browser.newContext();
  const page = await context.newPage();
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
    datos.sitios = [normalizarSitio({ id:'s1', clienteId:'c1', nombre:'DAIMLER SANTIAGO' })];
    datos.proyectosImagen = [
      normalizarProyectoImagen({ id:'corto', clienteId:'c1', sitioId:'s1', sitioNombre:'DAIMLER SANTIAGO', folio:'PI-001', nombreProyecto:'Apertura nueva planta', fechaObjetivo:'2026-09-30' }),
      normalizarProyectoImagen({ id:'mayus', clienteId:'c1', sitioId:'s1', sitioNombre:'DAIMLER SANTIAGO', folio:'PI-002', nombreProyecto:'REMODELACION COMEDOR DAIMLER SANTIAGO', fechaObjetivo:'2026-09-30' }),
      normalizarProyectoImagen({ id:'largo', clienteId:'c1', sitioId:'s1', sitioNombre:'DAIMLER SANTIAGO', folio:'PI-003',
        nombreProyecto:'REMODELACION INTEGRAL DE TODO EL AREA DE COMEDOR, COCINA, SANITARIOS Y PASILLOS DE ACCESO PRINCIPAL DE LA PLANTA DAIMLER SANTIAGO FASE 2', fechaObjetivo:'2026-09-30' }),
      normalizarProyectoImagen({ id:'sinnombre', clienteId:'c1', sitioId:'s1', sitioNombre:'DAIMLER SANTIAGO', folio:'PI-004', nombreProyecto:'', tipo:'apertura', fechaObjetivo:'2026-09-30' })
    ];
  });

  // --------- 1) El payload ya manda el nombre en Tipo oración ---------
  const payload = await page.evaluate(() => armarPayloadProyectoImagen(proyectoImagenPorId('mayus'), false).nombreProyecto);
  chkF('armarPayloadProyectoImagen() manda el nombre del proyecto ya en Tipo oración', payload === 'Remodelacion comedor daimler santiago');

  async function abrirPortada(id){
    const [docPage] = await Promise.all([
      context.waitForEvent('page'),
      page.evaluate((pid) => {
        sessionStorage.setItem('forguard.documento.imagen', JSON.stringify(armarPayloadProyectoImagen(proyectoImagenPorId(pid), false)));
        window.open('docs/plantilla_imagen.html', '_blank');
      }, id)
    ]);
    await docPage.waitForLoadState();
    await docPage.waitForTimeout(600);
    const titulo = docPage.locator('.page.cover .cv-titulo').first();
    const resultado = {
      texto: (await titulo.textContent()).trim(),
      fontSize: parseFloat(await titulo.evaluate(el => getComputedStyle(el).fontSize)),
      top: await titulo.evaluate(el => el.getBoundingClientRect().top),
      bottom: await titulo.evaluate(el => el.getBoundingClientRect().bottom),
      metaTop: await docPage.locator('.page.cover .cv-meta').first().evaluate(el => el.getBoundingClientRect().top),
      yaNoDiceLeyendaFija: !/imagen\s*\/\s*apertura/i.test(await titulo.textContent())
    };
    await docPage.close();
    return resultado;
  }

  // --------- 2) Nombre corto: título grande, ya no la leyenda fija ---------
  const corto = await abrirPortada('corto');
  chkF('Título corto: muestra el nombre del proyecto, no "Imagen / Apertura"', corto.texto === 'Apertura nueva planta' && corto.yaNoDiceLeyendaFija);
  chkF('Título corto: usa una letra grande (≥50pt) al no necesitar achicarse', corto.fontSize >= 50);
  chkF('Título corto: no se encima con cv-meta', corto.bottom <= corto.metaTop);

  // --------- 3) Nombre en MAYÚSCULAS: sale en Tipo oración en el PDF real ---------
  const mayus = await abrirPortada('mayus');
  chkF('Título con nombre en mayúsculas: sale convertido a Tipo oración en el PDF real', mayus.texto === 'Remodelacion comedor daimler santiago');

  // --------- 4) Nombre MUY largo: se achica solo y sigue sin encimarse ---------
  const largo = await abrirPortada('largo');
  chkF('Título muy largo: SÍ se redujo de tamaño respecto al corto', largo.fontSize < corto.fontSize);
  chkF('Título muy largo: aun así NO se encima con cv-meta', largo.bottom <= largo.metaTop);
  chkF('Título muy largo: el texto completo sigue ahí (no se truncó)', largo.texto.toLowerCase().includes('fase 2'));

  // --------- 5) Sin nombre de proyecto: cae al tipo de proyecto ---------
  const sinNombre = await abrirPortada('sinnombre');
  chkF('Sin nombre de proyecto, el título cae al tipo ("Apertura nueva"), no se queda vacío', sinNombre.texto.length > 0 && sinNombre.yaNoDiceLeyendaFija);

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
