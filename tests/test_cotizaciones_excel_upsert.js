/* Pedido de Victor (23-sep-2026): "corregir cotizaciones que ya existen, y
   cargar nuevas que no existen" — antes, "Importar desde Excel" en
   Cotizaciones (tablero de Monday.com) solo agregaba servicios nuevos: un
   renglón que ya se había importado, aunque el Excel trajera el subtotal o
   la etapa corregidos, se detectaba como "ya existente" (el subtotal
   formaba parte de la llave de duplicados) y se OMITÍA sin tocar nada.

   Ahora identifica cada renglón por nombre+sitio+fecha de registro (sin
   folio ni subtotal ni etapa, que son justo lo que se corrige — ver
   llaveIdentidadCotizacionXlsx() e index.html), y si ya existe, actualiza
   esa MISMA cotización con lo que traiga el Excel (decisión de Victor,
   vía AskUserQuestion: "todo lo que traiga el Excel" manda).

   Se sobreescribe window.leerLibroXlsx (en vez de armar un .xlsx binario de
   verdad) para inyectar directamente las "hojas" ya parseadas, con la
   misma forma exacta que arma leerHojaXlsxComoFilas — así se prueba toda
   la lógica real de extraerCotizacionesTableroXlsx()/
   importarCotizacionesDesdeExcel() sin depender del lector de ZIP/XML. */
const { chromium } = require('playwright');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
const chk = (label, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' - ' + label); return cond; };
let fallas = 0;
const chkF = (label, cond) => { if(!chk(label, cond)) fallas++; };

const COLS = ['NAME','COMEDOR','FECHA LIBERACION','FECHAS PROGRAMADAS - START','FECHAS PROGRAMADAS - END',
  'FOLIO OC COMPRAS','FOLIO SOPORTE','PROVEEDOR','STATUS MATERIAL / REFACCIONES','ESTADO DE SERVICIO',
  'ESTATUS EJECUCION','FECHA SERVICIO REALIZADO','SUBTOTAL','COMENTARIOS','REGISTRO DE CREACION',
  'FOLIO COTI MTTO','PERSONAS'];

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

  await page.evaluate(({ COLS }) => {
    sesion.correo='owner@a.com'; sesion.uid='u-owner'; sesion.idToken='FAKE'; sesion.refreshToken='F2';
    sesion.expira=Date.now()+3600000; sesion.rol='owner'; sesion.nombre='Victor Owner';
    ocultarAcceso();

    window._fila = vals => COLS.map(c => (vals[c] !== undefined ? vals[c] : ''));
    window._COLS = COLS;
  }, { COLS });

  // --------- 1) Primera importación: dos servicios nuevos ---------
  await page.evaluate(() => {
    const filas = [
      ['Servicios Pendientes - Cargo al Cliente'], // título general: no es ninguna etapa, se ignora
      ['Trabajos con Orden de Compra'],
      window._COLS,
      window._fila({ NAME:'Reparación de compresor', COMEDOR:'NGK Planta 1', 'FOLIO SOPORTE':'SOP-100',
        PROVEEDOR:'ACME', 'REGISTRO DE CREACION':'2026-09-01', SUBTOTAL:1000, COMENTARIOS:'Primera captura' }),
      ['Servicios Pendientes'],
      window._COLS,
      window._fila({ NAME:'Cambio de filtro', COMEDOR:'NGK Planta 1',
        'REGISTRO DE CREACION':'2026-09-02', SUBTOTAL:500 })
    ];
    window.leerLibroXlsx = async () => [{ nombre:'Hoja1', filas }];
    importarCotizacionesDesdeExcel({ name:'tablero.xlsx' });
  });
  await page.waitForTimeout(150);
  const dialogo1 = await page.textContent('#modalCuerpo');
  chkF('El diálogo de confirmación habla de 2 servicios nuevos', /2.*servicios nuevos/.test(dialogo1));
  chkF('...sin mencionar corregidos (es la primera vez)', !/se corrige/.test(dialogo1));

  await page.click('#modalPie [data-modal="guardar"]');
  await page.waitForTimeout(200);
  const tras1 = await page.evaluate(() => ({
    total: datos.cotizaciones.length,
    compresor: datos.cotizaciones.find(c => c.partidas[0].concepto === 'Reparación de compresor'),
    filtro: datos.cotizaciones.find(c => c.partidas[0].concepto === 'Cambio de filtro'),
  }));
  chkF('Se crean las 2 cotizaciones nuevas', tras1.total === 2);
  chkF('La primera trae etapa, proveedor y subtotal del Excel', tras1.compresor
    && tras1.compresor.estatus === 'trabajo_oc' && tras1.compresor.proveedor === 'ACME'
    && tras1.compresor.partidas[0].precioClienteManual === 1000);

  // --------- 2) Segunda importación: corrige la 1a, deja igual la 2a, agrega una 3a ---------
  const idCompresorAntes = tras1.compresor.id;
  await page.evaluate(({ idCompresorAntes }) => {
    const filas = [
      ['Servicios Realizados'],
      window._COLS,
      // Mismo nombre+sitio+fecha de registro que antes (misma identidad) — etapa, proveedor, subtotal y comentarios YA CORREGIDOS.
      window._fila({ NAME:'Reparación de compresor', COMEDOR:'NGK Planta 1', 'FOLIO SOPORTE':'SOP-100',
        PROVEEDOR:'OTRO PROVEEDOR', 'REGISTRO DE CREACION':'2026-09-01', SUBTOTAL:1500, COMENTARIOS:'Corregido' }),
      // Su propia sección (misma etapa que en la 1a importación) y, dentro de
      // ella, EXACTAMENTE igual que antes — no debe contar como actualizado.
      ['Servicios Pendientes'],
      window._COLS,
      window._fila({ NAME:'Cambio de filtro', COMEDOR:'NGK Planta 1',
        'REGISTRO DE CREACION':'2026-09-02', SUBTOTAL:500 }),
      ['Trabajos con Orden de Compra'],
      window._COLS,
      window._fila({ NAME:'Servicio nuevo de la segunda corrida', COMEDOR:'NGK Planta 1',
        'REGISTRO DE CREACION':'2026-09-05', SUBTOTAL:300 })
    ];
    window.leerLibroXlsx = async () => [{ nombre:'Hoja1', filas }];
    window._idCompresorAntes = idCompresorAntes;
    importarCotizacionesDesdeExcel({ name:'tablero-corregido.xlsx' });
  }, { idCompresorAntes });
  await page.waitForTimeout(150);
  const dialogo2 = await page.textContent('#modalCuerpo');
  chkF('El diálogo dice 1 servicio nuevo', /1.*servicio nuevo/.test(dialogo2));
  chkF('...1 cotización se corrige', /1.*cotización ya capturada se corrige/.test(dialogo2));
  chkF('...1 servicio se deja igual, sin cambios', /1.*servicio.*sin cambios/.test(dialogo2));

  await page.click('#modalPie [data-modal="guardar"]');
  await page.waitForTimeout(200);
  const tras2 = await page.evaluate(() => ({
    total: datos.cotizaciones.length,
    compresor: datos.cotizaciones.find(c => c.id === window._idCompresorAntes),
    filtro: datos.cotizaciones.find(c => c.partidas[0].concepto === 'Cambio de filtro'),
    nuevo: datos.cotizaciones.find(c => c.partidas[0].concepto === 'Servicio nuevo de la segunda corrida'),
  }));
  chkF('Solo se agregó UNA cotización (no 3): el total pasa de 2 a 3', tras2.total === 3);
  chkF('La cotización del compresor sigue siendo el MISMO registro (mismo id) — se corrigió, no se duplicó', !!tras2.compresor);
  chkF('...con la etapa corregida (Servicios Realizados)', tras2.compresor && tras2.compresor.estatus === 'realizado');
  chkF('...con el proveedor corregido', tras2.compresor && tras2.compresor.proveedor === 'OTRO PROVEEDOR');
  chkF('...con el subtotal corregido (1500, no 1000)', tras2.compresor && tras2.compresor.partidas[0].precioClienteManual === 1500);
  chkF('...con los comentarios corregidos', tras2.compresor && /Corregido/.test(tras2.compresor.notas));
  chkF('El de "Cambio de filtro" NO cambió (subtotal sigue en 500)', tras2.filtro && tras2.filtro.partidas[0].precioClienteManual === 500);
  chkF('El servicio nuevo de la segunda corrida sí se agregó', !!tras2.nuevo);

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
