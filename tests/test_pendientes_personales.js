/* Pedido de Victor (23-sep-2026): "una sección a un costado de cada perfil...
   una franja que se puede ocultar como un modal donde podamos ver la agenda
   de pendientes que pueda capturar cada usuario, utilizarlo como un listado
   de recordatorios de tareas". Se implementó como "Mis pendientes": un botón
   más en el encabezado (junto a la campanita de notificaciones, mismo patrón
   de franja desplegable) donde cada cuenta captura, marca como hecho y borra
   sus propios recordatorios de texto libre — guardado en Firestore
   (colección /pendientes, ver firestore.rules) para que sobreviva a cerrar
   la pestaña, igual que /notificaciones.

   Firestore de mentiras (mismo criterio que test_veredicto_conflicto_edicion.js
   y test_seguridad_mfa.js): se sobreescribe window.pedirNube en vez de hablar
   con Firebase de verdad. */
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
  await page.goto(URL_BASE + '/index.html');
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    sesion.correo='owner@a.com'; sesion.uid='u-owner'; sesion.idToken='FAKE'; sesion.refreshToken='F2';
    sesion.expira=Date.now()+3600000; sesion.rol='owner'; sesion.nombre='Victor Owner';
    ocultarAcceso();
    render();

    window._escrituras = [];
    window._borrados = [];
    window.pedirNube = async (ruta, opciones) => {
      if(ruta === ':runQuery'){
        const cuerpo = JSON.parse(opciones.body);
        if(cuerpo.structuredQuery.from[0].collectionId === 'pendientes'){
          return [
            { document: { name:'projects/x/databases/(default)/documents/pendientes/p1',
              fields: { usuarioUid:{stringValue:'u-owner'}, texto:{stringValue:'Llamar al cliente NGK'},
                hecho:{booleanValue:false}, creadoEn:{stringValue:'2026-09-20T10:00:00.000Z'}, hechoEn:{stringValue:''} } } },
            { document: { name:'projects/x/databases/(default)/documents/pendientes/p2',
              fields: { usuarioUid:{stringValue:'u-owner'}, texto:{stringValue:'Ya resuelto'},
                hecho:{booleanValue:true}, creadoEn:{stringValue:'2026-09-19T10:00:00.000Z'}, hechoEn:{stringValue:'2026-09-19T12:00:00.000Z'} } } }
          ];
        }
        return [];
      }
      if(opciones && opciones.method === 'PATCH' && ruta.indexOf('/pendientes/') === 0){
        window._escrituras.push(JSON.parse(opciones.body));
        return {};
      }
      if(opciones && opciones.method === 'DELETE' && ruta.indexOf('/pendientes/') === 0){
        window._borrados.push(ruta);
        return {};
      }
      return {};
    };
  });

  // --------- 1) El botón se muestra para un rol interno (no cliente) ---------
  const botonVisible = await page.evaluate(() => { pintarCabecera(); return getComputedStyle(document.getElementById('btnPendientes')).display !== 'none'; });
  chkF('El botón "Mis pendientes" se muestra para Owner', botonVisible);

  // --------- 2) Carga inicial: cuenta activos y arma el listado ---------
  await page.evaluate(() => cargarPendientes());
  await page.waitForTimeout(150);
  const trasCargar = await page.evaluate(() => ({
    total: pend.lista.length,
    activos: pend.lista.filter(p => !p.hecho).length,
    puntoOculto: document.getElementById('btnPendientes').querySelector('.punto-alerta').hidden,
    puntoTexto: document.getElementById('btnPendientes').querySelector('.punto-alerta').textContent,
  }));
  chkF('Se cargan los 2 pendientes de esta cuenta', trasCargar.total === 2);
  chkF('El contador solo cuenta los NO hechos (1)', trasCargar.activos === 1);
  chkF('El punto de aviso se muestra (hay 1 activo)', trasCargar.puntoOculto === false && trasCargar.puntoTexto === '1');

  // --------- 3) Abrir la franja: es un panel que se puede ocultar, como un modal ---------
  await page.click('#btnPendientes');
  await page.waitForTimeout(120);
  const conPanelAbierto = await page.evaluate(() => ({
    panelOculto: document.getElementById('panelPendientes').hidden,
    traeAmbosTextos: document.getElementById('panelPendientes').textContent.includes('Llamar al cliente NGK')
      && document.getElementById('panelPendientes').textContent.includes('Ya resuelto'),
    hechoTachado: document.querySelector('[data-pend-id="p2"]').classList.contains('hecho'),
    hechoChecado: document.querySelector('[data-pend-id="p2"] .pend-check').checked,
    activoSinChecar: document.querySelector('[data-pend-id="p1"] .pend-check').checked === false,
  }));
  chkF('Clic en el botón abre la franja de pendientes', conPanelAbierto.panelOculto === false);
  chkF('Se ven los 2 pendientes con su texto', conPanelAbierto.traeAmbosTextos);
  chkF('El pendiente ya hecho se ve tachado', conPanelAbierto.hechoTachado);
  chkF('...y su checkbox aparece marcado', conPanelAbierto.hechoChecado);
  chkF('El pendiente activo NO aparece marcado', conPanelAbierto.activoSinChecar);

  // Clic fuera de la franja: se cierra sola, como cualquier menú desplegable.
  await page.mouse.click(10, 10);
  await page.waitForTimeout(120);
  const trasClicFuera = await page.evaluate(() => document.getElementById('panelPendientes').hidden);
  chkF('Un clic fuera de la franja la cierra', trasClicFuera === true);

  // --------- 4) Capturar un pendiente nuevo, desde la franja ---------
  await page.click('#btnPendientes');
  await page.waitForTimeout(120);
  await page.fill('#pendTexto', 'Revisar contrato de la póliza');
  await page.press('#pendTexto', 'Enter');
  await page.waitForTimeout(150);
  const trasAgregar = await page.evaluate(() => ({
    total: pend.lista.length,
    campoVacio: document.getElementById('pendTexto').value === '',
    escrito: window._escrituras[window._escrituras.length - 1],
  }));
  chkF('El nuevo pendiente se agrega a la lista en memoria', trasAgregar.total === 3);
  chkF('El campo de texto se limpia tras capturarlo', trasAgregar.campoVacio);
  chkF('Se manda a guardar con el texto correcto, sin marcar como hecho', trasAgregar.escrito
    && trasAgregar.escrito.fields.texto.stringValue === 'Revisar contrato de la póliza'
    && trasAgregar.escrito.fields.hecho.booleanValue === false
    && trasAgregar.escrito.fields.usuarioUid.stringValue === 'u-owner');

  // --------- 5) Marcar un pendiente como hecho ---------
  await page.click('[data-pend-id="p1"] .pend-check');
  await page.waitForTimeout(150);
  const trasMarcar = await page.evaluate(() => ({
    p1Hecho: pend.lista.find(p => p.id === 'p1').hecho,
    activos: pend.lista.filter(p => !p.hecho).length,
    escrito: window._escrituras[window._escrituras.length - 1],
  }));
  chkF('Al tocar el checkbox, el pendiente queda marcado como hecho', trasMarcar.p1Hecho === true);
  chkF('El contador de activos baja (ya solo queda el nuevo)', trasMarcar.activos === 1);
  chkF('Se manda a guardar el cambio con hecho:true', trasMarcar.escrito && trasMarcar.escrito.fields.hecho.booleanValue === true);

  // --------- 6) Borrar un pendiente ---------
  await page.click('[data-pend-id="p2"] .pend-borrar');
  await page.waitForTimeout(150);
  const trasBorrar = await page.evaluate(() => ({
    total: pend.lista.length,
    siguePresente: pend.lista.some(p => p.id === 'p2'),
  }));
  chkF('El pendiente borrado desaparece de la lista', trasBorrar.total === 2 && trasBorrar.siguePresente === false);
  const seBorroEnServidor = await page.evaluate(() => window._borrados.some(r => r.indexOf('/pendientes/p2') === 0));
  chkF('Se manda a borrar el documento correcto en el servidor', seBorroEnServidor);

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
