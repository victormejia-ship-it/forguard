/* Orden alfabético por concepto en "Equipos cotizados" de una Póliza
   (26-oct-2026, pedido de Victor viendo una tabla real en producción con
   "Cámara de congelación, Cámara de refrigeración, Plancha industrial,
   Freidora, Sarteneta" fuera de orden): "el orden de los item en las
   polizas no se ordenan de manera alfabetica... que todas las polizas
   puedan ordenar alfabeticamente estos datos". Mismo criterio exacto que
   el orden por proveedor de Proyecto de Imagen (ver
   test_proyecto_imagen_orden_proveedor.js): el orden se calcula SOLO al
   pintar (`conIndiceOrdenadosPorConcepto`, justo después de
   `conceptosOrdenadosPorProveedor`) y nunca se guarda reordenado en
   `p.partidas` — una póliza vieja sale ordenada la primera vez que se
   vuelve a abrir, sin ninguna migración.

   Diferencia clave con el caso de Proyecto de Imagen: aquí cada renglón de
   la tabla también imprime su total (`c.totales[i]`), calculado por
   calcularPoliza() en el MISMO orden que p.partidas — si se reordenara
   p.partidas antes de mapear, cada fila mostraría el total de OTRO
   renglón. Por eso `conIndiceOrdenadosPorConcepto` devuelve pares
   {item, i} con el índice ORIGINAL: la tabla se pinta en el orden nuevo,
   pero cada fila sigue leyendo su propio total por el índice de antes.

   La tabla EDITABLE del modal (`modalPoliza`) también ordena (26-oct-2026,
   segundo reporte de Victor: una póliza YA GUARDADA se abría para editar y
   los renglones seguían en su orden de captura original, no alfabético) —
   usa la función `ordenarPartidasPorEquipo()` que ya existía y que antes
   solo corría al agregar un renglón desde el catálogo, nunca al abrir el
   modal con una póliza existente. El orden se recalcula únicamente dentro
   de `pintarPartidas()` (abrir el modal, agregar, quitar, duplicar, mover
   la fecha de inicio...) y NUNCA mientras se teclea un campo: escribir solo
   dispara `refrescar(idx)` sobre esa fila, así que un renglón no brinca ni
   pierde el foco a medio tecleo — mismo cuidado que ya tenía el resto de
   esta tabla para no reacomodar filas debajo del cursor de quien captura. */
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
  await page.route('**identitytoolkit.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**securetoken.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**firestore.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.goto(URL_BASE + '/index.html');
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    sesion.correo='owner@a.com'; sesion.uid='u-owner'; sesion.idToken='FAKE'; sesion.refreshToken='F2';
    sesion.expira=Date.now()+3600000; sesion.rol='owner'; sesion.nombre='Victor Owner';
    ocultarAcceso();
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'ACME' })];
    datos.polizas = [normalizarPoliza({
      id:'p1', clienteId:'c1', folio:'POL-001', sitioNombre:'Sitio ACME',
      estatus:'activa', facturacion:'anual', fechaInicio:'2024-01-01', fechaCotizacion:'2024-01-01', cargoA:'cliente',
      partidas: [
        { id:'x1', concepto:'Cámara de congelación',  cantidad:1, precioUnitario:7000, costoUnitario:1996, frecuencia:3, mesesServicio:[9,1,5] },
        { id:'x2', concepto:'Cámara de refrigeración', cantidad:2, precioUnitario:7000, costoUnitario:1996, frecuencia:3, mesesServicio:[9,1,5] },
        { id:'x3', concepto:'Plancha industrial',      cantidad:2, precioUnitario:7500, costoUnitario:1354, frecuencia:3, mesesServicio:[8,0,4] },
        { id:'x4', concepto:'Freidora',                cantidad:2, precioUnitario:1200, costoUnitario:1140, frecuencia:3, mesesServicio:[8,0,4] },
        { id:'x5', concepto:'Sarteneta',                cantidad:2, precioUnitario:4750, costoUnitario:1533, frecuencia:3, mesesServicio:[8,0,4] }
      ],
      cobros:[true]
    })];
  });

  // --------- 1) conIndiceOrdenadosPorConcepto(): aritmética/orden puro ---------
  const orden = await page.evaluate(() =>
    conIndiceOrdenadosPorConcepto(polizaPorId('p1').partidas).map(par => par.item.concepto));
  chkF('Queda alfabético, insensible a mayúsculas/acentos',
    JSON.stringify(orden) === JSON.stringify(['Cámara de congelación', 'Cámara de refrigeración', 'Freidora', 'Plancha industrial', 'Sarteneta']));

  const indices = await page.evaluate(() =>
    conIndiceOrdenadosPorConcepto(polizaPorId('p1').partidas).map(par => par.i));
  chkF('Cada par trae su índice ORIGINAL (para leer c.totales[i] correcto), no el de la posición ordenada',
    JSON.stringify(indices) === JSON.stringify([0, 1, 3, 2, 4]));

  // --------- 2) El dato GUARDADO nunca se reordena ---------
  const guardado = await page.evaluate(() => polizaPorId('p1').partidas.map(x => x.concepto));
  chkF('p.partidas conserva el orden de captura tal cual se guardó (no se reescribe)',
    JSON.stringify(guardado) === JSON.stringify(['Cámara de congelación', 'Cámara de refrigeración', 'Plancha industrial', 'Freidora', 'Sarteneta']));

  // --------- 3) La vista de la póliza pinta la tabla ya ordenada, con el total correcto por renglón ---------
  await page.evaluate(() => { irAModulo('polizas'); estado.vista='poliza'; estado.polizaId='p1'; render(); });
  await page.waitForTimeout(200);
  /* Hay más de una <table class="tabla"> en la pantalla (ej. el resumen de
     Agenda/Precios de grupo) — se acota a la del bloque "Equipos
     cotizados", igual que test_proyecto_imagen_orden_proveedor.js acota a
     la tabla de su propio bloque. */
  const bloqueEquipos = page.locator('.bloque', { has: page.locator('h3', { hasText: 'Equipos cotizados' }) });
  const filas = await bloqueEquipos.locator('table.tabla tbody tr').evaluateAll(trs => trs.map(tr => {
    const tds = tr.children;
    return { numero: tds[0].textContent.trim(), concepto: tds[1].querySelector('b').textContent.trim(), total: tds[8].textContent.trim() };
  }));
  chkF('La tabla "Equipos cotizados" en pantalla sale ordenada alfabéticamente por concepto',
    JSON.stringify(filas.map(f => f.concepto)) === JSON.stringify(['Cámara de congelación', 'Cámara de refrigeración', 'Freidora', 'Plancha industrial', 'Sarteneta']));
  chkF('La columna "#" numera según la posición YA ordenada (1 a 5), no el índice original',
    JSON.stringify(filas.map(f => f.numero)) === JSON.stringify(['1', '2', '3', '4', '5']));
  chkF('"Freidora" (reordenada de la posición 4 a la 3) imprime SU PROPIO total ($1,200 × 2 × 3 = $7,200), no el de otro renglón',
    filas.find(f => f.concepto === 'Freidora').total.includes('7,200'));
  chkF('"Plancha industrial" (reordenada de la posición 3 a la 4) imprime SU PROPIO total ($7,500 × 2 × 3 = $45,000)',
    filas.find(f => f.concepto === 'Plancha industrial').total.includes('45,000'));
  chkF('"Cámara de refrigeración" imprime su propio total ($7,000 × 2 × 3 = $42,000)',
    filas.find(f => f.concepto === 'Cámara de refrigeración').total.includes('42,000'));

  // --------- 4) Al ABRIR el modal de una póliza YA EXISTENTE, también sale ordenada ---------
  /* 26-oct-2026, Victor viendo una póliza real guardada con los renglones en
     su orden de captura original dentro del modal de edición: ordenarPartidasPorEquipo()
     ya corría al agregar un renglón desde el catálogo, pero nunca al abrir el
     modal con una póliza existente — esos renglones se quedaban tal cual se
     guardaron la primera vez. Ahora se ordena una vez al construir la tabla. */
  await page.evaluate(() => { modalPoliza('p1'); });
  await page.waitForTimeout(200);
  const conceptosModal = await page.$$eval('#listaPartidas input[data-campo="concepto"]', inputs => inputs.map(i => i.value));
  chkF('Al abrir el modal de una póliza existente, la tabla EDITABLE ya sale ordenada alfabéticamente',
    JSON.stringify(conceptosModal) === JSON.stringify(['Cámara de congelación', 'Cámara de refrigeración', 'Freidora', 'Plancha industrial', 'Sarteneta']));

  // --------- 5) Mientras se teclea un concepto, el renglón NO brinca ni pierde el foco ---------
  /* El reordenado solo corre en pintarPartidas() (abrir el modal, agregar desde
     el catálogo, quitar, duplicar, mover la fecha de inicio...); teclear en un
     campo dispara el listener "input", que SOLO llama refrescar(idx) sobre esa
     fila — nunca pintarPartidas() — así que nada se reordena a medio tecleo. */
  const tecleo = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('#listaPartidas input[data-campo="concepto"]'));
    const campo = inputs.find(i => i.value === 'Freidora');
    campo.focus();
    campo.value = 'Ab';                      // la "A" la pondría primera en la lista si reordenara
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    return {
      sigueEnFoco: document.activeElement === campo,
      ordenSinCambios: Array.from(document.querySelectorAll('#listaPartidas input[data-campo="concepto"]')).map(i => i.value)
    };
  });
  chkF('El campo no pierde el foco a media captura', tecleo.sigueEnFoco === true);
  chkF('La tabla no se reordena mientras se teclea (solo al cerrar la acción que dispara pintarPartidas)',
    JSON.stringify(tecleo.ordenSinCambios) === JSON.stringify(['Cámara de congelación', 'Cámara de refrigeración', 'Ab', 'Plancha industrial', 'Sarteneta']));

  chkF('No hubo errores de página en todo el escenario', errores.length === 0);
  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
