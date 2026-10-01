/* Los pies de página del PDF de Proyectos de Imagen se estaban empalmando
   con la tabla de costos en documentos reales con muchos renglones
   (01-oct-2026, reporte de Victor con captura real: "DE IGUAL MANERA
   REVISA YA QUE SE ESTAN EMPALMANDO NUEVAMENTE LOS PIES DE PAGINA").

   Causa raíz, encontrada midiendo directamente en el DOM: paginarCostos()
   calculaba el presupuesto de espacio disponible como
   "footwrap.top - table.top - 12", es decir, desde el TOP de la tabla
   completa (que incluye el <thead> con Concepto/Cantidad/Precio/Subtotal)
   hasta el pie — pero el ciclo que va acomodando renglones solo suma las
   alturas de las filas del <tbody>, sin restar nunca la altura real del
   encabezado (~22.5pt). Ese hueco se lo comía primero el margen de
   seguridad de 12pt y después invadía el pie de página, en cuanto el
   proyecto tenía suficientes conceptos para casi llenar una hoja.

   La corrección mide el presupuesto desde el FONDO del <thead> (donde
   arrancan de verdad los renglones), no desde el top de la tabla.

   Este escenario reconstruye un desglose real de 24 conceptos (textos
   largos, mayúsculas y minúsculas mezcladas, con y sin precio de venta)
   que reproducía el empalme de forma consistente antes de la corrección,
   y confirma además que el Tipo oración de los conceptos sigue
   funcionando sobre un documento real multi-hoja. */
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
    const conceptos = [
      { proveedor:'ZODEK', concepto:'SUMINISTRO DE BARRA DESLIZADORA COMPUESTA DE ACRILICO / RESINA Y CUARZO COLOR: DOVE 17.20 X 0.30 MTS.', cantidad:1, costoUnitario:22389, precioVenta:26000 },
      { proveedor:'SARO TECH', concepto:'SUMINISTRO DE LAMBRIN SINTETICO INSTALADO EN MURO 45 PZAS', cantidad:1, costoUnitario:86341, precioVenta:95000 },
      { proveedor:'SARO TECH', concepto:'SUMINISTRO DE PIEDRA SINTÉTICA PU A94 CREAM ROCK 0.60 X 1.20 CAJA C/4 PIEZAS (2.88m2)', cantidad:1, costoUnitario:50291, precioVenta:58000 },
      { proveedor:'C SOLUCIONES', concepto:'SUMINSTRO DE FOLLAJE ARTIFICIAL, MODELO TROPICAL LINEA ELITE', cantidad:20, costoUnitario:886, precioVenta:1000 },
      { proveedor:'LUXDEX', concepto:'FRASE "TU ESFUERZO VALIÓ, VALE Y VALDRÁ LA PENA..." EN VINIL NEGRO DE 1.20 DE ANCHO X 1.50 mts. DE ALTO APROX.', cantidad:1, costoUnitario:2880, precioVenta:3200 },
      { proveedor:'LUXDEX', concepto:'ACRILICO TRANSPARENTE 1.35 X 1.8 Mts. CON 4 CHAPETONES DE ALUMINIO', cantidad:1, costoUnitario:3600, precioVenta:4200 },
      { proveedor:'LUXDEX', concepto:'VINIL MICROPERFORADO VENTANA DE 1.80 X 1.22 m.', cantidad:1, costoUnitario:1800, precioVenta:2100 },
      { proveedor:'SEMIR SOLUCIONES', concepto:'SUMINISTRO MUEBLE DE SEGREGACIÓN DOBLE DE 2.00 X 0.70 X 0.90 m DE ALTO', cantidad:2, costoUnitario:34260, precioVenta:39000 },
      { proveedor:'LITEHAUS', concepto:'SUMINSTRO DE TIRA LED LED ECOFLEX 4,8W/865 12V IP20 400lm/m 5M EMPOTRADA EN VIGA FALSA 12.80 ml.', cantidad:3, costoUnitario:468, precioVenta:550 },
      { proveedor:'HOME DEPOT', concepto:'SUMINISTRO DE MATERIALES VARIOS (SILICONES PARA ANGULOS Y VINIPANEL, PINTURA, BROCAS, TORNILLOS Y OTROS)', cantidad:1, costoUnitario:14400, precioVenta:16500 },
      { proveedor:'HOME DEPOT', concepto:'SUMINISTRO DE MATERIALES ELECTRICOS', cantidad:1, costoUnitario:4200, precioVenta:4800 },
      { proveedor:'SERVICIOS', concepto:'GASTOS INDIRECTO (TRASLADOS, ALIMENTACION, HOSPEDAJE)', cantidad:1, costoUnitario:24000, precioVenta:0 },
      { proveedor:'SERVICIOS', concepto:'GASTOS INDIRECTO (GASOLINA, TAXIS, TRASLADO DE MATERIALES)', cantidad:1, costoUnitario:7800, precioVenta:0 },
      { proveedor:'SERVICIOS', concepto:'RENTA DE UNIDAD PARA TRASLADO DE MATERIALES A MEXICO', cantidad:1, costoUnitario:30000, precioVenta:0 },
      { proveedor:'SERVICIOS', concepto:'RENTA DE UNIDAD PARA TRASLADOS (MATERIALES, EQUIPOS, HERRAMIENTA, ECT.)', cantidad:1, costoUnitario:14400, precioVenta:0 },
      { proveedor:'SERVICIOS', concepto:'RECOLECCION DE MATERIALES PARA REMODELACION - VARIOS PROVEEDORES', cantidad:1, costoUnitario:10200, precioVenta:0 },
      { proveedor:'SERVICIOS', concepto:'3 RENDER 4K 4,000 x 2,500 PIXELES', cantidad:1, costoUnitario:11040, precioVenta:0 },
      { proveedor:'SERVICIOS', concepto:'INSTALACIÓN DE BARRA DESLIZADORA', cantidad:17.2, costoUnitario:552, precioVenta:0 },
      { proveedor:'LITEHAUS', concepto:'Instalacion de tira led empotrada en lambrín', cantidad:3, costoUnitario:888, precioVenta:0 },
      { proveedor:'SARO TECH', concepto:'INSTALACIÓN DE PIEDRA SINTÉTICA PU A94 CREAM ROCK 0.60 X 1.20 CAJA C/4 PIEZAS (2.88m2)', cantidad:44, costoUnitario:114, precioVenta:0 },
      { proveedor:'SARO TECH', concepto:'Instalacion de lambrin', cantidad:25, costoUnitario:732, precioVenta:0 },
      { proveedor:'LUXDEX', concepto:'Instalacion de vinil microperforado', cantidad:1, costoUnitario:600, precioVenta:0 },
      { proveedor:'LUXDEX', concepto:'Instalacion de acrilico con chapetones', cantidad:1, costoUnitario:1500, precioVenta:0 },
      { proveedor:'LUXDEX', concepto:'Instalacion de frase en vinil', cantidad:1, costoUnitario:552, precioVenta:0 }
    ].map((c,i)=>Object.assign({ id:'x'+i }, c));
    datos.proyectosImagen = [normalizarProyectoImagen({
      id:'pi1', clienteId:'c1', sitioId:'s1', sitioNombre:'DAIMLER SANTIAGO', folio:'PI-001',
      nombreProyecto:'REMODELACION COMEDOR DAIMLER SANTIAGO', fechaObjetivo:'2026-09-30',
      responsable:'Arq. Fernando Jasso', notas:'ATENCION: Eduardo Escamilla',
      conceptos
    })];
  });

  async function abrirDocumento(usarCosto){
    const [docPage] = await Promise.all([
      context.waitForEvent('page'),
      page.evaluate((costo) => {
        sessionStorage.setItem('forguard.documento.imagen', JSON.stringify(armarPayloadProyectoImagen(proyectoImagenPorId('pi1'), costo)));
        window.open('docs/plantilla_imagen.html', '_blank');
      }, usarCosto)
    ]);
    await docPage.waitForLoadState();
    await docPage.waitForTimeout(600);
    return docPage;
  }

  async function medirEmpalmes(docPage){
    return docPage.evaluate(() => {
      const paginas = Array.from(document.querySelectorAll('.page'));
      return paginas.map((p, idx) => {
        const tabla = p.querySelector('table.costos-tabla');
        const foot = p.querySelector('.footwrap');
        if(!tabla || !foot) return { idx, na: true };
        const filas = Array.from(tabla.querySelectorAll('tbody tr'));
        const ultima = filas[filas.length - 1];
        if(!ultima) return { idx, na: true };
        const ultimaBottom = ultima.getBoundingClientRect().bottom;
        const footTop = foot.getBoundingClientRect().top;
        return { idx, ultimaBottom, footTop, overlap: ultimaBottom > footTop };
      });
    });
  }

  // --------- 1) PDF normal ("Generar PDF", sin proveedor): sin empalmes ---------
  const docNormal = await abrirDocumento(false);
  const medidasNormal = await medirEmpalmes(docNormal);
  const paginasConTabla = medidasNormal.filter(m => !m.na);
  chkF('El documento real de costos quedó en más de una hoja (escenario con empalme reproducido)', paginasConTabla.length >= 2);
  paginasConTabla.forEach(m => chkF('Página ' + m.idx + ': el último renglón de la tabla NO se empalma con el pie', !m.overlap));

  // Confirma que el Tipo oración sobre conceptos en mayúsculas sigue vivo en un documento real multi-hoja.
  const textoPagina2 = await docNormal.locator('.page').nth(1).locator('table.costos-tabla').textContent();
  chkF('Los conceptos siguen en Tipo oración en el documento real (no quedaron en MAYÚSCULAS)', /Suministro de barra deslizadora/.test(textoPagina2) && !/SUMINISTRO DE BARRA/.test(textoPagina2));
  await docNormal.close();

  // --------- 2) PDF "con costos" (con proveedor): también sin empalmes ---------
  const docCosto = await abrirDocumento(true);
  const medidasCosto = await medirEmpalmes(docCosto);
  medidasCosto.filter(m => !m.na).forEach(m => chkF('PDF con costos, página ' + m.idx + ': el último renglón NO se empalma con el pie', !m.overlap));
  await docCosto.close();

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
