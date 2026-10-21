/* Razón social de facturación por cliente (14-oct-2026, pedido de Victor
   viendo el documento de una cotización): "en las cotizaciones, necesito
   diferencia a que razon social se debe facturar. Tenemos 3 opciones
   PLATO EXPRESS OPERACIONES, S.A. DE C.V. / PLATO EXPRESS SERVICIOS
   COMPARTIDOS, S.A. DE C.V. / KOOK CATERING, S.A. DE C.V. ... podamos
   diferenciar a nuestros clientes con que razon social se debe emitir".

   Antes de construir se usó AskUserQuestion sobre dos puntos que cambiaban
   el diseño: (1) si es un dato DEL CLIENTE o de cada cotización/póliza por
   separado — Victor eligió "por cliente" (uno fijo, válido para todo lo
   suyo); (2) dónde debía imprimirse — la captura que mandó era en realidad
   el documento de una Cotización ("Vista previa · Costo interno"), y Victor
   pidió que apareciera "en todos lados donde ya sale el cliente", así que
   se agregó a los 4 documentos imprimibles que ya muestran "Cliente":
   Cotizaciones, Pólizas, Levantamientos y Proyectos de Imagen (Órdenes de
   Compra queda fuera a propósito: ahí Forguard es quien COMPRA, el
   documento va dirigido al proveedor, no al cliente; y Certificación
   RATIONAL, por ser un reporte técnico de cumplimiento y no un documento de
   facturación, también queda fuera de este alcance).

   `razonSocialFacturacion` vive en datos.clientes (RAZONES_SOCIALES, lista
   cerrada de 3 valores — '' = sin especificar, para que un cliente de antes
   de este cambio no amanezca facturado bajo una razón social que nadie
   eligió) y se copia TAL CUAL a cada payload de documento (armarPayload*),
   nunca se vuelve a resolver dentro de la plantilla (que solo formatea y
   concatena, nunca calcula — mismo criterio que el resto de los documentos
   de esta app). En la plantilla de Pólizas (la única con una tabla de
   cabecera de solo 2 columnas fijas, position:absolute, medida del PDF
   real) la tercera columna "Facturar a" se omite por completo cuando el
   cliente no tiene razón social capturada, en vez de imprimir un "—" que
   le robaría espacio a cada hoja sin decir nada útil. */
const { chromium } = require('playwright');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
const chk = (label, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' - ' + label); return cond; };
let fallas = 0;
const chkF = (label, cond) => { if(!chk(label, cond)) fallas++; };
const RS_LARGA = 'PLATO EXPRESS SERVICIOS COMPARTIDOS, S.A. DE C.V.';

(async () => {
  const browser = await chromium.launch(OPCIONES_NAVEGADOR);
  const page = await browser.newPage({ viewport: { width: 1300, height: 1600 } });
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
  });

  // --------- 1) Las 3 razones sociales reales, y '' para "sin especificar" ---------
  const constantes = await page.evaluate(() => RAZONES_SOCIALES.slice());
  chkF('Son exactamente las 3 razones sociales reales de Victor', JSON.stringify(constantes) === JSON.stringify([
    'PLATO EXPRESS OPERACIONES, S.A. DE C.V.',
    'PLATO EXPRESS SERVICIOS COMPARTIDOS, S.A. DE C.V.',
    'KOOK CATERING, S.A. DE C.V.'
  ]));

  const normalizacion = await page.evaluate(() => {
    const valida = normalizarCliente({ id:'c1', nombre:'Con razón válida', razonSocialFacturacion:'KOOK CATERING, S.A. DE C.V.' });
    const invalida = normalizarCliente({ id:'c2', nombre:'Con basura', razonSocialFacturacion:'Inventada, S.A.' });
    const sinNada = normalizarCliente({ id:'c3', nombre:'Viejo, de antes de este cambio' });
    return { valida: valida.razonSocialFacturacion, invalida: invalida.razonSocialFacturacion, sinNada: sinNada.razonSocialFacturacion };
  });
  chkF('Una razón social válida se conserva tal cual', normalizacion.valida === 'KOOK CATERING, S.A. DE C.V.');
  chkF('Un valor que no está en la lista cerrada se descarta (nunca una razón social inventada)', normalizacion.invalida === '');
  chkF('Un cliente sin el campo (de antes de este cambio) nace en \'\' — nunca facturado bajo algo que nadie eligió', normalizacion.sinNada === '');

  // --------- 2) El formulario real (modalCliente): captura y persiste ---------
  await page.evaluate(() => { datos.clientes = []; irAModulo('clientes'); modalCliente(null); });
  await page.waitForTimeout(150);
  chkF('El select de razón social aparece en el formulario', (await page.locator('#cRazonSocial').count()) === 1);
  chkF('Arranca en "Sin especificar" al crear un cliente nuevo', (await page.inputValue('#cRazonSocial')) === '');
  await page.fill('#cNombre', 'Mercado Libre');
  await page.selectOption('#cRazonSocial', 'PLATO EXPRESS OPERACIONES, S.A. DE C.V.');
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);
  const guardado = await page.evaluate(() => datos.clientes.find(c => c.nombre === 'Mercado Libre'));
  chkF('Se guarda la razón social elegida en el cliente real', guardado.razonSocialFacturacion === 'PLATO EXPRESS OPERACIONES, S.A. DE C.V.');

  // Reabrir para editar: el select ya trae la decisión guardada
  await page.evaluate((id) => modalCliente(id), guardado.id);
  await page.waitForTimeout(150);
  chkF('Al reabrir para editar, el select ya trae lo guardado', (await page.inputValue('#cRazonSocial')) === 'PLATO EXPRESS OPERACIONES, S.A. DE C.V.');
  await page.evaluate(() => cerrarModal());

  // --------- 3) Se ve en el resumen 360° del cliente, sin tener que editar ---------
  await page.evaluate((id) => { estado.vista = 'resumen-cliente'; estado.clienteId = id; render(); }, guardado.id);
  await page.waitForTimeout(150);
  chkF('El resumen del cliente muestra "Facturar a" con la razón social elegida', (await page.locator('.titulo-zona').first().innerText()).includes('PLATO EXPRESS OPERACIONES'));

  // Un cliente SIN razón social no muestra la línea (nada que decir, no un "—" feo)
  await page.evaluate(() => { datos.clientes.push(normalizarCliente({ id:'cSinRazon', nombre:'Sin razón social' })); });
  await page.evaluate(() => { estado.vista = 'resumen-cliente'; estado.clienteId = 'cSinRazon'; render(); });
  await page.waitForTimeout(150);
  chkF('Un cliente sin razón social no muestra la línea "Facturar a"', !(await page.locator('.titulo-zona').first().innerText()).includes('Facturar a'));

  // --------- 4) Se copia TAL CUAL a los 4 documentos (nunca se vuelve a resolver en la plantilla) ---------
  await page.evaluate((rs) => {
    datos.clientes.push(normalizarCliente({ id:'cDoc', nombre:'Cliente Documentos', razonSocialFacturacion: rs }));
    datos.sitios.push(normalizarSitio({ id:'sDoc', clienteId:'cDoc', nombre:'Sitio Doc', zona:'CDMX' }));
  }, RS_LARGA);

  const payloadCotizacion = await page.evaluate(() => {
    const q = normalizarCotizacion({ id:'qDoc', clienteId:'cDoc', sitioId:'sDoc', folio:'SERV-TEST', fecha: hoyISO(),
      partidas: [ normalizarPartidaCotizacion({ concepto:'Equipo', cantidad:1, precioCliente:100, precioCosto:50 }) ] });
    datos.cotizaciones.push(q);
    return armarPayloadCotizacion(q, 'cliente');
  });
  chkF('armarPayloadCotizacion() copia la razón social del cliente tal cual', payloadCotizacion.razonSocialFacturacion === RS_LARGA);

  const payloadPoliza = await page.evaluate(() => {
    const p = normalizarPoliza({ id:'pDoc', clienteId:'cDoc', sitioId:'sDoc', fechaInicio: hoyISO(),
      partidas: [ normalizarPartida({ concepto:'Equipo', frecuencia:3, mesesServicio: mesesRegulares(0,3), cantidad:1 }) ] });
    datos.polizas.push(p);
    return armarPayloadPoliza(p, false);
  });
  chkF('armarPayloadPoliza() copia la razón social del cliente tal cual', payloadPoliza.razonSocialFacturacion === RS_LARGA);

  const payloadLevantamiento = await page.evaluate(() => {
    const l = normalizarLevantamiento({ id:'lDoc', clienteId:'cDoc', sitioId:'sDoc', sitioNombre:'Sitio Doc', fecha: hoyISO(), hallazgos: [] });
    datos.levantamientos.push(l);
    return armarPayloadLevantamiento(l);
  });
  chkF('armarPayloadLevantamiento() copia la razón social del cliente tal cual', payloadLevantamiento.razonSocialFacturacion === RS_LARGA);

  const payloadImagen = await page.evaluate(() => {
    const pi = normalizarProyectoImagen({ id:'piDoc', clienteId:'cDoc', clienteNombre:'Cliente Documentos', sitioId:'sDoc',
      nombreProyecto:'Proyecto Doc', fecha: hoyISO(), conceptos: [], imagenes: [] });
    datos.proyectosImagen.push(pi);
    return armarPayloadProyectoImagen(pi, false);
  });
  chkF('armarPayloadProyectoImagen() copia la razón social del cliente tal cual', payloadImagen.razonSocialFacturacion === RS_LARGA);

  // Un "Prospecto" de Proyecto de Imagen (sin clienteId real) no truena y simplemente no trae ninguna
  const payloadImagenProspecto = await page.evaluate(() => {
    const pi = normalizarProyectoImagen({ id:'piProspecto', clienteId:'', clienteNombre:'Un Prospecto', sitioId:'',
      nombreProyecto:'Proyecto Prospecto', fecha: hoyISO(), conceptos: [], imagenes: [] });
    return armarPayloadProyectoImagen(pi, false);
  });
  chkF('Un Prospecto sin cliente real no truena, y su razón social sale vacía', payloadImagenProspecto.razonSocialFacturacion === '');

  // --------- 5) Cambiar la razón social del cliente después NO reescribe documentos ya generados ---------
  // (mismo principio de "copiar, no referenciar" que ya usa el resto de la app — ver Forpass)
  await page.evaluate(() => { clientePorId('cDoc').razonSocialFacturacion = 'KOOK CATERING, S.A. DE C.V.'; });
  const payloadColizacionTrasCambio = await page.evaluate(() => armarPayloadCotizacion(cotizacionPorId('qDoc'), 'cliente'));
  chkF('El payload se arma de nuevo con la razón social VIGENTE (no hay snapshot congelado: el documento se regenera cada vez que se abre)',
    payloadColizacionTrasCambio.razonSocialFacturacion === 'KOOK CATERING, S.A. DE C.V.');

  chkF('No hubo errores de página en todo el escenario', errores.length === 0);
  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
