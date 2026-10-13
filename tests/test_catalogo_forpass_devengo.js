/* Catálogo de Forpass (desglose de componentes) + devengo del costo en 6
   meses (13-oct-2026, pedido de Victor con una captura de Excel de costos
   de kiosco): "en la parte del forpass necesito tambien definir el costo
   de cada uno de los forpass, necesito que añadas esta seccion en ese
   modulo, necesito que pueda ingresar diferentes tipos de forpass con
   diferentes costos, en donde tengo que definir cada costo de forpass" +
   "Añadiendo que el costo del forpass si es cargado a un cliente necesito
   que ese costo se devengue en 6 meses". AMPLIACIÓN, mismo día viendo el
   formulario ya construido con un solo campo de costo: "que en el catalogo
   pueda ser el desglose del equipo, cada concepto con cada precio, para
   poder determinar ese costo".

   La captura real de Victor traía justo eso: DSK Desktop $9,999, IMP
   Impresora $3,499, LDT Lectora de Tarjetas $3,599, LQR Lector de Qr
   $2,899, MTR Monitor $5,599, CAM Camara $1,599, UPS Bateria UPS $2,499,
   sumando al total resaltado "Total reemplazo solo equipo" ($29,693).

   Cada "tipo de Forpass" del catálogo (datos.catalogoForpass, documento
   único con el mismo molde que /segmentos y /permisosModulos, administrado
   desde Administración → "Catálogo de Forpass", solo Owner/Admin) trae un
   `componentes` ([{id, concepto, costo}], lista de trabajo en memoria en
   modalTipoForpass() con el mismo patrón de modalKioscosSitio: agregar/
   quitar renglones con Guardar/Cancelar de un solo golpe) y un `costo` que
   SIEMPRE se calcula como la suma de esos componentes — nunca se captura
   aparte, para que nunca quede desincronizado de su propio desglose (ver
   normalizarTipoForpass).

   En modalSitio(), el select "Tipo de Forpass" SOLO sirve para autollenar
   el costo total una vez — "copiar, no referenciar": el número se copia a
   forpassCosto y queda libre de editar; si el costo de ese tipo cambia
   después en el catálogo (porque se edita su desglose), los sitios que ya
   lo usaron NO se mueven solos (mismo principio que ya usa vendedor/
   encargado en otras partes de la app).

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

  // Agrega un renglón de componente en el modal de tipo de Forpass, ya abierto.
  async function agregarComponente(concepto, costo){
    await page.click('#btnAgregarComponente');
    await page.waitForTimeout(50);
    const idx = (await page.locator('[data-tfc="concepto"]').count()) - 1;
    await page.fill('[data-tfc="concepto"][data-i="' + idx + '"]', concepto);
    await page.fill('[data-tfc="costo"][data-i="' + idx + '"]', String(costo));
  }

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

  // --------- 2) Catálogo de Forpass: el costo se arma de un desglose de componentes ---------
  await page.evaluate(() => { estado.vista = 'admin'; estado.clienteId = null; render(); });
  await page.waitForTimeout(200);
  chkF('El bloque "Catálogo de Forpass" aparece en Administración', (await page.locator('text=Catálogo de Forpass').count()) >= 1);
  chkF('Arranca vacío', (await page.locator('text=Todavía no hay ningún tipo de Forpass').count()) === 1);

  // Captura real de Victor: 7 componentes sumando al "Total reemplazo solo equipo"
  await page.click('[data-accion="nuevo-tipo-forpass"]');
  await page.waitForTimeout(150);
  await page.fill('#tfNombre', 'Forpass solo equipo');
  chkF('Sin ningún componente, no hay campo de costo directo que capturar (el total se calcula solo)', (await page.locator('#tfCosto').count()) === 0);
  for(const [concepto, costo] of [
    ['Desktop', 9999], ['Impresora', 3499], ['Lectora de Tarjetas', 3599],
    ['Lector de Qr', 2899], ['Monitor', 5599], ['Camara', 1599], ['Bateria UPS', 2499]
  ]) await agregarComponente(concepto, costo);
  await page.waitForTimeout(100);
  const totalEnVivo = await page.locator('#tfTotalFila').innerText();
  chkF('El total en vivo refleja la suma de los 7 conceptos del Excel real ($29,693)', totalEnVivo.includes('29,693'));
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);

  const tipo1 = await page.evaluate(() => datos.catalogoForpass[0]);
  chkF('Se guardan los 7 componentes capturados', tipo1.componentes.length === 7);
  chkF('El costo total guardado es la suma EXACTA de los componentes ($29,693, igual que el Excel real)', tipo1.costo === 29693);
  chkF('Cada componente conserva su concepto y costo reales', tipo1.componentes[0].concepto === 'Desktop' && tipo1.componentes[0].costo === 9999);

  // Segundo tipo, más simple: un solo concepto ("Forpass con mueble")
  await page.click('[data-accion="nuevo-tipo-forpass"]');
  await page.waitForTimeout(150);
  await page.fill('#tfNombre', 'Forpass con mueble');
  await agregarComponente('Equipo + mueble', 42493);
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);
  chkF('Se pueden capturar varios tipos, cada uno con su propio desglose', (await page.evaluate(() => datos.catalogoForpass.length)) === 2);

  // Editar: quitar un componente recalcula el total en vivo y al guardar
  const id1 = tipo1.id;
  await page.click('[data-editar-tipo-forpass="' + id1 + '"]');
  await page.waitForTimeout(150);
  await page.click('[data-quitar-componente="6"]'); // quita "Bateria UPS" ($2,499)
  await page.waitForTimeout(100);
  const totalTrasQuitar = await page.locator('#tfTotalFila').innerText();
  chkF('Quitar un componente recalcula el total en vivo (29,693 − 2,499 = 27,194)', totalTrasQuitar.includes('27,194'));
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);
  const tipo1Editado = await page.evaluate((id)=> datos.catalogoForpass.find(t=>t.id===id), id1);
  chkF('El costo guardado tras editar refleja la nueva suma (sin el componente quitado)', tipo1Editado.costo === 27194 && tipo1Editado.componentes.length === 6);

  // Validación: sin nombre, o sin ningún componente, no deja guardar
  await page.click('[data-accion="nuevo-tipo-forpass"]');
  await page.waitForTimeout(150);
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(100);
  chkF('Sin nombre no se guarda (el modal sigue abierto)', await page.evaluate(() => $('telon').classList.contains('abierto')));
  await page.fill('#tfNombre', 'Tipo sin desglose');
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(100);
  chkF('Sin ningún concepto capturado, tampoco se guarda', await page.evaluate(() => $('telon').classList.contains('abierto')));
  await page.evaluate(() => cerrarModal());

  // La tabla del catálogo muestra el conteo de conceptos de cada tipo
  const filaTabla = await page.locator('tr', { hasText: 'Forpass solo equipo' }).innerText();
  chkF('La tabla del catálogo muestra el conteo de conceptos', filaTabla.includes('6 conceptos'));

  // --------- 3) modalSitio(): el select autollena el costo — "copiar, no referenciar" ---------
  const id2 = await page.evaluate(() => datos.catalogoForpass.find(t => t.nombre === 'Forpass con mueble').id);
  await page.evaluate(() => { modalSitio('c1', null); });
  await page.waitForTimeout(150);
  chkF('El select "Tipo de Forpass" aparece cuando hay catálogo', (await page.locator('#sTipoForpass').count()) === 1);
  await page.selectOption('#sTipoForpass', id2);
  await page.waitForTimeout(100);
  chkF('Elegir un tipo autollena el costo con su total calculado ($42,493)', (await page.inputValue('#sForpassCosto')).includes('42,493'));
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

  // Cambiar el desglose del tipo en el catálogo NO mueve retroactivamente al sitio ya guardado
  await page.evaluate(() => { estado.vista = 'admin'; estado.clienteId = null; render(); });
  await page.waitForTimeout(150);
  await page.click('[data-editar-tipo-forpass="' + id2 + '"]');
  await page.waitForTimeout(150);
  await agregarComponente('Extra', 99999);
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);
  chkF('Cambiar el desglose de un tipo en el catálogo no reescribe sitios ya guardados con ese tipo', (await page.evaluate(() => datos.sitios.find(s => s.nombre === 'Sitio Catálogo').forpassCosto)) === 40000);

  // Quitar el tipo del catálogo tampoco afecta al sitio que ya lo usó
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
