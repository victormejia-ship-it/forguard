/* La portada del PDF de una Cotización (una póliza con estatus distinto de
   'activa') se homologa a la de una Póliza activa (30-sep-2026, pedido de
   Victor con dos capturas lado a lado: "recordemos que la de lado
   izquierdo fue la inicial pero ahorita ya podemos homologarlo todo a la
   de la izquierda" — la izquierda era la portada de Póliza activa).

   Antes, pageCover() (docs/plantilla_poliza_forguard.html) bifurcaba por
   `POLIZA.estatus === 'activa'`:
   - Activa: título completo de 3 líneas a 60pt ("Póliza de" / "Mantenimiento"
     / "Preventivo") y solo 2 campos en cv-meta (Cliente, Fecha).
   - Cualquier otro estatus (cotización, enviada, perdida, cancelada):
     título abreviado a 72pt ("Cotización" / "Póliza de" / "Mtto Prev.") y
     3 campos (+ "Proyecto", siempre con el texto fijo "Póliza de
     Mantenimiento Preventivo" — la misma frase que ya decía el título,
     dato redundante).

   Ahora armarPayloadPoliza() (index.html) manda SIEMPRE el título completo
   de 3 líneas, sin importar el estatus, y pageCover() ya no trae ninguna
   bifurcación: toda póliza —activa o cotización— usa exactamente la misma
   portada, con solo Cliente/Fecha. test_documentos_hoja_cierre.js ya cubre
   el caso 'activa' (2 campos, sin cambios); este archivo cubre
   específicamente que el caso 'cotizacion' AHORA se ve IGUAL, no
   distinto. */
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
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'BANORTE TORRE KOI' })];
    datos.sitios = [normalizarSitio({ id:'s1', clienteId:'c1', nombre:'BANORTE TORRE KOI' })];
    datos.polizas = [
      normalizarPoliza({
        id:'p1', clienteId:'c1', sitioId:'s1', folio:'POL-001', sitioNombre:'BANORTE TORRE KOI',
        estatus:'activa', facturacion:'mensual', cargoA:'cliente',
        fechaInicio:'2026-01-01', fechaCotizacion:'2026-09-17',
        partidas: [{ id:'x1', concepto:'Equipo de prueba', cantidad:1, precioUnitario:1000, frecuencia:1, mesesServicio:[0] }],
        cobros:[false]
      }),
      normalizarPoliza({
        id:'p2', clienteId:'c1', sitioId:'s1', folio:'COT-002', sitioNombre:'BANORTE TORRE KOI',
        estatus:'cotizacion', facturacion:'mensual', cargoA:'cliente',
        fechaInicio:'2026-01-01', fechaCotizacion:'2026-09-02',
        partidas: [{ id:'x1', concepto:'Equipo de prueba', cantidad:1, precioUnitario:1000, frecuencia:1, mesesServicio:[0] }],
        cobros:[false]
      })
    ];
  });

  // --------- El payload en sí: mismo título completo sin importar el estatus ---------
  const payloads = await page.evaluate(() => ({
    activa: armarPayloadPoliza(polizaPorId('p1')).titulo.lineas,
    cotizacion: armarPayloadPoliza(polizaPorId('p2')).titulo.lineas
  }));
  chkF('El título de una póliza activa sigue siendo el completo de 3 líneas', JSON.stringify(payloads.activa) === JSON.stringify(['Póliza de','Mantenimiento','Preventivo']));
  chkF('El título de una "cotización" (estatus distinto de activa) es AHORA el mismo, no el abreviado de antes', JSON.stringify(payloads.cotizacion) === JSON.stringify(['Póliza de','Mantenimiento','Preventivo']));

  async function abrirPortada(folioLabel, idPoliza){
    const [docPage] = await Promise.all([
      context.waitForEvent('page'),
      page.evaluate((id) => {
        sessionStorage.setItem('forguard.documento.poliza', JSON.stringify(armarPayloadPoliza(polizaPorId(id))));
        window.open('docs/plantilla_poliza_forguard.html', '_blank');
      }, idPoliza)
    ]);
    docPage.on('pageerror', e => errores.push('PAGEERROR (' + folioLabel + '): ' + e.message));
    await docPage.waitForLoadState();
    await docPage.waitForTimeout(500);
    const portada = docPage.locator('.page.cover').first();
    const resultado = {
      lineasTitulo: await portada.locator('.cv-titulo div').allTextContents(),
      fontSize: await portada.locator('.cv-titulo').evaluate(el => getComputedStyle(el).fontSize),
      campos: await portada.locator('.cv-meta .campo').count(),
      etiquetas: await portada.locator('.cv-meta .etiqueta').allTextContents()
    };
    await docPage.close();
    return resultado;
  }

  const portadaActiva = await abrirPortada('Póliza activa', 'p1');
  const portadaCotizacion = await abrirPortada('Cotización', 'p2');

  chkF('Portada activa: título completo de 3 líneas', JSON.stringify(portadaActiva.lineasTitulo) === JSON.stringify(['Póliza de','Mantenimiento','Preventivo']));
  chkF('Portada activa: 2 campos (Cliente, Fecha), sin "Proyecto"', portadaActiva.campos === 2 && !portadaActiva.etiquetas.some(e => /proyecto/i.test(e)));

  chkF('Portada de cotización: AHORA trae el mismo título completo de 3 líneas (ya no dice "Cotización")', JSON.stringify(portadaCotizacion.lineasTitulo) === JSON.stringify(['Póliza de','Mantenimiento','Preventivo']));
  chkF('Portada de cotización: AHORA tiene 2 campos, igual que la activa — ya NO trae "Proyecto"', portadaCotizacion.campos === 2 && !portadaCotizacion.etiquetas.some(e => /proyecto/i.test(e)));
  chkF('Las dos portadas usan el mismo tamaño de letra en el título (homologadas de verdad, no solo mismo texto)', portadaActiva.fontSize === portadaCotizacion.fontSize);

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
