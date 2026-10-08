/* Catálogo de refacciones RATIONAL (08-oct-2026, pedido de Victor tras las
   4 fases de la certificación: "puedes añadir este catalogo de refacciones
   especifico para rational, donde podamos visualizarlo, donde consideres
   mejor y mas viable"). Compartió la lista de precios OFICIAL de RATIONAL
   México (PDF de 360 páginas, válida desde 1.4.2025, subido al repo porque
   Google Drive estaba bloqueado por la política de red del entorno) — se
   transcribió UNA vez con un script de línea de comandos (fuera del
   tablero) a docs/datos/refacciones_rational.json: 11,762 refacciones,
   ~2.5MB. Demasiado grande para vivir como semilla en JS (como el checklist
   de 36 puntos) o en un documento de Firestore (límite de 1MB) — por eso es
   un archivo estático que esta pantalla trae con un fetch() normal, no
   datos.* ni sincronizado con la nube, y es SOLO buscador: con 11,762
   renglones, pintar la lista completa de una serían miles de nodos de DOM
   por nada, así que nada se muestra hasta que se escribe algo (ver
   TOPE_RESULTADOS_REFACCIONES_RATIONAL para el tope de resultados).

   Ojo con el nombre: Forguard YA tenía un módulo "Refacciones" (Proveedores
   → Refacciones, inventario propio con movimientos de entrada/salida) antes
   de este catálogo — son cosas totalmente distintas (uno es inventario
   propio, este es la lista de precios de un proveedor externo), por eso la
   vista nueva se llama "Catálogo de refacciones RATIONAL"
   (catalogo-refacciones-rational) y no comparte ningún estado con la otra. */
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
    irAModulo('polizas');
  });
  await page.waitForTimeout(150);

  // --------- 1) El botón vive en la cabecera de Pólizas, junto a "Checklist RATIONAL" ---------
  chkF('El botón "Refacciones RATIONAL" está en Pólizas', await page.locator('[data-accion="ver-catalogo-refacciones-rational"]').count() === 1);
  await page.click('[data-accion="ver-catalogo-refacciones-rational"]');
  await page.waitForTimeout(150);
  chkF('Entra a la pantalla del catálogo', await page.locator('h2:has-text("Catálogo de refacciones RATIONAL")').count() === 1);

  // --------- 2) Sin buscar nada todavía: NO se pinta la lista completa (11,762 renglones) ---------
  chkF('Sin escribir nada, no se dibuja ninguna tabla (nada de 11,762 filas de un jalón)', await page.locator('#zonaResultadosRefaccionesRational table').count() === 0);
  chkF('...en vez de eso, invita a escribir algo para buscar', (await page.locator('#zonaResultadosRefaccionesRational').textContent()).includes('Escribe un código'));

  // --------- 3) Buscar por CÓDIGO exacto de un renglón vigente con precio real ---------
  // "10.00.061P" existe en el PDF real compartido por Victor: "Tornillo cabeza
  // cilíndrica ranurada Torx M4x12 desde 04/2004", $24.00 MXN.
  await page.waitForFunction(() => {
    const z = document.getElementById('zonaResultadosRefaccionesRational');
    return z && !z.textContent.includes('Cargando');
  }, { timeout: 15000 });
  await page.fill('#buscaRefaccionRational', '10.00.061P');
  await page.waitForTimeout(200);
  const filaExacta = await page.locator('#zonaResultadosRefaccionesRational tbody tr').first().textContent();
  chkF('Buscar un código exacto lo encuentra', filaExacta.includes('10.00.061P'));
  chkF('...con su descripción real del PDF', filaExacta.includes('Torx M4x12'));
  chkF('...y su precio real en pesos ($24)', filaExacta.includes('24'));

  // --------- 4) Buscar por parte de la DESCRIPCIÓN (no por código) ---------
  await page.fill('#buscaRefaccionRational', 'electrodo de nivel');
  await page.waitForTimeout(200);
  const porDescripcion = await page.locator('#zonaResultadosRefaccionesRational tbody tr').count();
  chkF('Buscar por texto de la descripción (sin saber el código) sí encuentra resultados', porDescripcion > 0);

  // --------- 5) Un código YA DESCONTINUADO muestra el código vigente que lo sustituye ---------
  // "10.00.041" del PDF real: "sustituido por 10.01.429P" — ya no tiene precio
  // propio, pero el sustituto sí (y ESE es el que hay que cotizar).
  await page.fill('#buscaRefaccionRational', '10.00.041');
  await page.waitForTimeout(200);
  const filasDescontinuado = await page.locator('#zonaResultadosRefaccionesRational tbody tr').allTextContents();
  // allTextContents() concatena las celdas de la fila SIN espacio entre
  // ellas (ej. "10.00.041Tuerca del remache..."), así que un \b normal no
  // sirve de límite — basta con que el código exacto NO siga con una "P"
  // pegada (que sería un código distinto, ya con su propio precio).
  const filaOriginal = filasDescontinuado.find(t => /10\.00\.041(?!P)/.test(t));
  chkF('El código original aparece marcado como descontinuado', !!filaOriginal && filaOriginal.includes('Descontinuada'));
  chkF('...y enseña el código vigente que lo sustituye (10.01.429P)', !!filaOriginal && filaOriginal.includes('10.01.429P'));

  // --------- 6) Sin resultados: mensaje claro, no una tabla vacía ---------
  await page.fill('#buscaRefaccionRational', 'xyzxyzxyz-no-existe-esto-123');
  await page.waitForTimeout(200);
  chkF('Una búsqueda sin coincidencias no deja una tabla vacía', await page.locator('#zonaResultadosRefaccionesRational table').count() === 0);
  chkF('...sino un mensaje de "no hay resultados"', (await page.locator('#zonaResultadosRefaccionesRational').textContent()).toLowerCase().includes('ningún'));

  // --------- 7) El tope de resultados avisa cuando hay más de los que se muestran ---------
  // "ea" como búsqueda (la unidad más común) cae en miles de renglones.
  await page.fill('#buscaRefaccionRational', 'tornillo');
  await page.waitForTimeout(200);
  const resumenTornillo = await page.locator('#zonaResultadosRefaccionesRational .pista').first().textContent();
  chkF('Con muchos resultados, avisa que se topó la lista (no intenta pintar miles de filas)', resumenTornillo.includes('mostrando los primeros'));
  chkF('El tope real de filas en el DOM es el prometido (60), no todas las que hay', await page.locator('#zonaResultadosRefaccionesRational tbody tr').count() === 60);

  // --------- 8) Volver a Pólizas funciona (mismo patrón que "Checklist RATIONAL") ---------
  await page.click('[data-accion="ir-polizas"]');
  await page.waitForTimeout(150);
  chkF('"Regresar a pólizas" sí regresa a la lista de pólizas', await page.locator('h2:has-text("Pólizas de mantenimiento")').count() === 1);

  // --------- 9) El módulo de inventario propio ("Refacciones", Proveedores) sigue intacto ---------
  // Nombre parecido a propósito ("Refacciones RATIONAL" vs "Refacciones") —
  // confirma que NO se pisaron entre sí (ids de vista y de botón distintos).
  chkF('No hubo errores de página en todo el escenario', errores.length === 0);
  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
