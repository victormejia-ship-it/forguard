/* Módulo CRM: pipeline de oportunidades (12-oct-2026, pedido de Victor tras
   ver un prototipo de tablero Kanban: "Sí, intégralo como módulo en
   index.html"). Mismo mensaje anterior ("Actúa como un Consultor Senior de
   Producto... Necesitamos diseñar un nuevo módulo estilo CRM") pidió una
   propuesta genérica, portable; esta integración la ancla a lo que YA
   existe en Forguard en vez de inventar un sistema paralelo:

   - Una Oportunidad NUNCA duplica datos de contacto: se liga a
     datos.clientes por clienteId cuando ya es un cliente formal
     (prospectoNombre solo mientras no lo es) — nombreOportunidad() siempre
     lee el nombre VIGENTE del cliente, no el texto capturado en su momento.
   - Colección de verdad, un documento por oportunidad (mismo molde que
     /visitas o /activos), con actividades[]/tareas[] EMBEBIDAS (mismo
     criterio que hallazgos[] en Levantamientos) — nunca colecciones aparte.
   - moverEtapaOportunidad() es el ÚNICO punto que cambia la etapa (el
     select del modal y el arrastre entre columnas pasan los dos por ahí):
     siempre resetea la probabilidad sugerida y deja su propia entrada en el
     historial; "perdida" siempre guarda su motivo.
   - Tareas/notas de una oportunidad YA GUARDADA se confirman al toque
     (mismo criterio que el selector de propiedad en Equipos RATIONAL) — los
     campos generales (título/cliente/etapa/valor/etc.) siguen el molde
     clásico de un "Guardar cambios" al pie del modal.
   - Candado propio en firestore.rules (puedeEditar(): Owner/Admin/Analyst,
     igual que Cotizaciones — nunca Técnico/Reportero/control_activos, ese
     trabajo no es suyo) — Viewer sigue de solo lectura, como en el resto de
     la app.

   AMPLIACIÓN (12-oct-2026, mismo día, pedido de Victor: "Mete sitio del
   cliente, contacto del prospecto y vínculo a Cotización"): sitioId y
   cotizacionId SOLO existen si clienteId ya apunta a un cliente real —un
   prospecto no tiene sitios ni cotizaciones propias—, así que ambos selects
   del modal se regeneran en vivo contra sitiosDe()/datos.cotizaciones cada
   vez que cambia el cliente elegido. contactoProspecto, en cambio, es la
   ÚNICA excepción a "nunca duplicar datos de contacto": existe justo porque
   un prospecto nuevo no vive todavía en ningún otro lado del sistema.

   SEGUNDA AMPLIACIÓN (12-oct-2026, mismo día, pedido de Victor: "necesito
   que pueda ser un CRM completo... a ese alcance se requiere"):
   oportunidadEstancada() (sin actividad real en 14+ días, nunca
   ganada/perdida) con su propio KPI, insignia en tarjeta y filtro de
   estado; modalReporteCRM() agrega pronóstico de ventas ponderado por mes
   de cierre (solo lo abierto) y motivos de pérdida agrupados por texto
   exacto (best effort: es texto libre, no un catálogo). Ambos son de solo
   lectura — Viewer también los ve. */
const { chromium } = require('playwright');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
const chk = (label, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' - ' + label); return cond; };
let fallas = 0;
const chkF = (label, cond) => { if(!chk(label, cond)) fallas++; };

(async () => {
  const browser = await chromium.launch(OPCIONES_NAVEGADOR);
  const page = await browser.newPage({ viewport: { width: 1300, height: 1400 } });
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
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'BORGWARNER' })];
    datos.personal = [normalizarPersona({ id:'p1', nombre:'Marisol Peña', puesto:'Ventas' })];
    datos.sitios = [normalizarSitio({ id:'s1', clienteId:'c1', nombre:'Sucursal Monterrey' })];
    datos.cotizaciones = [normalizarCotizacion({ id:'q1', clienteId:'c1', folio:'COT-0099', partidas:[{ concepto:'Servicio', cantidad:1, precioCosto:2000 }] })];
    datos.oportunidades = [
      normalizarOportunidad({ id:'op1', clienteId:'c1', titulo:'Renovación anual', etapa:'negociacion', valorEstimado:184000, responsableId:'p1', etiquetas:['Cuenta clave'] }),
      normalizarOportunidad({ id:'op2', prospectoNombre:'Grupo Sierra Azul', titulo:'Implementación nueva', etapa:'propuesta', valorEstimado:96000 }),
      normalizarOportunidad({ id:'op3', prospectoNombre:'Maquiladora Rivas', titulo:'Contrato 2026', etapa:'ganada', valorEstimado:210000 })
    ];
    irAModulo('crm');
  });
  await page.waitForTimeout(250);

  // --------- 1) El tablero arranca con las 6 columnas y las tarjetas correctas ---------
  chkF('Título del módulo', (await page.locator('h2').first().textContent()).trim() === 'CRM · Oportunidades');
  chkF('Las 6 etapas del pipeline, siempre en el mismo orden', await page.locator('.columna-crm').count() === 6);
  chkF('Las 3 oportunidades de prueba están todas en el tablero', await page.locator('.tarjeta-crm').count() === 3);

  // --------- 2) El nombre mostrado es el VIGENTE del cliente, no el capturado ---------
  const tarjetaOp1 = page.locator('[data-oportunidad="op1"]');
  chkF('La tarjeta ligada a un cliente muestra su nombre real (BORGWARNER)', (await tarjetaOp1.textContent()).includes('BORGWARNER'));
  await page.evaluate(() => { clientePorId('c1').nombre = 'BORGWARNER RENOMBRADA'; });
  await page.evaluate(() => render());
  await page.waitForTimeout(150);
  chkF('...y sigue el nombre del cliente si éste cambia después (nunca el texto viejo)', (await page.locator('[data-oportunidad="op1"]').textContent()).includes('BORGWARNER RENOMBRADA'));

  // --------- 3) KPIs del encabezado ---------
  const kpis = await page.locator('.kpis').textContent();
  chkF('Pipeline abierto solo cuenta las NO cerradas (184,000 + 96,000, no la ganada)', kpis.includes('$280,000'));
  chkF('Tasa de cierre: 1 ganada de 1 cerrada = 100%', kpis.includes('100%'));

  // --------- 4) Crear una oportunidad nueva ---------
  await page.click('[data-accion="nueva-oportunidad"]');
  await page.waitForTimeout(150);
  await page.fill('#opTitulo', 'Prueba nueva oportunidad');
  await page.fill('#opProspecto', 'Cliente de prueba');
  await page.fill('#opValor', '50000');
  await page.selectOption('#opEtapa', 'calificado');
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);
  const creada = await page.evaluate(() => datos.oportunidades.find(o => o.titulo === 'Prueba nueva oportunidad'));
  chkF('La oportunidad nueva queda guardada de verdad en datos.oportunidades', !!creada);
  chkF('...con la etapa elegida y su probabilidad sugerida (30%)', !!creada && creada.etapa === 'calificado' && creada.probabilidad === 30);
  chkF('Son 4 tarjetas ahora en el tablero', await page.locator('.tarjeta-crm').count() === 4);

  // --------- 5) Cambiar de etapa desde el modal: historial + probabilidad ---------
  await page.click('[data-oportunidad="op2"]');
  await page.waitForTimeout(150);
  chkF('El modal abre en modo edición', (await page.locator('#modalTitulo').textContent()).includes('Editar'));
  chkF('Los campos llegan precargados', await page.locator('#opTitulo').inputValue() === 'Implementación nueva');
  await page.selectOption('#opEtapa', 'negociacion');
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);
  const op2 = await page.evaluate(() => datos.oportunidades.find(o=>o.id==='op2'));
  chkF('La etapa cambió de verdad', op2.etapa === 'negociacion');
  chkF('La probabilidad se actualizó a la sugerida de la nueva etapa (75%)', op2.probabilidad === 75);
  chkF('Quedó una entrada en el historial de actividad', op2.actividades.some(a => a.tipo === 'cambio_etapa' && a.descripcion.includes('Propuesta') && a.descripcion.includes('Negociación')));

  // --------- 6) Marcar como perdida pide/guarda un motivo ---------
  await page.click('[data-oportunidad="op2"]');
  await page.waitForTimeout(150);
  chkF('El campo de motivo empieza escondido (la etapa actual no es "perdida")', !(await page.locator('#campoMotivoPerdidaCRM').isVisible()));
  await page.selectOption('#opEtapa', 'perdida');
  chkF('...y aparece en vivo al elegir "Perdida" en el select', await page.locator('#campoMotivoPerdidaCRM').isVisible());
  await page.fill('#opMotivoPerdida', 'Se fueron con otro proveedor');
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);
  const op2Perdida = await page.evaluate(() => datos.oportunidades.find(o=>o.id==='op2'));
  chkF('Guarda el motivo de pérdida', op2Perdida.motivoPerdida === 'Se fueron con otro proveedor');
  chkF('La probabilidad de una perdida siempre es 0%', op2Perdida.probabilidad === 0);

  // --------- 7) Arrastrar una tarjeta a otra columna mueve la etapa de verdad ---------
  // Playwright no soporta bien drag HTML5 con el mouse real sin plugins —se
  // dispara la secuencia de eventos nativa directo, que es justo lo que
  // escuchan los listeners reales de montarTableroCRM().
  await page.evaluate(() => {
    const tarjeta = document.querySelector('[data-oportunidad="op1"]');
    const columnaDestino = document.querySelector('[data-etapa-crm="ganada"]');
    const dt = new DataTransfer();
    dt.setData('text/plain', 'op1');
    tarjeta.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
    columnaDestino.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    columnaDestino.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(250);
  const op1TrasArrastre = await page.evaluate(() => datos.oportunidades.find(o=>o.id==='op1'));
  chkF('Arrastrar a otra columna cambia la etapa de verdad (no solo visualmente)', op1TrasArrastre.etapa === 'ganada');
  chkF('...y también pasa por moverEtapaOportunidad (probabilidad 100%, con su historial)', op1TrasArrastre.probabilidad === 100 && op1TrasArrastre.actividades.some(a=>a.tipo==='cambio_etapa'));

  // --------- 8) Soltar sobre "Perdida" pide el motivo antes de mover ---------
  await page.evaluate(() => {
    const tarjeta = document.querySelector('[data-oportunidad="op3"]');
    const columnaDestino = document.querySelector('[data-etapa-crm="perdida"]');
    const dt = new DataTransfer();
    dt.setData('text/plain', 'op3');
    tarjeta.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
    columnaDestino.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(200);
  chkF('Soltar sobre "Perdida" abre un modal a pedir el motivo (no mueve directo)', await page.locator('#modalTitulo').textContent() === 'Marcar como perdida');
  await page.fill('#motivoPerdidaInput', 'Presupuesto cancelado');
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);
  const op3 = await page.evaluate(() => datos.oportunidades.find(o=>o.id==='op3'));
  chkF('Tras confirmar el motivo, la etapa sí se mueve a perdida', op3.etapa === 'perdida' && op3.motivoPerdida === 'Presupuesto cancelado');

  // --------- 9) Tareas y notas: se confirman al toque, sin pasar por "Guardar cambios" ---------
  await page.click('[data-oportunidad="op1"]');
  await page.waitForTimeout(150);
  await page.fill('#crmNuevaTareaTitulo', 'Llamar para agradecer el cierre');
  await page.fill('#crmNuevaTareaFecha', '2026-11-01');
  await page.click('#btnAgregarTareaCRM');
  await page.waitForTimeout(200);
  chkF('La tarea queda guardada sin tocar "Guardar cambios" (el modal se reabrió solo)', await page.evaluate(() => oportunidadPorId('op1').tareas.some(t=>t.titulo==='Llamar para agradecer el cierre')));
  chkF('El modal se reabrió automáticamente tras guardar la tarea', await page.locator('#telon.abierto').count() === 1);

  await page.click('[data-tarea-crm]');
  await page.waitForTimeout(200);
  chkF('Marcar una tarea como hecha también se guarda al toque', await page.evaluate(() => oportunidadPorId('op1').tareas.find(t=>t.titulo==='Llamar para agradecer el cierre').completada === true));

  await page.fill('#crmNuevaNota', 'Cliente muy satisfecho con el servicio');
  await page.click('#btnAgregarNotaCRM');
  await page.waitForTimeout(200);
  chkF('La nota queda en el historial de actividad', await page.evaluate(() => oportunidadPorId('op1').actividades.some(a=>a.tipo==='nota' && a.descripcion==='Cliente muy satisfecho con el servicio')));
  await page.evaluate(() => cerrarModal());

  // --------- 10) Buscar y filtrar ---------
  await page.fill('#buscaOportunidad', 'Sierra Azul');
  await page.waitForTimeout(200);
  chkF('Buscar por el nombre del prospecto filtra el tablero', await page.locator('.tarjeta-crm').count() === 1);
  await page.fill('#buscaOportunidad', '');
  await page.waitForTimeout(150);

  // --------- 11) Eliminar: exclusivo de Admin/Owner ---------
  await page.click('[data-oportunidad="op1"]');
  await page.waitForTimeout(150);
  chkF('Owner sí ve el botón de eliminar', await page.locator('#btnBorrarOportunidad').count() === 1);
  await page.click('#btnBorrarOportunidad');
  await page.waitForTimeout(150);
  await page.click('.modal button:has-text("Sí, eliminar")');
  await page.waitForTimeout(200);
  chkF('La oportunidad queda eliminada de verdad', await page.evaluate(() => !datos.oportunidades.some(o=>o.id==='op1')));

  // --------- 12) Viewer: lectura, sin crear/editar/arrastrar/eliminar ---------
  await page.evaluate(() => { sesion.rol='viewer'; render(); });
  await page.waitForTimeout(150);
  chkF('Viewer sigue teniendo acceso al módulo (lectura, como el resto de la app)', await page.evaluate(() => modulosPermitidos().includes('crm')));
  chkF('Viewer NO ve el botón "Nueva oportunidad"', await page.locator('[data-accion="nueva-oportunidad"]').count() === 0);
  chkF('Las tarjetas de Viewer no son arrastrables', await page.locator('.tarjeta-crm[draggable="true"]').count() === 0);
  await page.click('.tarjeta-crm');
  await page.waitForTimeout(150);
  chkF('Viewer puede abrir el detalle para consultarlo...', await page.locator('#telon.abierto').count() === 1);
  chkF('...pero sin botón de Guardar', await page.locator('[data-modal="guardar"]').count() === 0);
  chkF('...ni de Eliminar', await page.locator('#btnBorrarOportunidad').count() === 0);
  chkF('...y los campos son de solo lectura', await page.locator('#opTitulo').getAttribute('readonly') !== null);

  // --------- 13) Técnico, reportero y control_activos no ven el módulo (no es su trabajo) ---------
  for (const rol of ['tecnico', 'reportero', 'control_activos']) {
    const tiene = await page.evaluate((r) => { sesion.rol = r; return modulosPermitidos().includes('crm'); }, rol);
    chkF('El rol "' + rol + '" no ve el módulo CRM', !tiene);
  }

  // --------- 14) Sitio del cliente, contacto del prospecto y cotización vinculada ---------
  // (12-oct-2026, pedido de Victor: "mete sitio del cliente, contacto del
  // prospecto y vínculo a Cotización"). Sitio y Cotización SOLO tienen
  // sentido con un cliente real detrás (ver normalizarOportunidad) — por
  // eso ambos selects se regeneran en vivo al cambiar #opCliente.
  await page.evaluate(() => { cerrarModal(); sesion.rol='owner'; render(); });
  await page.waitForTimeout(150);
  await page.click('[data-accion="nueva-oportunidad"]');
  await page.waitForTimeout(150);
  chkF('Sin cliente elegido, Sitio avisa que hay que elegir cliente primero', (await page.locator('#opSitio').innerText()).includes('Elige un cliente'));
  chkF('...y lo mismo la Cotización', (await page.locator('#opCotizacion').innerText()).includes('Elige un cliente'));
  await page.selectOption('#opCliente', 'c1');
  await page.waitForTimeout(100);
  chkF('Al elegir el cliente, el Sitio se llena con SUS sitios', (await page.locator('#opSitio option').allTextContents()).some(t => t.includes('Sucursal Monterrey')));
  chkF('...y la Cotización con SUS cotizaciones', (await page.locator('#opCotizacion option').allTextContents()).some(t => t.includes('COT-0099')));
  await page.fill('#opTitulo', 'Oportunidad con sitio y cotización');
  await page.selectOption('#opSitio', 's1');
  await page.selectOption('#opCotizacion', 'q1');
  await page.fill('#opContactoNombre', 'Laura Gómez');
  await page.fill('#opContactoPuesto', 'Compras');
  await page.fill('#opContactoTelefono', '81-5555-0000');
  await page.fill('#opContactoCorreo', 'laura@prueba.com');
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);
  const opConSitio = await page.evaluate(() => datos.oportunidades.find(o => o.titulo === 'Oportunidad con sitio y cotización'));
  chkF('Queda guardado el sitio del cliente', !!opConSitio && opConSitio.sitioId === 's1');
  chkF('...la cotización vinculada', !!opConSitio && opConSitio.cotizacionId === 'q1');
  chkF('...y el contacto completo', !!opConSitio && opConSitio.contactoProspecto.nombre === 'Laura Gómez' && opConSitio.contactoProspecto.puesto === 'Compras' && opConSitio.contactoProspecto.telefono === '81-5555-0000' && opConSitio.contactoProspecto.correo === 'laura@prueba.com');
  const tarjetaConSitio = page.locator('[data-oportunidad="' + opConSitio.id + '"]');
  chkF('La tarjeta del tablero muestra el sitio junto al nombre del cliente', (await tarjetaConSitio.textContent()).includes('Sucursal Monterrey'));
  chkF('...y el folio de la cotización vinculada como insignia', (await tarjetaConSitio.textContent()).includes('COT-0099'));

  await page.click('[data-oportunidad="' + opConSitio.id + '"]');
  await page.waitForTimeout(150);
  chkF('Al reabrir, el Sitio sigue seleccionado', await page.locator('#opSitio').inputValue() === 's1');
  chkF('...y la Cotización también', await page.locator('#opCotizacion').inputValue() === 'q1');
  chkF('...y el contacto precargado', await page.locator('#opContactoNombre').inputValue() === 'Laura Gómez');
  await page.selectOption('#opCliente', '');
  await page.waitForTimeout(100);
  chkF('Quitar el cliente limpia el Sitio (ya no tiene a quién pertenecer)', (await page.locator('#opSitio').innerText()).includes('Elige un cliente'));
  await page.evaluate(() => cerrarModal());

  // --------- 15) Estancadas, filtro de estado y Reporte de ventas ---------
  // (12-oct-2026, mismo día, pedido de Victor: "necesito que pueda ser un
  // CRM completo... a ese alcance se requiere"). "Estancada" se calcula de
  // la última actividad real (o la fecha de creación si no tiene ninguna)
  // — ganada/perdida NUNCA cuentan, ya no están en movimiento.
  await page.evaluate(() => {
    datos.oportunidades = [
      normalizarOportunidad({ id:'vieja', titulo:'Vieja sin tocar', etapa:'propuesta', valorEstimado:10000, probabilidad:50, fechaCreacion:'2020-01-01', fechaCierreEstimada: hoyISO() }),
      normalizarOportunidad({ id:'fresca', titulo:'Fresca', etapa:'propuesta', valorEstimado:5000, probabilidad:50, fechaCreacion: hoyISO(), fechaCierreEstimada: hoyISO() }),
      normalizarOportunidad({ id:'perdida1', titulo:'Perdida 1', etapa:'perdida', valorEstimado:1000, motivoPerdida:'Precio muy alto' }),
      normalizarOportunidad({ id:'perdida2', titulo:'Perdida 2', etapa:'perdida', valorEstimado:1000, motivoPerdida:'precio muy alto' }),
      normalizarOportunidad({ id:'perdida3', titulo:'Perdida 3', etapa:'perdida', valorEstimado:1000, motivoPerdida:'Eligieron otro proveedor' })
    ];
    render();
  });
  await page.waitForTimeout(200);
  chkF('Una oportunidad sin actividad reciente se marca estancada', await page.evaluate(() => oportunidadEstancada(oportunidadPorId('vieja'))));
  chkF('Una recién creada NO se marca estancada', !(await page.evaluate(() => oportunidadEstancada(oportunidadPorId('fresca')))));
  chkF('Perdida nunca cuenta como estancada, aunque lleve años sin tocarse', !(await page.evaluate(() => oportunidadEstancada(oportunidadPorId('perdida1')))));
  chkF('El KPI "Estancadas" refleja la cuenta', (await page.locator('.kpis').textContent()).includes('Estancadas'));
  chkF('La tarjeta de la estancada trae su insignia', (await page.locator('[data-oportunidad="vieja"]').textContent()).includes('Estancada'));
  chkF('La tarjeta fresca NO trae esa insignia', !(await page.locator('[data-oportunidad="fresca"]').textContent()).includes('Estancada'));

  await page.selectOption('#filtroEstadoCRM', 'estancadas');
  await page.waitForTimeout(150);
  chkF('El filtro "Solo estancadas" deja en el tablero solo a la vieja', await page.locator('.tarjeta-crm').count() === 1 && await page.locator('[data-oportunidad="vieja"]').count() === 1);
  await page.selectOption('#filtroEstadoCRM', '');
  await page.waitForTimeout(150);

  await page.click('[data-accion="reporte-crm"]');
  await page.waitForTimeout(150);
  const modalReporte = await page.locator('#modalCuerpo').innerText();
  chkF('El Reporte de ventas muestra el pronóstico', modalReporte.includes('Pronóstico de ventas'));
  chkF('...y los motivos de pérdida', modalReporte.includes('Motivos de pérdida'));
  chkF('Agrupa motivos de pérdida iguales SIN importar mayúsculas (2 veces "Precio muy alto")', /Precio muy alto[\s\S]{0,15}2/.test(modalReporte));
  chkF('Un motivo distinto se lista aparte', modalReporte.includes('Eligieron otro proveedor'));
  chkF('El pronóstico de este mes suma las 2 oportunidades abiertas ($15,000 bruto)', modalReporte.includes('$15,000'));
  await page.evaluate(() => cerrarModal());

  // Viewer también puede ver el reporte (es información, no edición)
  await page.evaluate(() => { sesion.rol='viewer'; render(); });
  await page.waitForTimeout(150);
  chkF('Viewer también ve el botón "Reporte de ventas"', await page.locator('[data-accion="reporte-crm"]').count() === 1);
  await page.evaluate(() => { sesion.rol='owner'; render(); });
  await page.waitForTimeout(150);

  chkF('No hubo errores de página en todo el escenario', errores.length === 0);
  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
