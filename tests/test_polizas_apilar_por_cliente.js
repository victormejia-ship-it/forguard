/* "Apilar por cliente" en Pólizas (27-oct-2026, pedido de Victor viendo la
   lista en tarjetas: "podrías generar un apilamiento por cliente en caso de
   ser necesario, actualmente esta perfecta esta vista, solo requiero se
   pueda tener una opcion de apilar por cliente").

   Mismo criterio que el toggle de tres modos que ya tenía Proyecto de
   Imagen (tarjetas/tabla/calendario, ver vistaProyectosImagen): se agrega
   un TERCER botón a estado.vistaPolizas ("clientes") en vez de reemplazar
   el de siempre — el modo "tarjetas" por omisión queda intacto, como pidió
   Victor explícitamente ("actualmente esta perfecta esta vista"). Las
   tarjetas en sí no cambian ni un pixel entre un modo y otro: se factorizó
   tarjetasPolizas(sublista) para reusar exactamente el mismo molde, tanto
   en el grid plano como, agrupado, bajo cada encabezado de cliente (ver
   agrupadasPorClientePolizas). Orden alfabético por cliente, insensible a
   mayúsculas/acentos (mismo criterio que el resto de los órdenes
   alfabéticos de esta semana); una póliza sin cliente ligado (huérfana) cae
   en un grupo "Sin cliente ligado" al final, nunca se pierde. */
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
    datos.clientes = [
      normalizarCliente({ id:'c1', nombre:'Zetafin' }),
      normalizarCliente({ id:'c2', nombre:'ACME' })
    ];
    const molde = (id, clienteId, folio, sitio) => normalizarPoliza({
      id, clienteId, folio, sitioNombre: sitio, estatus:'activa', facturacion:'anual',
      fechaInicio:'2026-01-01', fechaCotizacion:'2026-01-01', cargoA:'cliente',
      partidas: [{ id:'x1', concepto:'Equipo', cantidad:1, precioUnitario:7000, costoUnitario:1000, frecuencia:1, mesesServicio:[0] }],
      cobros:[true]
    });
    datos.polizas = [
      molde('p1','c1','POL-001','Sitio Zetafin 1'),
      molde('p2','c2','POL-002','Sitio ACME 1'),
      molde('p3','c2','POL-003','Sitio ACME 2'),
      molde('p4',null,'POL-004','Sitio huérfano')
    ];
    irAModulo('polizas');
  });

  // --------- 1) Por omisión sigue en tarjetas, plano, sin encabezados ---------
  const sinAgrupar = await page.$$eval('.cabecera-grupo-cliente', els => els.length);
  chkF('Por omisión (sin tocar nada) la lista sigue plana, sin agrupar — el modo de siempre no cambió', sinAgrupar === 0);
  chkF('El botón "Apilar por cliente" existe en la barra de la lista', (await page.locator('.barra-busca [data-modo="clientes"]').count()) === 1);

  // --------- 2) Al activar "Por cliente", agrupa alfabéticamente (ACME antes que Zetafin) ---------
  await page.click('.barra-busca [data-modo="clientes"]');
  await page.waitForTimeout(150);
  const encabezados = await page.$$eval('.cabecera-grupo-cliente', els => els.map(e => e.textContent.trim()));
  chkF('Los grupos salen en orden alfabético por cliente (ACME antes que Zetafin), no en el orden de captura',
    JSON.stringify(encabezados) === JSON.stringify(['ACME · 2 pólizas · $14,000 al año', 'Zetafin · 1 póliza · $7,000 al año', 'Sin cliente ligado · 1 póliza · $7,000 al año']));

  const agrupado = await page.evaluate(() => {
    const nodos = [...document.getElementById('vista').querySelectorAll('.cabecera-grupo-cliente, .tarjeta')];
    const out = []; let actual = null;
    nodos.forEach(n => {
      if(n.classList.contains('cabecera-grupo-cliente')){ actual = n.textContent.trim(); out.push({ grupo: actual, polizas: [] }); }
      else out[out.length - 1].polizas.push(n.dataset.poliza);
    });
    return out;
  });
  chkF('Cada póliza cae bajo el grupo de SU PROPIO cliente (p2 y p3 bajo ACME, p1 bajo Zetafin)',
    JSON.stringify(agrupado[0].polizas.sort()) === JSON.stringify(['p2','p3']) && JSON.stringify(agrupado[1].polizas) === JSON.stringify(['p1']));
  chkF('La póliza sin cliente ligado (p4) cae en su propio grupo "Sin cliente ligado", al final, no se pierde',
    agrupado[2].grupo.startsWith('Sin cliente ligado') && JSON.stringify(agrupado[2].polizas) === JSON.stringify(['p4']));

  // --------- 3) La tarjeta en sí es IDÉNTICA a la del modo plano (mismo molde, factorizado) ---------
  const tarjetaAgrupada = await page.locator('[data-poliza="p2"]').innerHTML();
  await page.evaluate(() => { estado.vistaPolizas = 'tarjetas'; render(); });
  await page.waitForTimeout(100);
  const tarjetaPlana = await page.locator('[data-poliza="p2"]').innerHTML();
  chkF('La tarjeta de una póliza es exactamente la misma agrupada que en el grid plano (misma función, sin duplicar el molde)',
    tarjetaAgrupada === tarjetaPlana);

  // --------- 4) El modo "tabla" de siempre sigue funcionando sin tocarse ---------
  await page.evaluate(() => { estado.vistaPolizas = 'tabla'; render(); });
  await page.waitForTimeout(100);
  chkF('El modo "tabla" de siempre sigue intacto (no se rompió al agregar el tercer botón)',
    (await page.locator('table.tabla').count()) >= 1);

  chkF('No hubo errores de página en todo el escenario', errores.length === 0);
  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
