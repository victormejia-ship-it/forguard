/* Rediseño del módulo RATIONAL (09-oct-2026, un día después de la primera
   entrega — ver test_certificacion_rational.js/test_catalogo_refacciones_
   rational.js). Victor vio el módulo recién creado (arrancaba directo en
   el checklist) y pidió dos cosas en el mismo mensaje:

   1) "no quiero que el check list sea lo principal sino que puedan ser
      otro tipo de vista" — la pantalla de arranque del módulo pasó a ser
      un TABLERO (vistaRational()) con tres tarjetas iguales: Checklist,
      Catálogo de refacciones y (nuevo) Equipos por cliente. Ninguna es
      "la principal" — mismo componente .tarjeta.tarjeta-clic que ya usa
      la lista de temas de Ayuda, reusado tal cual.

   2) "adicional en este modulo puedes colocar el listado de refacciones a
      la par del check list, donde tambien traigas todos los equipos por
      cliente los enlistes y nosotros podamos definir si son del cliente o
      propiedad de la empresa" — acotado por él mismo, antes de construir,
      a "solo aplicarían los hornos rational" (no cualquier marca — eso ya
      existe aparte en Catálogo de equipos, solo Owner). Reusa el mismo
      agregador de ese catálogo (catalogoEquiposAgregado(), que funde
      Activos+Levantamientos+Pólizas por número de serie) filtrado a
      esMarcaRational(). La propiedad (datos.propiedadEquiposRational) es
      un registro NUEVO Y SEPARADO —decisión de Victor, confirmada antes de
      construir— que no toca el Activo/hallazgo/partida de origen: una
      colección de verdad (un documento por equipo, como /visitas), llave
      = número de serie normalizado. Un equipo sin serie no se puede
      clasificar de forma confiable (dos hornos del mismo cliente sin
      serie son indistinguibles) y se enseña sin selector. */
const { chromium } = require('playwright');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
const chk = (label, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' - ' + label); return cond; };
let fallas = 0;
const chkF = (label, cond) => { if(!chk(label, cond)) fallas++; };

(async () => {
  const browser = await chromium.launch(OPCIONES_NAVEGADOR);
  const page = await browser.newPage({ viewport: { width: 1200, height: 1400 } });
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
    datos.clientes = [
      normalizarCliente({ id:'cA', nombre:'BORGWARNER' }),
      normalizarCliente({ id:'cB', nombre:'NGK' }),
      normalizarCliente({ id:'cC', nombre:'INOAC' })
    ];
    // Cliente A: un Activo Y un hallazgo de Levantamiento con la MISMA
    // serie — deben FUNDIRSE en un solo renglón (mismo criterio que
    // Catálogo de equipos: la serie es lo único que prueba que es la
    // misma unidad física).
    datos.activos = [normalizarActivo({
      id:'a1', tipo:'cliente', nombre:'Horno Rational', marca:'Rational', modelo:'iCombi Pro',
      serie:'SER-001', clienteId:'cA', sitioNombre:'Planta BorgWarner'
    })];
    datos.levantamientos = [normalizarLevantamiento({
      id:'l1', clienteId:'cA', sitioNombre:'Planta BorgWarner', fecha:'2026-09-01', realizoNombre:'Edgar',
      hallazgos: [
        { id:'h1', ubicacion:'Cocina', equipoNombre:'Horno Rational', marca:'Rational', modelo:'iCombi Pro', serie:'SER-001', hallazgo:'Revisión rutinaria', accion:'preventivo', prioridad:'media' }
      ]
    })];
    // Cliente B: una póliza con un renglón Rational (serie propia) y OTRO
    // renglón de otra marca (NO debe aparecer en la lista).
    datos.polizas = [normalizarPoliza({
      id:'p1', clienteId:'cB', folio:'POL-01', sitioNombre:'Planta NGK',
      estatus:'activa', facturacion:'anual', fechaInicio:'2024-01-01', fechaCotizacion:'2024-01-01',
      partidas: [
        { id:'x1', concepto:'Horno Rational', marca:'Rational', modelo:'CPC 101', serie:'SER-002', cantidad:1, precioUnitario:1000, frecuencia:3, mesesServicio:[9] },
        { id:'x2', concepto:'Refrigerador', marca:'True', modelo:'T-49', serie:'SER-999', cantidad:1, precioUnitario:1000, frecuencia:3, mesesServicio:[9] }
      ],
      cobros:[true]
    })];
    // Cliente C: un Activo Rational SIN serie capturada — debe aparecer en
    // la lista, pero sin selector de propiedad (no hay llave confiable).
    datos.activos.push(normalizarActivo({
      id:'a2', tipo:'cliente', nombre:'Horno Rational chico', marca:'Rational', modelo:'VCC 211',
      serie:'', clienteId:'cC', sitioNombre:'Planta INOAC'
    }));
    render();
  });
  await page.waitForTimeout(300);

  // --------- 1) El tablero del módulo: tres tarjetas, ninguna "principal" ---------
  await page.evaluate(() => irAModulo('rational'));
  await page.waitForTimeout(200);
  chkF('El módulo arranca en el tablero ("RATIONAL"), no en el checklist', (await page.locator('h2').first().textContent()).trim() === 'RATIONAL');
  chkF('Trae las tres tarjetas: checklist, refacciones y equipos', await page.locator('[data-accion="ver-checklist-rational"]').count() >= 1
    && await page.locator('[data-accion="ver-catalogo-refacciones-rational"]').count() >= 1
    && await page.locator('[data-accion="ver-equipos-rational"]').count() >= 1);
  const resumenTarjetaEquipos = await page.locator('[data-accion="ver-equipos-rational"] .t-sub').first().textContent();
  chkF('La tarjeta de equipos resume cuántos hay (3, los Rational — el True no cuenta)', resumenTarjetaEquipos.includes('3'));
  chkF('...y avisa que hay equipos sin propiedad definida todavía', resumenTarjetaEquipos.toLowerCase().includes('sin definir'));

  // --------- 2) Entrar a "Equipos RATIONAL": solo los Rational, serie fusiona duplicados ---------
  await page.click('[data-accion="ver-equipos-rational"]');
  await page.waitForTimeout(200);
  chkF('Entra a "Equipos RATIONAL por cliente"', await page.locator('h2:has-text("Equipos RATIONAL por cliente")').count() === 1);
  const filas = await page.locator('table.tabla tbody tr').count();
  chkF('Son 3 renglones: SER-001 fusionado (Activo+Levantamiento), SER-002, y el sin serie — el True NO cuenta', filas === 3);
  chkF('El equipo de otra marca (True, SER-999) no aparece por ningún lado', !(await page.locator('table.tabla').textContent()).includes('SER-999'));

  const textoTabla = await page.locator('table.tabla').textContent();
  chkF('Aparece el cliente BORGWARNER (Activo+Levantamiento fundidos)', textoTabla.includes('BORGWARNER'));
  chkF('Aparece el cliente NGK (de la póliza)', textoTabla.includes('NGK'));
  chkF('Aparece el cliente INOAC (el sin serie)', textoTabla.includes('INOAC'));

  // El renglón fusionado (SER-001) debe mostrar AMBOS orígenes.
  const filaFusionada = page.locator('table.tabla tbody tr', { hasText: 'SER-001' });
  chkF('SER-001 muestra que viene de un Activo', (await filaFusionada.textContent()).includes('Activo'));
  chkF('SER-001 TAMBIÉN muestra que viene de un Levantamiento (fusionado por serie)', (await filaFusionada.textContent()).includes('Levantamiento'));

  // --------- 3) El equipo SIN serie no trae selector, trae una pista ---------
  const filaSinSerie = page.locator('table.tabla tbody tr', { hasText: 'INOAC' });
  chkF('El equipo sin serie no trae <select> de propiedad', await filaSinSerie.locator('select').count() === 0);
  chkF('...en vez de eso, explica por qué ("Sin serie")', (await filaSinSerie.textContent()).includes('Sin serie'));

  // --------- 4) Definir la propiedad de SER-001 ("del cliente") y de SER-002 ("de Forguard") ---------
  await filaFusionada.locator('select').selectOption('cliente');
  await page.waitForTimeout(200);
  const filaFusionada2 = page.locator('table.tabla tbody tr', { hasText: 'SER-001' });
  chkF('SER-001 queda marcado "Del cliente"', await filaFusionada2.locator('select').inputValue() === 'cliente');

  const filaNGK = page.locator('table.tabla tbody tr', { hasText: 'NGK' });
  await filaNGK.locator('select').selectOption('forguard');
  await page.waitForTimeout(200);
  const filaNGK2 = page.locator('table.tabla tbody tr', { hasText: 'NGK' });
  chkF('SER-002 queda marcado "De Forguard"', await filaNGK2.locator('select').inputValue() === 'forguard');

  // --------- 5) Los KPIs de arriba reflejan lo recién definido ---------
  // .textContent() concatena label+valor sin espacio ("Del cliente1") — se
  // compara el bloque pegado tal cual, no con \b (no hay límite de palabra
  // entre una letra y un dígito que le sigue sin espacio).
  const textoKpis = await page.locator('.kpis').textContent();
  chkF('El KPI "Del cliente" ahora dice 1', textoKpis.includes('Del cliente1'));
  chkF('El KPI "De Forguard" ahora dice 1', textoKpis.includes('De Forguard1'));
  chkF('El KPI "Sin definir" ahora dice 0 (el sin serie no cuenta para esto)', textoKpis.includes('Sin definir0'));

  // --------- 6) Es de verdad datos.propiedadEquiposRational, no solo estado del DOM ---------
  const guardado = await page.evaluate(() => datos.propiedadEquiposRational.map(r => ({ serie: r.serie, propiedad: r.propiedad })));
  chkF('Quedaron 2 registros guardados (el sin serie nunca se guarda, no tiene llave)', guardado.length === 2);
  chkF('SER-001 → cliente, de verdad en datos.propiedadEquiposRational', guardado.some(r => r.serie === 'SER-001' && r.propiedad === 'cliente'));
  chkF('SER-002 → forguard, de verdad en datos.propiedadEquiposRational', guardado.some(r => r.serie === 'SER-002' && r.propiedad === 'forguard'));

  // --------- 7) Salir al tablero y volver: la clasificación sigue ahí (no era solo del DOM) ---------
  await page.click('[data-accion="ir-rational"]');
  await page.waitForTimeout(150);
  chkF('"Regresar a RATIONAL" sí regresa al tablero', (await page.locator('h2').first().textContent()).trim() === 'RATIONAL');
  const resumenTarjetaEquipos2 = await page.locator('[data-accion="ver-equipos-rational"] .t-sub').first().textContent();
  chkF('La tarjeta ya NO avisa "sin definir" (ya no quedan equipos sin clasificar)', !resumenTarjetaEquipos2.toLowerCase().includes('sin definir'));
  await page.click('[data-accion="ver-equipos-rational"]');
  await page.waitForTimeout(200);
  const filaFusionada3 = page.locator('table.tabla tbody tr', { hasText: 'SER-001' });
  chkF('Al volver a entrar, SER-001 SIGUE marcado "Del cliente" (persistido de verdad)', await filaFusionada3.locator('select').inputValue() === 'cliente');

  // --------- 8) Buscar por cliente filtra la lista ---------
  await page.fill('#buscaEquiposRational', 'NGK');
  await page.waitForTimeout(200);
  chkF('Buscar "NGK" deja solo ese renglón', await page.locator('table.tabla tbody tr').count() === 1);
  chkF('...y es de verdad el de NGK', (await page.locator('table.tabla tbody tr').first().textContent()).includes('NGK'));

  // --------- 9) Técnico ve el módulo (lectura) pero NO el selector de propiedad ---------
  // puedeEditar() no incluye a técnico (mismo criterio que Pólizas/
  // Cotizaciones para ese rol) — firestore.rules ya lo bloquearía del lado
  // del servidor, pero mostrarle un <select> que de todos modos fallaría al
  // guardar sería peor: se le enseña el texto ya definido, sin control.
  await page.evaluate(() => { sesion.rol='tecnico'; render(); });
  await page.waitForTimeout(150);
  chkF('Técnico sigue teniendo acceso al módulo RATIONAL', await page.evaluate(() => modulosPermitidos().includes('rational')));
  await page.evaluate(() => irAEquiposRational());
  await page.waitForTimeout(200);
  chkF('Técnico NO ve ningún <select> de propiedad (es de solo lectura para su rol)', await page.locator('table.tabla select').count() === 0);
  const filaSerUno = page.locator('table.tabla tbody tr', { hasText: 'SER-001' });
  chkF('...pero sí ve el texto de lo ya definido ("Del cliente")', (await filaSerUno.textContent()).includes('Del cliente'));

  chkF('No hubo errores de página en todo el escenario', errores.length === 0);
  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
