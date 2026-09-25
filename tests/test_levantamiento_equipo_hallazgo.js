/* Marca/Modelo/Número de serie en Hallazgos + "Solo levantamiento (sin
   acción)" (25-sep-2026, pedido explícito de Victor, con captura de
   pantalla del modal "Nuevo hallazgo"): "añade que se puedan ingresar
   marca, modelo y numero de serie del equipo" + "en el tipo de acción
   coloca una opción que solo sea 'levantamiento'... si no requiere una
   acción preventiva o correctiva se genere solo el levantamiento para que
   a la momento de generar una póliza también incluya el dato del equipo".

   Dos piezas:
   1) normalizarHallazgo() gana marca/modelo/serie (mismos nombres de campo
      que ya usa Activos), capturables desde modalHallazgo() y visibles en
      la tarjeta del hallazgo y en el PDF del levantamiento.
   2) ACCION_HALLAZGO gana un tercer valor, 'sin_accion' ("Solo
      levantamiento (sin acción)"), que se trata igual que 'preventivo' en
      todo lo que mide gravedad (scoreHallazgo/etiquetaSeveridadHallazgo:
      nunca baja el score ni pinta en rojo) — existe solo para documentar un
      equipo sin que eso implique que algo esté mal.

   El cierre del ciclo, que es el pedido real de fondo: "Generar póliza
   desde este levantamiento" (botón ya existente, modalPoliza(null, l)) ya
   arma un renglón por cada equipo distinto con hallazgo — ahora ese
   renglón nace con la marca/modelo/serie del hallazgo ya puestos (antes se
   perdían: normalizarPartida() ya tenía esos mismos 3 campos desde antes,
   solo que el armado del renglón nunca se los pasaba). */
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
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'NGK' })];
    datos.sitios = [normalizarSitio({ id:'s1', clienteId:'c1', nombre:'Planta 1' })];
    datos.levantamientos = [normalizarLevantamiento({
      id:'lv1', folio:'LV-250926-01', clienteId:'c1', sitioId:'s1', sitioNombre:'Planta 1',
      fecha:'2026-09-26', realizoNombre:'Técnico de prueba', hallazgos:[]
    })];
  });

  // --------- 1) El modelo de datos y las reglas de gravedad ---------
  const modelo = await page.evaluate(() => {
    const hz = normalizarHallazgo({ hallazgo:'Fuga leve', marca:'True', modelo:'T-49', serie:'ABC123', accion:'sin_accion' });
    return {
      accionesDisponibles: ACCION_HALLAZGO.slice(),
      etiquetaSinAccion: ETIQUETA_ACCION_HALLAZGO['sin_accion'],
      tonoSinAccion: TONO_ACCION_HALLAZGO['sin_accion'],
      hz,
      scorePendienteSinAccion: scoreHallazgo({ accion:'sin_accion', estatus:'pendiente', prioridad:'urgente' }),
      scorePendienteCorrectivoUrgente: scoreHallazgo({ accion:'correctivo', estatus:'pendiente', prioridad:'urgente' }),
      severidadSinAccion: etiquetaSeveridadHallazgo({ accion:'sin_accion', estatus:'pendiente' })
    };
  });
  chkF('ACCION_HALLAZGO trae el nuevo valor "sin_accion"', modelo.accionesDisponibles.includes('sin_accion'));
  chkF('La etiqueta de "sin_accion" es clara para el usuario', modelo.etiquetaSinAccion.toLowerCase().includes('levantamiento'));
  chkF('El tono de "sin_accion" NO es de alerta (es informativo, no una falla)', modelo.tonoSinAccion !== 'alerta' && modelo.tonoSinAccion !== 'error');
  chkF('normalizarHallazgo() guarda marca/modelo/serie', modelo.hz.marca === 'True' && modelo.hz.modelo === 'T-49' && modelo.hz.serie === 'ABC123');
  chkF('Un hallazgo "sin_accion" pendiente NUNCA baja el score (score=1), igual que preventivo', modelo.scorePendienteSinAccion === 1);
  chkF('Un hallazgo correctivo urgente pendiente SÍ sigue bajando el score (regla de siempre intacta)', modelo.scorePendienteCorrectivoUrgente === 0);
  chkF('La severidad de "sin_accion" es tono "ok" (no rojo/alerta)', modelo.severidadSinAccion.tono === 'ok');

  // --------- 2) El formulario "Nuevo hallazgo": los 3 campos existen y se guardan ---------
  await page.evaluate(() => {
    estado.modulo = 'levantamientos'; estado.vista = 'levantamiento'; estado.levantamientoId = 'lv1';
    render();
    modalHallazgo('lv1', null);
  });
  chkF('El modal de hallazgo trae el campo "Marca"', await page.locator('#hzMarca').count() === 1);
  chkF('El modal de hallazgo trae el campo "Modelo"', await page.locator('#hzModelo').count() === 1);
  chkF('El modal de hallazgo trae el campo "Número de serie"', await page.locator('#hzSerie').count() === 1);
  chkF('El select de "Tipo de acción" ofrece la opción de solo levantamiento', await page.locator('#hzAccion option[value="sin_accion"]').count() === 1);

  /* El modal autoenfoca "Ubicación" 70ms después de abrirse (setTimeout en
     modalHallazgo) — sin esta espera, llenar los campos justo en ese margen
     hace que Playwright compita con ese enfoque automático y alguno de los
     valores no cuaje (flaky, no un bug real de la app). */
  await page.waitForTimeout(150);
  await page.fill('#hzUbicacion', 'Cocina caliente');
  await page.fill('#hzMarca', 'Turbo Air');
  await page.fill('#hzModelo', 'M3R24');
  await page.fill('#hzSerie', 'SN-778899');
  await page.fill('#hzHallazgo', 'Refrigerador nuevo, documentado en el recorrido');
  await page.selectOption('#hzAccion', 'sin_accion');
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(150);

  const hzGuardado = await page.evaluate(() => levantamientoPorId('lv1').hallazgos[0]);
  chkF('El hallazgo guardado trae la Marca capturada', hzGuardado.marca === 'Turbo Air');
  chkF('El hallazgo guardado trae el Modelo capturado', hzGuardado.modelo === 'M3R24');
  chkF('El hallazgo guardado trae el Número de serie capturado', hzGuardado.serie === 'SN-778899');
  chkF('El hallazgo guardado quedó con "sin_accion" (solo levantamiento)', hzGuardado.accion === 'sin_accion');

  // --------- 3) La tarjeta en pantalla muestra el detalle del equipo ---------
  const textoTarjeta = await page.locator('.lista-hallazgos').textContent();
  chkF('La tarjeta del hallazgo muestra la marca en pantalla', textoTarjeta.includes('Turbo Air'));
  chkF('La tarjeta del hallazgo muestra el modelo en pantalla', textoTarjeta.includes('M3R24'));
  chkF('La tarjeta del hallazgo muestra el número de serie en pantalla', textoTarjeta.includes('SN-778899'));
  chkF('La tarjeta del hallazgo muestra la etiqueta "Solo levantamiento"', textoTarjeta.toLowerCase().includes('levantamiento'));

  // --------- 4) El payload del PDF trae el detalle del equipo ---------
  const payload = await page.evaluate(() => armarPayloadLevantamiento(levantamientoPorId('lv1')));
  const hzPayload = payload.hallazgos[0];
  chkF('El payload del PDF trae "equipoDetalle" con marca/modelo/serie', hzPayload.equipoDetalle.includes('Turbo Air') && hzPayload.equipoDetalle.includes('M3R24') && hzPayload.equipoDetalle.includes('SN-778899'));

  // --------- 5) "Generar póliza desde este levantamiento": el renglón nace
  // con la marca/modelo/serie del hallazgo ya puestos, sin volver a
  // preguntarlos — el pedido real de fondo de Victor. ---------
  await page.evaluate(() => {
    // Cambia el hallazgo a un nombre de equipo real (equipoNombre), para que
    // el armado de renglones por "equipo distinto" lo reconozca como tal.
    const l = levantamientoPorId('lv1');
    l.hallazgos[0].equipoNombre = 'Refrigerador de postres';
    render();
    document.querySelector('[data-accion="generar-poliza-levantamiento"]').click();
  });
  await page.waitForTimeout(150);

  chkF('Se abrió el formulario de nueva póliza con un renglón (desde el levantamiento)', await page.locator('tr[data-idx="0"]').count() === 1);
  chkF('El renglón nace con el nombre del equipo del hallazgo', await page.locator('tr[data-idx="0"] input[data-campo="concepto"]').inputValue() === 'Refrigerador de postres');
  chkF('El renglón nace con la Marca del hallazgo, sin volver a preguntarla', await page.locator('tr[data-idx="0"] input[data-campo="marca"]').inputValue() === 'Turbo Air');
  chkF('El renglón nace con el Modelo del hallazgo', await page.locator('tr[data-idx="0"] input[data-campo="modelo"]').inputValue() === 'M3R24');
  chkF('El renglón nace con el Número de serie del hallazgo', await page.locator('tr[data-idx="0"] input[data-campo="serie"]').inputValue() === 'SN-778899');

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
