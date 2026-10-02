/* "Catálogo de equipos" (02-oct-2026, pedido de Victor): "de que manera
   podemos hacer como un catalogo de equipos con los que trabajamos, donde
   podamos ver la marca, modelo y numero de serie... podriamos tomar de
   todos los registros estos datos, y tambien de las polizas, o de que
   manera podríamos consitruirlo?" — tras platicarlo (ver conversación),
   arranca como la opción que Victor eligió explícitamente: "Arranca con
   la vista agregada de solo lectura".

   Marca/modelo/serie ya se capturaban en TRES lados distintos, sin que
   ninguno fuera un catálogo real: Activos (inventario formal, cliente/
   sitio), Levantamientos→hallazgos (lo documentado en una visita, mismos
   nombres de campo que Activos a propósito) y Pólizas→partidas (el equipo
   de cada renglón del contrato, con modelo/serie o `series[]` si hay más
   de una unidad). Cotizaciones queda fuera: sus renglones no guardan
   serie. catalogoEquiposAgregado() NO es un módulo nuevo de captura —solo
   junta lo que ya existe— y se restringe igual que Activos (solo Owner,
   ver modulosPermitidos()) porque incluye sus datos.

   Se agrupa por SERIE normalizada: la misma serie documentada en más de
   una fuente (p.ej. un Activo también anotado en un Levantamiento) se
   funde en un solo renglón con ambas apariciones listadas bajo
   "Documentado en", cada una con su propio enlace real de vuelta
   (reusando los mismos data-activo/data-levantamiento/data-poliza que ya
   usa el resto de la app) — nunca se repite la unidad. Sin serie, cada
   aparición se queda separada: no hay forma de probar que son la misma
   unidad solo por compartir marca+modelo. */
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
    // Mismo horno Rational, documentado dos veces (Activo + Levantamiento),
    // con la MISMA serie real — debe fundirse en un solo renglón.
    datos.activos = [
      normalizarActivo({ id:'ac1', folio:'AC-1', tipo:'cliente', clienteId:'c1', sitioId:'s1', sitioNombre:'DAIMLER SANTIAGO', nombre:'Horno', marca:'RATIONAL', modelo:'iCombi Pro', serie:'SN-1001' }),
      // Activo interno (sin cliente), sin serie: no debe fundirse con nada.
      normalizarActivo({ id:'ac2', folio:'AC-2', tipo:'forguard', nombre:'Camioneta', marca:'Nissan', modelo:'NP300', serie:'' }),
      // Un activo sin marca/modelo/serie: no debe aparecer en el catálogo.
      normalizarActivo({ id:'ac3', folio:'AC-3', tipo:'forguard', nombre:'Escalera', marca:'', modelo:'', serie:'' })
    ];
    datos.levantamientos = [
      normalizarLevantamiento({ id:'lv1', folio:'LV-1', clienteId:'c1', sitioId:'s1', sitioNombre:'DAIMLER SANTIAGO', fecha:'2026-09-01',
        hallazgos: [
          { ubicacion:'Cocina', hallazgo:'Revisar fuga de gas', marca:'RATIONAL', modelo:'iCombi Pro', serie:'SN-1001' },
          // Hallazgo sin marca/modelo/serie (solo texto): no debe aparecer.
          { ubicacion:'Pasillo', hallazgo:'Falta señalización de salida' }
        ] })
    ];
    // Póliza con una partida de 2 unidades, cada una con su propia serie
    // (series[]) — deben salir como 2 renglones distintos, no uno.
    datos.polizas = [normalizarPoliza({ id:'p1', clienteId:'c1', sitioId:'s1', sitioNombre:'DAIMLER SANTIAGO', folio:'POL-1', estatus:'activa',
      partidas: [{ concepto:'Cámara de refrigeración', marca:'True', modelo:'T-49', cantidad:2, series:['TR-01','TR-02'], precioUnitario:1000, frecuencia:12, mesesServicio:[0] }] })];
  });

  // --------- 1) El módulo es alcanzable desde "Más", solo para Owner ---------
  await page.click('#btnMasModulos');
  await page.waitForTimeout(100);
  chkF('El link "Catálogo de equipos" aparece en "Más" para Owner', await page.locator('[data-modulo="equipos"]').isVisible());
  await page.click('[data-modulo="equipos"]');
  await page.waitForTimeout(200);
  chkF('Clic real entra al módulo "equipos"', await page.evaluate(() => estado.modulo) === 'equipos');

  // --------- 2) La tabla agregada: fusión por serie, separación sin serie, expansión de series[] ---------
  const filas = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('table.tabla tbody tr')).map(tr => ({
      texto: tr.textContent.replace(/\s+/g, ' ').trim(),
      botones: Array.from(tr.querySelectorAll('button')).map(b => b.textContent.trim())
    }));
  });
  chkF('Salen exactamente 4 renglones: Rational (fundido), Nissan, y las 2 unidades de True', filas.length === 4);
  const rational = filas.find(f => f.texto.includes('Rational'));
  chkF('El Rational (misma serie en Activo + Levantamiento) se fundió en UN solo renglón', !!rational);
  chkF('Ese renglón trae AMBOS orígenes: "Activo" y "Levantamiento"', !!rational && rational.botones.includes('Activo') && rational.botones.includes('Levantamiento'));
  chkF('Un activo sin marca/modelo/serie (Escalera) NO aparece en el catálogo', !filas.some(f => f.texto.includes('Escalera')));
  chkF('Un hallazgo sin marca/modelo/serie (señalización) no generó un renglón aparte', filas.every(f => !f.texto.includes('señalización')));
  const unidadesTrue = filas.filter(f => f.texto.includes('True'));
  chkF('La partida de póliza con 2 series (series[]) generó 2 renglones distintos, uno por unidad', unidadesTrue.length === 2);
  chkF('Cada unidad de True trae su propia serie (TR-01 y TR-02, no repetidas)',
    unidadesTrue.some(f => f.texto.includes('TR-01')) && unidadesTrue.some(f => f.texto.includes('TR-02')));

  // --------- 3) Clic real en un origen navega al registro real ---------
  const filaRational = page.locator('table.tabla tbody tr', { hasText: 'Rational' });
  await filaRational.locator('button', { hasText: 'Activo' }).click();
  await page.waitForTimeout(200);
  const trasActivo = await page.evaluate(() => ({ modulo: estado.modulo, vista: estado.vista, activoId: estado.activoId }));
  chkF('Clic en el badge "Activo" navega de verdad al Activo real (AC-1) en su propio módulo',
    trasActivo.modulo === 'activos' && trasActivo.vista === 'activo' && trasActivo.activoId === 'ac1');

  await page.evaluate(() => irAModulo('equipos'));
  await page.waitForTimeout(150);
  const filaRational2 = page.locator('table.tabla tbody tr', { hasText: 'Rational' });
  await filaRational2.locator('button', { hasText: 'Levantamiento' }).click();
  await page.waitForTimeout(200);
  const trasLev = await page.evaluate(() => ({ modulo: estado.modulo, vista: estado.vista, levantamientoId: estado.levantamientoId }));
  chkF('Clic en el badge "Levantamiento" navega al levantamiento real (LV-1)',
    trasLev.modulo === 'levantamientos' && trasLev.vista === 'levantamiento' && trasLev.levantamientoId === 'lv1');

  // --------- 4) Búsqueda filtra por marca/modelo/serie/cliente ---------
  await page.evaluate(() => irAModulo('equipos'));
  await page.waitForTimeout(150);
  await page.fill('#buscaCatalogoEquipos', 'nissan');
  await page.waitForTimeout(150);
  const trasBuscarNissan = await page.locator('table.tabla tbody tr').count();
  chkF('Buscar "nissan" deja solo ese renglón', trasBuscarNissan === 1);
  await page.fill('#buscaCatalogoEquipos', 'TR-02');
  await page.waitForTimeout(150);
  const trasBuscarSerie = await page.locator('table.tabla tbody tr').count();
  chkF('Buscar por una serie específica (TR-02) deja solo esa unidad', trasBuscarSerie === 1);

  // --------- 5) Restringido a Owner, igual que Activos ---------
  await page.evaluate(() => { sesion.rol = 'analyst'; irAModulo('resultados'); });
  await page.waitForTimeout(150);
  const linkAnalyst = await page.locator('[data-modulo="equipos"]').count();
  chkF('Un Analyst no ve "Catálogo de equipos" en ningún lado (mismo candado que Activos)',
    linkAnalyst === 0 || !(await page.locator('[data-modulo="equipos"]').isVisible()));

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
