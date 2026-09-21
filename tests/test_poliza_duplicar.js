/* Pedido de Victor (21-sep-2026, punto 1): "a las polizas que podamos
   agregar un item donde podamos copiar la poliza, debido a que existen
   clientes que año con año se renuevan y para no teclear todo sería ideal
   solo copiar para modificar la nueva vigencia". Duplicar debe prellenar
   cliente, sitio, equipos (precios/frecuencias/meses), facturación, cargo,
   ajuste, precios de grupo y notas — pero arrancar como cotización nueva
   de cero: folio libre, estatus "Borrador", fechaCotización = hoy,
   Inicio de la vigencia = el default de siempre (mes que sigue), sin
   cobros ni servicios ejecutados. */
const { chromium } = require('playwright');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
const chk = (label, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' - ' + label); return cond; };
let fallas = 0;
const chkF = (label, cond) => { if(!chk(label, cond)) fallas++; };

(async () => {
  const browser = await chromium.launch(OPCIONES_NAVEGADOR);
  const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });
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
    datos.sitios = [normalizarSitio({ id:'s1', clienteId:'c1', nombre:'Daimler Derramadero' })];
    datos.polizas = [normalizarPoliza({
      id:'p1', clienteId:'c1', sitioId:'s1', folio:'POL-037', sitioNombre:'Daimler Derramadero',
      estatus:'activa', facturacion:'anual', cargoA:'interno', cargoAInterno:'Plato Express',
      descuento:-33, usaPreciosGrupo:true, notas:'Nota original de la póliza fuente.',
      fechaInicio:'2024-01-01', fechaCotizacion:'2024-01-01', fechaCierre:'2024-01-01',
      partidas: [
        { id:'x1', concepto:'Horno industrial', marca:'Rational', cantidad:2, precioUnitario:5000, frecuencia:3, mesesServicio:[0,4,8] },
        { id:'x2', concepto:'Cámara de refrigeración', cantidad:1, precioUnitario:8000, frecuencia:1, mesesServicio:[0] }
      ],
      cobros:[true]
    })];
    irAModulo('polizas');
  });
  await page.waitForTimeout(250);

  // --------- Botón "Duplicar" en la tarjeta ---------
  chkF('La tarjeta trae el botón de duplicar', await page.locator('[data-duplicar-poliza="p1"]').count() === 1);
  await page.click('[data-duplicar-poliza="p1"]');
  await page.waitForTimeout(200);

  chkF('Se abre el modal titulado "Duplicar póliza POL-037"', (await page.textContent('#modalTitulo')).includes('Duplicar póliza POL-037'));
  chkF('El cliente viene prellenado (DAIMLER)', await page.locator('#pCliente').inputValue() === 'c1');
  chkF('El nombre del sitio viene prellenado', await page.inputValue('#pSitioNombre') === 'Daimler Derramadero');
  chkF('El folio NO se copia: viene un folio nuevo distinto de POL-037', (await page.inputValue('#pFolio')) !== 'POL-037' && (await page.inputValue('#pFolio')).length > 0);
  chkF('El estatus arranca en Borrador (cotización), no "activa"', await page.locator('#pEstatus').inputValue() === 'cotizacion');
  chkF('Fecha de cotización es HOY, no la de la póliza original (2024-01-01)', (await page.inputValue('#pCotizacion')) !== '2024-01-01');
  chkF('Inicio de vigencia NO es el de la póliza original (2024-01-01)', (await page.inputValue('#pInicio')) !== '2024-01-01');
  chkF('Facturación se copió (anual)', await page.locator('#pFacturacion').inputValue() === 'anual');
  chkF('Cargo a se copió (interno)', await page.locator('#pCargoA').inputValue() === 'interno');
  chkF('El texto de "a quién se le carga" se copió (Plato Express)', await page.inputValue('#pCargoAInterno') === 'Plato Express');
  chkF('El ajuste se copió: tipo Aumento', await page.locator('#pTipoAjuste').inputValue() === 'aumento');
  chkF('El ajuste se copió: 33%', await page.inputValue('#pDescuento') === '33');
  chkF('"Usar precios de grupo" se copió (marcado)', await page.isChecked('#pUsaPreciosGrupo'));
  chkF('Las notas se copiaron', (await page.inputValue('#pNotas')).includes('Nota original'));

  const conceptos = await page.$$eval('#listaPartidas input[data-campo="concepto"]', els => els.map(e => e.value));
  chkF('Los 2 equipos se copiaron con su nombre', conceptos.includes('Horno industrial') && conceptos.includes('Cámara de refrigeración'));

  // --------- Guardar la duplicada: la original sigue intacta ---------
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(250);

  const resumen = await page.evaluate(() => ({
    total: datos.polizas.length,
    original: (() => { const p = polizaPorId('p1'); return { estatus: p.estatus, folio: p.folio, fechaInicio: p.fechaInicio }; })()
  }));
  chkF('Ahora hay 2 pólizas (la original + la duplicada)', resumen.total === 2);
  chkF('La póliza ORIGINAL sigue igual: sigue activa', resumen.original.estatus === 'activa');
  chkF('La póliza ORIGINAL conserva su folio (POL-037)', resumen.original.folio === 'POL-037');
  chkF('La póliza ORIGINAL conserva su vigencia (2024-01-01)', resumen.original.fechaInicio === '2024-01-01');

  console.log('Errores:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
