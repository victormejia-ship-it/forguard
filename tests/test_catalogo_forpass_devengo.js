/* Catálogo de Forpass + devengo del costo en 6 meses (13-oct-2026, pedido
   de Victor con una captura de Excel de costos de kiosco): "en la parte
   del forpass necesito tambien definir el costo de cada uno de los
   forpass... necesito que pueda ingresar diferentes tipos de forpass con
   diferentes costos, en donde tengo que definir cada costo de forpass" +
   "Añadiendo que el costo del forpass si es cargado a un cliente necesito
   que ese costo se devengue en 6 meses".

   La captura mostraba dos totales resaltados en amarillo: "Total reemplazo
   solo equipo" ($29,693) y "Total con mueble" ($42,493) — de ahí que cada
   "tipo de Forpass" del catálogo sea un nombre + UN costo total, no el
   desglose de componentes (DSK/IMP/LDT/...) que Victor usó para llegar a
   esos totales; ese desglose es su cuenta propia, no algo que haya pedido
   capturar renglón por renglón dentro de la app.

   Administración → "Catálogo de Forpass" (bloqueCatalogoForpass) es el
   mismo molde de documento único que Segmentos/Permisos por módulo: lo
   administra un Admin/Owner, datos.catalogoForpass vive en
   /catalogoForpass/lista. modalSitio() ofrece un select "Tipo de Forpass"
   que SOLO sirve para autollenar el costo una vez — "copiar, no
   referenciar": el número se copia a forpassCosto y queda libre de editar;
   si el costo del tipo cambia después en el catálogo, los sitios que ya lo
   usaron no se mueven solos (mismo principio que ya usa vendedor/encargado
   en otras partes de la app).

   Devengo en 6 meses: antes, montosPorMesForpassCosto()/detalleForpassCosto()
   reconocían TODO forpassCosto de un jalón en el mes de fechaInicio. Ahora
   devengoCostoForpass(s) reparte ese costo en 6 meses consecutivos desde
   fechaInicio usando repartirEnteros() (garantiza que los 6 montos sumen
   SIEMPRE exactamente forpassCosto, con el residuo cayendo en el sexto
   mes) — y como Resultados siempre se recalcula en vivo, este cambio
   también mueve cómo se ve el costo de sitios que YA EXISTÍAN antes de
   este cambio, sin que su forpassCosto guardado cambie en nada. */
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
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'Cliente Prueba' })];
  });

  // --------- 1) devengoCostoForpass(): siempre 6 meses, suma exacta ---------
  const math = await page.evaluate(() => {
    const d = devengoCostoForpass({ forpassCosto: 29693, fechaInicio: '2026-01-01' });
    return { len: d.length, suma: d.reduce((a,p)=>a+p.monto,0), fechas: d.map(p=>p.fecha), montos: d.map(p=>p.monto) };
  });
  chkF('devengoCostoForpass() reparte en exactamente 6 meses', math.len === 6);
  chkF('La suma de los 6 montos es SIEMPRE exactamente forpassCosto (sin perder centavos al redondear)', math.suma === 29693);
  chkF('Los 6 meses son consecutivos a partir de fechaInicio', JSON.stringify(math.fechas) === JSON.stringify(['2026-01-01','2026-02-01','2026-03-01','2026-04-01','2026-05-01','2026-06-01']));
  chkF('El residuo del reparto cae en el SEXTO mes (mismo criterio que repartirEnteros en todo el resto de la app)', math.montos[5] === 4953 && math.montos.slice(0,5).every(m => m === 4948));

  const sinCosto = await page.evaluate(() => devengoCostoForpass({ forpassCosto: 0, fechaInicio: '2026-01-01' }));
  chkF('Sin forpassCosto, el devengo no genera ningún periodo', sinCosto.length === 0);

  // --------- 2) Catálogo de Forpass: alta/edición/baja desde Administración ---------
  await page.evaluate(() => { estado.vista = 'admin'; estado.clienteId = null; render(); });
  await page.waitForTimeout(200);
  chkF('El bloque "Catálogo de Forpass" aparece en Administración', (await page.locator('text=Catálogo de Forpass').count()) >= 1);
  chkF('Arranca vacío', (await page.locator('text=Todavía no hay ningún tipo de Forpass').count()) === 1);

  await page.click('[data-accion="nuevo-tipo-forpass"]');
  await page.waitForTimeout(150);
  await page.fill('#tfNombre', 'Forpass solo equipo');
  await page.fill('#tfCosto', '29693');
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);
  let catalogo = await page.evaluate(() => datos.catalogoForpass);
  chkF('Se agrega el primer tipo con su costo', catalogo.length === 1 && catalogo[0].nombre === 'Forpass solo equipo' && catalogo[0].costo === 29693);

  await page.click('[data-accion="nuevo-tipo-forpass"]');
  await page.waitForTimeout(150);
  await page.fill('#tfNombre', 'Forpass con mueble');
  await page.fill('#tfCosto', '42493');
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);
  chkF('Se pueden capturar varios tipos con costos distintos', (await page.evaluate(() => datos.catalogoForpass.length)) === 2);

  // Editar: cambia el costo de un tipo ya guardado
  const id1 = await page.evaluate(() => datos.catalogoForpass.find(t => t.nombre === 'Forpass solo equipo').id);
  await page.click('[data-editar-tipo-forpass="' + id1 + '"]');
  await page.waitForTimeout(150);
  await page.fill('#tfCosto', '31000');
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);
  chkF('Editar un tipo cambia su costo', (await page.evaluate((id)=> datos.catalogoForpass.find(t=>t.id===id).costo, id1)) === 31000);

  // Validación: sin nombre o sin costo, no deja guardar
  await page.click('[data-accion="nuevo-tipo-forpass"]');
  await page.waitForTimeout(150);
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(100);
  chkF('Sin nombre no se guarda (el modal sigue abierto)', await page.evaluate(() => $('telon').classList.contains('abierto')));
  await page.evaluate(() => cerrarModal());

  // Quitar: con confirmación, no afecta sitios ya guardados (ver más abajo)
  const id2 = await page.evaluate(() => datos.catalogoForpass.find(t => t.nombre === 'Forpass con mueble').id);

  // --------- 3) modalSitio(): el select autollena el costo — "copiar, no referenciar" ---------
  await page.evaluate(() => { modalSitio('c1', null); });
  await page.waitForTimeout(150);
  chkF('El select "Tipo de Forpass" aparece cuando hay catálogo', (await page.locator('#sTipoForpass').count()) === 1);
  await page.selectOption('#sTipoForpass', id2);
  await page.waitForTimeout(100);
  chkF('Elegir un tipo autollena el costo ($42,493)', (await page.inputValue('#sForpassCosto')).includes('42,493'));
  // Sigue siendo un campo libre: se puede cambiar después de autollenado
  await page.fill('#sForpassCosto', '40000');
  chkF('El costo autollenado se puede seguir editando libre, sin quedar atado al select', (await page.inputValue('#sForpassCosto')) === '40,000');

  await page.fill('#sNombre', 'Sitio Catálogo');
  await page.fill('#sModulos', '1');
  await page.fill('#sMensualidad', '1500');
  await page.fill('#sInicio', '2026-01-01');
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);
  const sitioGuardado = await page.evaluate(() => datos.sitios.find(s => s.nombre === 'Sitio Catálogo'));
  chkF('Se guarda el costo EDITADO (40,000), no el que traía el tipo elegido (42,493)', sitioGuardado.forpassCosto === 40000);

  // Cambiar el costo del tipo en el catálogo NO mueve retroactivamente al sitio ya guardado
  await page.evaluate((id) => { datos.catalogoForpass.find(t => t.id === id).costo = 99999; }, id2);
  chkF('Cambiar el costo de un tipo en el catálogo no reescribe sitios ya guardados con ese tipo', (await page.evaluate(() => datos.sitios.find(s => s.nombre === 'Sitio Catálogo').forpassCosto)) === 40000);

  // Quitar el tipo del catálogo tampoco afecta al sitio que ya lo usó
  await page.evaluate(() => { estado.vista = 'admin'; estado.clienteId = null; render(); });
  await page.waitForTimeout(150);
  await page.click('[data-quitar-tipo-forpass="' + id2 + '"]');
  await page.waitForTimeout(150);
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(150);
  chkF('Quitar un tipo del catálogo no borra ni cambia el costo de los sitios que ya lo usaron', (await page.evaluate(() => datos.sitios.find(s => s.nombre === 'Sitio Catálogo').forpassCosto)) === 40000);
  chkF('El tipo sí desaparece del catálogo', (await page.evaluate(() => datos.catalogoForpass.length)) === 1);

  // Un sitio nuevo, sin elegir ningún tipo, sigue pudiendo capturar el costo a mano
  await page.evaluate(() => { modalSitio('c1', null); });
  await page.waitForTimeout(150);
  await page.fill('#sNombre', 'Sitio Manual');
  await page.fill('#sModulos', '1');
  await page.fill('#sMensualidad', '1000');
  await page.fill('#sForpassCosto', '8000');
  await page.fill('#sInicio', '2026-03-01');
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);
  chkF('Sin elegir tipo, el costo se sigue pudiendo capturar directo a mano', (await page.evaluate(() => datos.sitios.find(s => s.nombre === 'Sitio Manual').forpassCosto)) === 8000);

  // --------- 4) Resultados: el costo se reparte en 6 meses, incluso cruzando de año ---------
  const resultados = await page.evaluate(() => {
    const s = datos.sitios.find(x => x.nombre === 'Sitio Catálogo');
    s.fechaInicio = '2025-11-01'; s.forpassCosto = 6000; s.estado = 'activo'; s.modulos = 1;
    datos.sitios.forEach(x => { if(x.nombre !== 'Sitio Catálogo') x.modulos = 0; }); // aísla el caso
    return {
      r2025: montosPorMesForpassCosto(2025),
      r2026: montosPorMesForpassCosto(2026),
      detalleNov: detalleForpassCosto(2025, 10),
      detalleMayo2026: detalleForpassCosto(2026, 4)
    };
  });
  chkF('Noviembre y diciembre 2025 reciben su parte del devengo (antes se habría puesto TODO en noviembre)', resultados.r2025[10] > 0 && resultados.r2025[11] > 0 && resultados.r2025[10] < 6000);
  chkF('Enero a abril 2026 reciben el resto (el devengo cruza el año calendario)', resultados.r2026[0] > 0 && resultados.r2026[3] > 0);
  chkF('Mayo 2026 ya no recibe nada (el devengo ya terminó en abril, 6 meses desde noviembre)', resultados.r2026[4] === 0);
  const sumaTotal = resultados.r2025.reduce((a,b)=>a+b,0) + resultados.r2026.reduce((a,b)=>a+b,0);
  chkF('La suma de los 12 meses entre los dos años sigue siendo EXACTAMENTE forpassCosto (6000)', sumaTotal === 6000);
  chkF('detalleForpassCosto expone el sitio correcto en el mes correcto', resultados.detalleNov.length === 1 && resultados.detalleNov[0].etiqueta.includes('Sitio Catálogo'));
  chkF('...y nada fuera de la ventana de 6 meses', resultados.detalleMayo2026.length === 0);

  // --------- 5) Solo un Admin/Owner puede tocar el catálogo ---------
  await page.evaluate(() => { sesion.rol = 'tecnico'; });
  await page.evaluate(() => { estado.vista = 'admin'; render(); });
  await page.waitForTimeout(150);
  // Un Técnico ni siquiera entra al panel de Administración (exigirPermiso/menú), pero
  // el candado real es a nivel de función: modalTipoForpass() se niega sin ser Admin.
  const bloqueado = await page.evaluate(() => {
    let avisoTexto = null;
    const original = window.aviso;
    window.aviso = (t)=>{ avisoTexto = t; };
    modalTipoForpass(null);
    const siguioAbierto = $('telon').classList.contains('abierto');
    window.aviso = original;
    return { avisoTexto, siguioAbierto };
  });
  chkF('Un rol sin permiso de Admin no puede abrir el alta de un tipo de Forpass', bloqueado.avisoTexto && bloqueado.avisoTexto.includes('Admin') && !bloqueado.siguioAbierto);

  chkF('No hubo errores de página en todo el escenario', errores.length === 0);
  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
