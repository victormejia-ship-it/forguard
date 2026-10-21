/* Diferenciador de equipos duplicados en el Calendario de una póliza
   (08-oct-2026, pedido de Victor con 3 capturas reales de una póliza con DOS
   renglones "Horno Rational" —cada uno su propio modelo/serie, misma marca—
   más el modal "Registrar servicio" de uno de ellos, en blanco): "en las
   polizas para registrar un servicio, desde el calendario, puedes
   diferenciar los equipos, ya que actualmente no cuento con un
   diferenciador de que equipo fue el que se atendio".

   El problema real: cuando dos PARTIDAS distintas (dos equipos físicos
   separados, no una misma partida con cantidad>1) comparten el mismo
   `concepto` (texto libre, ej. "Horno Rational"), tanto la lista del mes en
   cuerpoCalendarioPoliza() como el renglón "Equipo" de modalServicioPoliza()
   mostraban ese texto sin nada más — "Horno Rational" aparecía dos veces,
   idéntico, sin forma de saber cuál de los dos se estaba por marcar.

   Arreglo: cuerpoCalendarioPoliza() detecta qué conceptos se repiten DENTRO
   de la misma póliza (conceptosRepetidos, calculado una vez) y, SOLO para
   esos, agrega marca/modelo/serie al texto de la lista y al tooltip — el
   resto de los renglones (sin ambigüedad) se queda exactamente igual, para
   no saturar la lista de información que nadie necesita. El modal de
   registrar servicio (modalServicioPoliza) ahora SIEMPRE muestra marca +
   modelo + serie en su renglón "Equipo" cuando existen (ahí no hace falta
   detectar ambigüedad: es una pantalla de detalle, no una lista compacta).
   El portal de clientes NO recibe modelo/serie (datosClientePoliza() los
   manda vacíos a propósito, son control interno) — ahí solo se agrega marca. */
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
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'BORGWARNER' })];
    datos.polizas = [normalizarPoliza({
      id:'p1', clienteId:'c1', folio:'POL-060', sitioNombre:'BorgWarner',
      estatus:'activa', facturacion:'anual', fechaInicio:'2024-01-01', fechaCotizacion:'2024-01-01',
      partidas: [
        { id:'x1', concepto:'Horno Rational', marca:'Rational', modelo:'iCOMBIPRO', serie:'G11J2209990', cantidad:1, precioUnitario:1000, frecuencia:3, mesesServicio:[9] },
        { id:'x2', concepto:'Horno Rational', marca:'Rational', modelo:'SCC101G', serie:'G1151180626', cantidad:1, precioUnitario:1000, frecuencia:3, mesesServicio:[9] },
        { id:'x3', concepto:'Trampa de grasa', cantidad:1, precioUnitario:500, frecuencia:3, mesesServicio:[9] }
      ],
      cobros:[true]
    })];
    modalCalendario('p1');
  });
  await page.waitForTimeout(250);

  // --------- 1) Los dos "Horno Rational" se distinguen en la lista del mes ---------
  const filas = await page.locator('#cal-mes-9 .cal-lista li').allInnerTexts();
  chkF('El mes muestra los 3 renglones (2 Horno Rational + Trampa de grasa)', filas.length === 3);
  chkF('El primer "Horno Rational" trae su propio modelo/serie en el texto', /iCOMBIPRO/.test(filas[0]) && /G11J2209990/.test(filas[0]));
  chkF('El segundo "Horno Rational" trae el SUYO, distinto al primero', /SCC101G/.test(filas[1]) && /G1151180626/.test(filas[1]));
  chkF('"Trampa de grasa" (sin duplicado) se queda limpio, sin marca/modelo de más', filas[2].trim() === 'Trampa de grasa');

  // --------- 2) El tooltip también trae el distintivo ---------
  const tips = await page.locator('#cal-mes-9 .cal-lista li').evaluateAll(els => els.map(e => e.getAttribute('title')));
  chkF('El tooltip del primer Horno Rational menciona su modelo/serie', /iCOMBIPRO/.test(tips[0]) && /G11J2209990/.test(tips[0]));
  chkF('El tooltip del segundo Horno Rational menciona el suyo', /SCC101G/.test(tips[1]));
  chkF('El tooltip de "Trampa de grasa" no menciona ningún modelo (no hace falta)', !/iCOMBIPRO|SCC101G/.test(tips[2]));

  // --------- 3) El modal "Registrar servicio" trae marca+modelo+serie siempre ---------
  await page.locator('#cal-mes-9 .cal-lista li').nth(0).locator('button').click();
  await page.waitForTimeout(150);
  const equipoLinea1 = await page.locator('.resumen .r-fila').nth(1).innerText();
  chkF('El modal del PRIMER Horno Rational muestra su propio modelo y serie', equipoLinea1.includes('iCOMBIPRO') && equipoLinea1.includes('G11J2209990'));
  await page.click('#btnVolverCalendario');
  await page.waitForTimeout(150);

  await page.locator('#cal-mes-9 .cal-lista li').nth(1).locator('button').click();
  await page.waitForTimeout(150);
  const equipoLinea2 = await page.locator('.resumen .r-fila').nth(1).innerText();
  chkF('El modal del SEGUNDO Horno Rational muestra el SUYO, distinto', equipoLinea2.includes('SCC101G') && equipoLinea2.includes('G1151180626'));
  chkF('Los dos modales no se confunden entre sí (línea "Equipo" distinta)', equipoLinea1 !== equipoLinea2);

  // --------- 4) El portal de clientes NO recibe modelo/serie, por diseño ---------
  const portalInfo = await page.evaluate(() => {
    const p = datos.polizas.find(x=>x.id==='p1');
    const copia = datosClientePoliza(p);
    return { modelo: copia.partidas[0].modelo, serie: copia.partidas[0].serie, marca: copia.partidas[0].marca };
  });
  chkF('La copia del portal de clientes sigue sin modelo (control interno, a propósito)', portalInfo.modelo === '');
  chkF('...ni serie', portalInfo.serie === '');
  chkF('...pero SÍ conserva la marca (no es información sensible)', portalInfo.marca === 'Rational');

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);
  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
