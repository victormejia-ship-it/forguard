/* Sitios: el alta/edición/eliminación se mueve a Clientes, Forpass deja de
   poder borrar el registro (30-sep-2026, pedido de Victor):

   "que la parte que rige el alta de un cliente sea precisamente el modulo
   de clientes y no de forpass, desde el modulo de cliente tengo que hacer
   todo para dar de alta un sitio y si quiero activar un forpass desde ahi
   lo puedo activar y de ahi se migra a modulo de forpass

   actualmente si elimino un sitio de forpass se elimina el registro y
   requiero que no sea así"

   Antes de este cambio, "Agregar sitio"/"Editar sitio"/"Eliminar sitio"
   vivían en el módulo Forpass (vistaCliente()/tarjetaSitio()/tablaSitios()),
   y el botón de basura de un sitio en Forpass borraba el registro
   completo — el mismo patrón que causó el incidente real de "Eliminar
   cliente" (ver test_eliminar_cliente_confirmacion.js), pero aplicado a
   sitios en vez de clientes.

   Ahora: alta/edición/eliminación de un sitio viven SOLO en Clientes
   (vistaResumenCliente(), bloque "Sitios"), con el mismo modalSitio() de
   siempre (que ya incluye la sección de Forpass para activarlo ahí mismo).
   En Forpass, el botón de basura se reemplaza por "Quitar Forpass"
   (data-quitar-forpass): apaga la configuración de Forpass del sitio
   (módulos, tipo de cargo, facturación, mensualidad, costo, pagos) pero el
   sitio EN SÍ sigue existiendo, con sus pólizas/cotizaciones/reportes
   intactos — no hay "Eliminar sitio" alcanzable desde Forpass.

   Segunda vuelta el mismo día (Victor, tras probar en el navegador): la
   LISTA de clientes de Forpass (vistaClientes(), la pantalla "Clientes" que
   se ve al entrar al módulo Forpass) todavía traía "Agregar cliente" en el
   encabezado y, en cada tarjeta, el lápiz de "Editar cliente" y la basura
   de "Eliminar cliente" — exactamente las mismas acciones sobre la
   IDENTIDAD del cliente que ya se habían quitado del módulo Forpass en
   todo lo demás. "el modulo que debe regir es el de cliente, forpass es un
   anexo": esos tres botones se quitan de aquí también — la tarjeta de
   Forpass queda solo para consultar salud de Forpass y saltar a "Ver
   sitios", y el estado vacío ("Todavía no hay clientes") manda a Clientes
   en vez de ofrecer un alta que ya no vive aquí.

   Al quitar la basura de "Eliminar cliente" de la lista de Forpass salió a
   la luz que NUNCA había existido en ningún otro lado de Clientes —
   vistaResumenCliente() (la ficha 360° de un cliente) solo tenía "Editar
   cliente" y "Fusionar con otro cliente"—, así que el botón se quedó sin
   ningún lugar en la UI desde donde llamarlo (el manejador seguía
   completo: confirmarEscribiendoNombre(), el aviso de huérfanos, todo).
   Se agregó ahí mismo, junto a Fusionar (sección 0c, abajo). */
const { chromium } = require('playwright');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
const chk = (label, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' - ' + label); return cond; };
let fallas = 0;
const chkF = (label, cond) => { if(!chk(label, cond)) fallas++; };

(async () => {
  const browser = await chromium.launch(OPCIONES_NAVEGADOR);
  const page = await browser.newPage();
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
    datos.clientes = [
      normalizarCliente({ id:'c1', nombre:'NGK' }),
      normalizarCliente({ id:'c2', nombre:'SIN-SITIOS' })
    ];
    datos.sitios = [ normalizarSitio({ id:'s1', clienteId:'c1', nombre:'Planta Norte', modulos:3, mensualidad:1500, fechaInicio:hoyISO(), meses:12, estado:'activo' }) ];
    datos.polizas = [ normalizarPoliza({ id:'p1', clienteId:'c1', sitioId:'s1', estatus:'activa' }) ];
    datos.cotizaciones = [ normalizarCotizacion({ id:'q1', clienteId:'c1', sitioId:'s1', folio:'COT-1' }) ];
  });

  // --------- 0) La LISTA de clientes de Forpass ya no trae alta ni edición/eliminación del cliente ---------
  await page.evaluate(() => { irAModulo('forpass'); render(); });
  await page.waitForTimeout(150);
  chkF('El encabezado de la lista de Forpass ya NO trae "Agregar cliente"', await page.locator('[data-accion="nuevo-cliente"]').count() === 0);
  chkF('La tarjeta de NGK en Forpass ya NO trae el lápiz de "Editar cliente"', await page.locator('[data-editar-cliente="c1"]').count() === 0);
  chkF('La tarjeta de NGK en Forpass ya NO trae la basura de "Eliminar cliente"', await page.locator('[data-borrar-cliente="c1"]').count() === 0);
  chkF('La tarjeta de NGK en Forpass sí conserva "Ver sitios →"', await page.locator('[data-ver="c1"]').count() === 1);

  // --------- 0b) El estado vacío de la lista de Forpass manda a Clientes, no ofrece alta aquí ---------
  await page.evaluate(() => {
    window.__clientesGuardados = datos.clientes; window.__sitiosGuardados = datos.sitios;
    datos.clientes = []; datos.sitios = [];
    render();
  });
  await page.waitForTimeout(150);
  chkF('Sin ningún cliente, Forpass ya no ofrece "Agregar cliente" en su estado vacío', await page.locator('[data-accion="nuevo-cliente"]').count() === 0);
  chkF('En cambio ofrece un botón para ir a Clientes', await page.locator('[data-accion="ir-modulo-clientes"]').count() === 1);
  await page.click('[data-accion="ir-modulo-clientes"]');
  await page.waitForTimeout(150);
  chkF('"Ir a Clientes" desde el estado vacío de Forpass sí cambia al módulo clientes', await page.evaluate(() => estado.modulo === 'clientes'));
  await page.evaluate(() => {
    datos.clientes = window.__clientesGuardados; datos.sitios = window.__sitiosGuardados;
  });

  // --------- 0c) "Editar cliente"/"Eliminar cliente" sí siguen alcanzables, pero desde Clientes ---------
  await page.evaluate(() => { irAModulo('clientes'); entrarResumenCliente('c1'); render(); });
  await page.waitForTimeout(150);
  chkF('La ficha 360° de Clientes trae "Editar cliente"', await page.locator('[data-editar-cliente="c1"]').count() === 1);
  chkF('La ficha 360° de Clientes trae "Eliminar cliente" para Admin/Owner', await page.locator('[data-borrar-cliente="c1"]').count() === 1);

  // --------- 1) "Agregar sitio" es alcanzable desde Clientes (resumen 360°) ---------
  chkF('El bloque "Sitios" del resumen 360° trae "Agregar sitio"', await page.locator('[data-accion="nuevo-sitio"]').count() === 1);
  chkF('También trae "Editar" para el sitio existente', await page.locator('[data-editar-sitio="s1"]').count() === 1);
  chkF('También trae "Eliminar sitio" (destructivo, de verdad) para Admin/Owner', await page.locator('[data-borrar-sitio="s1"]').count() === 1);
  chkF('El renglón del sitio ya NO trae "Quitar Forpass" (eso es solo de Forpass)', await page.locator('[data-quitar-forpass="s1"]').count() === 0);

  await page.click('[data-accion="nuevo-sitio"]');
  await page.waitForTimeout(150);
  chkF('"Agregar sitio" abre el modalSitio de siempre (trae el campo Nombre)', await page.locator('#sNombre').count() === 1);
  await page.click('[data-modal="cancelar"]');
  await page.waitForTimeout(100);

  // --------- 2) Editar un sitio desde Clientes y regresar a resumen-cliente (no a Forpass) ---------
  await page.click('[data-editar-sitio="s1"]');
  await page.waitForTimeout(150);
  await page.fill('#sNombre', 'Planta Norte Editada');
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(150);
  const trasEditar = await page.evaluate(() => ({
    nombre: datos.sitios.find(s => s.id === 's1').nombre,
    modulo: estado.modulo, vista: estado.vista
  }));
  chkF('El nombre del sitio sí se actualizó', trasEditar.nombre === 'Planta Norte Editada');
  chkF('Tras guardar desde Clientes, se queda en el módulo clientes (no salta a Forpass)', trasEditar.modulo === 'clientes');
  chkF('Tras guardar desde Clientes, se queda en resumen-cliente', trasEditar.vista === 'resumen-cliente');

  // --------- 3) "Ver cobranza en Forpass" navega a Forpass; ahí YA NO hay Agregar/Editar/Eliminar sitio ---------
  await page.click('[data-accion="ir-cliente-forpass"]');
  await page.waitForTimeout(150);
  chkF('"Ver cobranza en Forpass" sí cambia al módulo forpass', await page.evaluate(() => estado.modulo === 'forpass'));
  chkF('En Forpass, ya no existe ningún botón "Agregar sitio"', await page.locator('[data-accion="nuevo-sitio"]').count() === 0);
  chkF('En Forpass, ya no existe "Editar sitio" para este sitio', await page.locator('[data-editar-sitio="s1"]').count() === 0);
  chkF('En Forpass, ya no existe "Eliminar sitio" (destructivo) para este sitio', await page.locator('[data-borrar-sitio="s1"]').count() === 0);
  chkF('En Forpass, en cambio sí aparece "Quitar Forpass" para este sitio', await page.locator('[data-quitar-forpass="s1"]').count() === 1);

  // --------- 4) "Quitar Forpass" NO elimina el sitio, ni sus pólizas/cotizaciones ---------
  await page.click('[data-quitar-forpass="s1"]');
  await page.waitForTimeout(150);
  const textoQuitar = await page.locator('#modalCuerpo').textContent();
  chkF('La confirmación de "Quitar Forpass" avisa que el sitio NO se elimina', /NO se elimina/.test(textoQuitar));
  chkF('"Quitar Forpass" usa la confirmación normal (sin campo de escribir el nombre)', await page.locator('#confirmaEscritoInput').count() === 0);
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(150);
  const trasQuitar = await page.evaluate(() => {
    const s = datos.sitios.find(x => x.id === 's1');
    return {
      sitioExiste: !!s, modulos: s && s.modulos, mensualidad: s && s.mensualidad,
      polizaSigueViva: datos.polizas.some(p => p.id === 'p1'),
      cotizacionSigueViva: datos.cotizaciones.some(q => q.id === 'q1')
    };
  });
  chkF('El sitio SIGUE existiendo tras "Quitar Forpass"', trasQuitar.sitioExiste === true);
  chkF('Sus módulos Forpass quedaron en 0', trasQuitar.modulos === 0);
  chkF('Su mensualidad quedó en 0', trasQuitar.mensualidad === 0);
  chkF('Su póliza sigue existiendo, intacta', trasQuitar.polizaSigueViva === true);
  chkF('Su cotización sigue existiendo, intacta', trasQuitar.cotizacionSigueViva === true);

  // --------- 5) Un cliente sin sitios en Forpass: la vista vacía manda de vuelta a Clientes ---------
  await page.evaluate(() => { irAModulo('forpass'); entrarCliente('c2'); render(); });
  await page.waitForTimeout(150);
  chkF('El estado vacío de Forpass ya no ofrece "Agregar sitio" aquí mismo', await page.locator('[data-accion="nuevo-sitio"]').count() === 0);
  chkF('En cambio ofrece un botón para ir a la ficha del cliente en Clientes', await page.locator('[data-accion="ir-cliente-en-clientes"]').count() === 1);
  await page.click('[data-accion="ir-cliente-en-clientes"]');
  await page.waitForTimeout(150);
  const trasPuente = await page.evaluate(() => ({ modulo: estado.modulo, vista: estado.vista, clienteId: estado.clienteId }));
  chkF('El puente sí cambia al módulo clientes', trasPuente.modulo === 'clientes');
  chkF('El puente sí abre el resumen 360° del cliente correcto', trasPuente.vista === 'resumen-cliente' && trasPuente.clienteId === 'c2');

  // --------- 6) Eliminar el sitio por completo solo es posible desde Clientes, con nombre exacto ---------
  await page.evaluate(() => { irAModulo('clientes'); entrarResumenCliente('c1'); render(); });
  await page.waitForTimeout(150);
  await page.click('[data-borrar-sitio="s1"]');
  await page.waitForTimeout(150);
  chkF('"Eliminar sitio" desde Clientes sigue pidiendo el nombre exacto', await page.locator('#confirmaEscritoInput').count() === 1);
  await page.fill('#confirmaEscritoInput', 'Planta Norte Editada');
  await page.waitForTimeout(50);
  await page.click('#btnConfirmaEscrito');
  await page.waitForTimeout(150);
  const trasBorrarDeVerdad = await page.evaluate(() => datos.sitios.some(s => s.id === 's1'));
  chkF('Con el nombre exacto confirmado desde Clientes, el sitio sí se elimina de verdad', trasBorrarDeVerdad === false);

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
