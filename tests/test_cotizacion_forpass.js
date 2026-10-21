/* Cotización Forpass: formato de cotización + exportación de PDF dentro del
   propio módulo de Forpass (16-oct-2026, pedido de Victor con un PDF real de
   Forpass para el cliente Prolec: "Cotizacio_nForpass_Prolec_14_de_Sept_2026.pdf").

   Petición textual de Victor: "con base en este archivo necesitamos hacer un
   formato de cotización en forpass, en el mimso modulo necesito que se pueda
   dividir par apoder crear un archivo similar a este / analizalo y trabaja
   tanto la manera de cotizarlo como exportar los pdf, necesito que se traabje
   en el mimso modulo de forpass solo lo subdivides o analiza cual es la mejor
   manera" — por eso esto vive DENTRO de Forpass (botón "Cotizar Forpass" en
   la ficha del cliente) y no como módulo aparte, y es una entidad separada
   de las Cotizaciones normales (trabajo correctivo/preventivo con costo →
   margen → precio): una cotización Forpass no tiene ese cálculo, vende
   licenciamiento con un checklist de características y precio manual por
   sitio.

   Tres decisiones se resolvieron con AskUserQuestion directo a Victor (no
   adivinadas), y esta prueba las verifica como contrato, no como detalle de
   implementación:
   1) Los SITIOS de la cotización son renglones libres (nombre + módulos
      escritos a mano) — "Renglones libres (Recomendado)" — NO un sitioId
      real de datos.sitios, porque casi siempre se cotiza ANTES de que el
      sitio exista formalmente.
   2) El precio de cada sitio (precioBase/adicional) es 100% manual —
      Victor rechazó explícitamente una tarifa/fórmula compartida por
      cantidad de módulos (los 3 tiers reales de Prolec no son una
      progresión lineal: 1 módulo=$5,950, 2=$10,250, 3+=$10,250+$3,000/extra).
      total = precioBase + adicional es una SUMA de lo ya capturado, nunca
      una fórmula que decida el precio solo.
   3) El checklist de 20 características ("Modelo de Suscripción") nace con
      una plantilla fija pero es editable POR COTIZACIÓN — Victor rechazó
      una "lista fija" global.

   Cubre: 1) modelo de datos (normalizador, Array.isArray preservando un
   checklist vaciado a propósito, cálculo, folio, guardar/eliminar);
   2) el modal (checklist editable, renglones de implementación/referencia/
   sitios, validación de "al menos un sitio", crear y editar); 3) wiring en
   vistaCliente de Forpass (botón, lista, botones por rol); y 4) el payload
   que arma la plantilla del PDF (armarPayloadCotizacionForpass). */
const { chromium } = require('playwright');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
const chk = (label, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' - ' + label); return cond; };
let fallas = 0;
const chkF = (label, cond) => { if(!chk(label, cond)) fallas++; };

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
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'Prolec GE' })];
    datos.cotizacionesForpass = [];
  });

  // --------- 1) Modelo de datos ---------
  const modelo = await page.evaluate(() => {
    const vacio = normalizarCotizacionForpass({ clienteId:'c1' });
    const conChecklistVaciado = normalizarCotizacionForpass({ clienteId:'c1', checklist: [] });
    const calc = calcularCotizacionForpass(normalizarCotizacionForpass({
      clienteId:'c1',
      implementacion: [{ concepto:'Arranque', precio:8000, cantidad:2 }],
      sitios: [
        { nombre:'Planta A', cantidadModulos:3, precioBase:10250, adicional:3000 },
        { nombre:'Planta B', cantidadModulos:1, precioBase:5950, adicional:0 }
      ]
    }));
    const folio1 = generarFolioCotizacionForpass('2026-09-14');
    datos.cotizacionesForpass.push(normalizarCotizacionForpass({ id:'qx1', clienteId:'c1', fecha:'2026-09-14', folio: folio1 }));
    const folio2 = generarFolioCotizacionForpass('2026-09-14');
    datos.cotizacionesForpass = [];
    return {
      checklistLen: vacio.checklist.length,
      checklistCategorias: [...new Set(vacio.checklist.map(it => it.categoria))].sort(),
      checklistTodosIncluidos: vacio.checklist.every(it => it.incluido),
      implementacionLen: vacio.implementacion.length,
      referenciaLen: vacio.referenciaMensual.length,
      sitiosLen: vacio.sitios.length,
      estatus: vacio.estatus,
      membresia: vacio.membresiaNombre,
      puntosNoVacio: vacio.puntosImportantes.length > 0,
      slaNoVacio: vacio.sla.length > 0,
      checklistVaciadoSeRespeta: conChecklistVaciado.checklist.length === 0,
      implPrecioPorCantidad: calc.implementacion[0].total === 16000,
      pagoInicial: calc.pagoInicial,
      sitioTotal1: calc.sitios[0].total,
      sitioTotal2: calc.sitios[1].total,
      totalMensual: calc.totalMensual,
      totalModulos: calc.totalModulos,
      totalSitios: calc.totalSitios,
      folio1, folio2
    };
  });
  chkF('normalizarCotizacionForpass() nace con las 20 características de la plantilla de Prolec', modelo.checklistLen === 20);
  chkF('Las 20 características cubren las 4 categorías (hardware/data/reportería/asistencia)', JSON.stringify(modelo.checklistCategorias) === JSON.stringify(['asistencia','data','hardware','reporteria']));
  chkF('Las 20 características nacen todas incluidas', modelo.checklistTodosIncluidos);
  chkF('implementacion nace con 2 renglones por defecto (capacitación + viáticos)', modelo.implementacionLen === 2);
  chkF('referenciaMensual nace con 2 renglones por defecto', modelo.referenciaLen === 2);
  chkF('sitios nace vacío (son renglones libres que se capturan a mano, no una plantilla)', modelo.sitiosLen === 0);
  chkF('estatus nace en "borrador"', modelo.estatus === 'borrador');
  chkF('membresiaNombre nace en "Prime"', modelo.membresia === 'Prime');
  chkF('puntosImportantes nace con el texto real del PDF de Prolec, no vacío', modelo.puntosNoVacio);
  chkF('sla nace con el texto real del PDF de Prolec, no vacío', modelo.slaNoVacio);
  chkF('Un checklist vaciado A PROPÓSITO (Array.isArray, no .length) se respeta vacío para siempre', modelo.checklistVaciadoSeRespeta);
  chkF('calcularCotizacionForpass(): total de implementación = precio × cantidad', modelo.implPrecioPorCantidad);
  chkF('Pago Inicial de Arranque = suma de los totales de implementación', modelo.pagoInicial === 16000);
  chkF('Sitio 1: total = precioBase + adicional (suma manual, NO una fórmula por módulos)', modelo.sitioTotal1 === 13250);
  chkF('Sitio 2: total = precioBase + adicional, sin módulo extra', modelo.sitioTotal2 === 5950);
  chkF('totalMensual = suma de los totales de todos los sitios', modelo.totalMensual === 19200);
  chkF('totalModulos = suma de cantidadModulos de todos los sitios', modelo.totalModulos === 4);
  chkF('totalSitios = número de sitios', modelo.totalSitios === 2);
  chkF('generarFolioCotizacionForpass(): formato COTFP-ddmmaa-01', modelo.folio1 === 'COTFP-140926-01');
  chkF('Una segunda cotización el mismo día genera -02 (cuenta las ya guardadas ese día)', modelo.folio2 === 'COTFP-140926-02');

  // --------- 2) Modal: crear una cotización completa ---------
  await page.evaluate(() => { irAModulo('forpass'); estado.vista='cliente'; estado.clienteId='c1'; render(); });
  await page.waitForTimeout(200);
  chkF('El botón "Cotizar Forpass" aparece en la ficha del cliente en Forpass', (await page.locator('[data-cotizar-forpass]').count()) === 1);

  await page.click('[data-cotizar-forpass]');
  await page.waitForTimeout(150);
  chkF('El modal abre con título "Nueva cotización Forpass"', (await page.locator('#modalTitulo', { hasText: 'Nueva cotización Forpass' }).count()) === 1);
  chkF('Las 20 características del checklist se pintan, agrupadas por categoría', (await page.locator('[data-cfp-check]').count()) === 20);
  chkF('Los 4 nombres de categoría se muestran (Hardware/Data/Reportería/Asistencia)', (await page.locator('.cfp-categoria-nombre').count()) === 4);
  chkF('Arranca sin ningún sitio capturado (renglón libre, no hay plantilla)', (await page.locator('[data-cfp-sitio-nombre]').count()) === 0);

  // Intentar guardar sin sitios debe fallar con aviso de validación.
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(150);
  chkF('No deja guardar sin al menos un sitio (validación explícita)', (await page.locator('#toast', { hasText: 'Agrega al menos un sitio' }).count()) === 1);
  chkF('El modal sigue abierto tras el intento fallido', await page.evaluate(() => document.getElementById('telon').classList.contains('abierto')));

  // Destildar una característica del checklist — debe dejar de salir en el payload.
  const primerCheckId = await page.locator('[data-cfp-check]').first().getAttribute('data-cfp-check');
  await page.locator('[data-cfp-check="' + primerCheckId + '"]').uncheck();

  // Llenar los campos de encabezado.
  await page.fill('#cfpProyecto', 'Sistema Módulo Punto de Registro');
  await page.fill('#cfpFecha', '2026-09-14');
  await page.fill('#cfpMembresia', 'Prime');
  await page.fill('#cfpVendNombre', 'Victor Mejía');
  await page.fill('#cfpVendCorreo', 'victor.mejia@platoexpress.com');

  // Agregar dos sitios con precio 100% manual.
  await page.click('#btnCfpAgregarSitio');
  await page.click('#btnCfpAgregarSitio');
  const idsSitio = await page.locator('[data-cfp-sitio-nombre]').evaluateAll(els => els.map(e => e.dataset.cfpSitioNombre));
  await page.fill('[data-cfp-sitio-nombre="' + idsSitio[0] + '"]', 'Planta Apodaca');
  await page.fill('[data-cfp-sitio-modulos="' + idsSitio[0] + '"]', '3');
  await page.fill('[data-cfp-sitio-base="' + idsSitio[0] + '"]', '10250');
  await page.fill('[data-cfp-sitio-adicional="' + idsSitio[0] + '"]', '3000');
  await page.fill('[data-cfp-sitio-nombre="' + idsSitio[1] + '"]', 'Planta Querétaro');
  await page.fill('[data-cfp-sitio-modulos="' + idsSitio[1] + '"]', '1');
  await page.fill('[data-cfp-sitio-base="' + idsSitio[1] + '"]', '5950');
  await page.waitForTimeout(100);
  chkF('El total mensual en el pie de la tabla de sitios suma los 2 sitios capturados', (await page.locator('#cfpSitios tfoot').innerText()).includes('19,200'));

  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);
  const creada = await page.evaluate(() => {
    const q = datos.cotizacionesForpass[0];
    return q ? {
      existe: true, folio: q.folio, proyecto: q.proyecto, sitios: q.sitios.length,
      checklistIncluidos: q.checklist.filter(it => it.incluido).length,
      primerChecklistIncluido: q.checklist.find(it => it.id === '__noexiste__')
    } : { existe: false };
  });
  chkF('La cotización se crea y aparece en datos.cotizacionesForpass', creada.existe);
  chkF('El folio se genera en automático (COTFP-140926-01)', creada.folio === 'COTFP-140926-01');
  chkF('El proyecto capturado se guarda', creada.proyecto === 'Sistema Módulo Punto de Registro');
  chkF('Los 2 sitios capturados se guardan', creada.sitios === 2);
  chkF('Destildar una característica la deja en 19 incluidas (20 - 1)', creada.checklistIncluidos === 19);

  // --------- 3) Wiring: lista de Cotizaciones Forpass en la ficha del cliente ---------
  await page.waitForTimeout(150);
  chkF('El bloque "Cotizaciones Forpass" aparece en la ficha del cliente', (await page.locator('.bloque h3', { hasText: 'Cotizaciones Forpass' }).count()) === 1);
  chkF('El folio generado se lista en la tabla', (await page.locator('td', { hasText: 'COTFP-140926-01' }).count()) === 1);
  chkF('El botón "Vista previa" aparece para la cotización', (await page.locator('[data-ver-cotizacion-forpass]').count()) === 1);
  chkF('El botón Editar (lápiz) aparece para Owner', (await page.locator('[data-editar-cotizacion-forpass]').count()) === 1);
  chkF('El botón Eliminar (basura) aparece para Owner', (await page.locator('[data-eliminar-cotizacion-forpass]').count()) === 1);

  // Vista previa: abre el iframe de la plantilla PDF dentro de un modal.
  await page.click('[data-ver-cotizacion-forpass]');
  await page.waitForTimeout(250);
  chkF('"Vista previa" abre un modal con clase doc-previa', await page.evaluate(() => $('modal').classList.contains('doc-previa')));
  chkF('El iframe de la plantilla se monta adentro', (await page.locator('.iframe-previa').count()) === 1);
  await page.click('[data-modal="cancelar"]');
  await page.waitForTimeout(150);

  // Un rol sin permiso de edición no debe ver "Cotizar Forpass" ni Editar/Eliminar.
  await page.evaluate(() => { sesion.rol='viewer'; render(); });
  await page.waitForTimeout(150);
  chkF('Rol viewer: no ve el botón "Cotizar Forpass"', (await page.locator('[data-cotizar-forpass]').count()) === 0);
  chkF('Rol viewer: no ve el botón Editar de la cotización', (await page.locator('[data-editar-cotizacion-forpass]').count()) === 0);
  chkF('Rol viewer: no ve el botón Eliminar de la cotización', (await page.locator('[data-eliminar-cotizacion-forpass]').count()) === 0);
  chkF('Rol viewer: sí ve "Vista previa" (es de solo lectura)', (await page.locator('[data-ver-cotizacion-forpass]').count()) === 1);
  await page.evaluate(() => { sesion.rol='owner'; render(); });
  await page.waitForTimeout(150);

  // --------- 4) Editar una cotización existente ---------
  await page.click('[data-editar-cotizacion-forpass]');
  await page.waitForTimeout(150);
  chkF('El modal de edición trae el título "Editar cotización Forpass"', (await page.locator('#modalTitulo', { hasText: 'Editar cotización Forpass' }).count()) === 1);
  chkF('El proyecto ya capturado se precarga', await page.inputValue('#cfpProyecto') === 'Sistema Módulo Punto de Registro');
  await page.fill('#cfpProyecto', 'Licenciamiento Forpass multisitio — v2');
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);
  const editada = await page.evaluate(() => datos.cotizacionesForpass[0].proyecto);
  chkF('La edición actualiza el registro existente, no crea uno nuevo', editada === 'Licenciamiento Forpass multisitio — v2');
  chkF('Sigue habiendo una sola cotización tras editar', (await page.evaluate(() => datos.cotizacionesForpass.length)) === 1);

  // --------- 5) Payload del PDF (armarPayloadCotizacionForpass) ---------
  const payload = await page.evaluate(() => {
    const q = datos.cotizacionesForpass[0];
    return armarPayloadCotizacionForpass(q);
  });
  chkF('El payload trae el folio de la cotización', payload.folio === 'COTFP-140926-01');
  chkF('El payload trae el nombre del cliente ya resuelto (no solo el id)', payload.cliente === 'Prolec GE');
  chkF('El payload agrupa el checklist por categoría, con solo lo incluido', Array.isArray(payload.checklistPorCategoria) && payload.checklistPorCategoria.every(g => g.items.every(it => !!it.concepto)));
  chkF('El total de items incluidos en el payload es 19 (se destildó 1 de 20)', payload.checklistPorCategoria.reduce((s,g)=> s + g.items.length, 0) === 19);
  chkF('Los sitios del payload traen precios ya formateados en pesos ($)', payload.sitios[0].precioBase.startsWith('$'));
  chkF('El total mensual del payload coincide con el calculado ($19,200)', payload.totalMensual === '$19,200');
  chkF('El SLA se separa en subtítulos (sin punto final) y puntos (con punto final)', payload.sla.some(l => l.subtitulo) && payload.sla.some(l => !l.subtitulo));

  // --------- 6) Eliminar ---------
  await page.evaluate(() => { sesion.rol='owner'; render(); });
  await page.waitForTimeout(150);
  await page.click('[data-eliminar-cotizacion-forpass]');
  await page.waitForTimeout(150);
  chkF('El modal de confirmación pide "Sí, eliminar" (confirmación normal, es reversible solo hasta aquí)', (await page.locator('button', { hasText: 'Sí, eliminar' }).count()) === 1);
  await page.click('button[data-modal="guardar"]');
  await page.waitForTimeout(200);
  chkF('Eliminar borra la cotización de datos.cotizacionesForpass', (await page.evaluate(() => datos.cotizacionesForpass.length)) === 0);
  chkF('El bloque "Cotizaciones Forpass" desaparece de la ficha del cliente al quedar sin ninguna', (await page.locator('.bloque h3', { hasText: 'Cotizaciones Forpass' }).count()) === 0);

  chkF('No hubo errores de página en todo el escenario', errores.length === 0);
  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
