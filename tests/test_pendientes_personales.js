/* Pedido de Victor (23-sep-2026): "una sección a un costado de cada perfil...
   una franja que se puede ocultar como un modal donde podamos ver la agenda
   de pendientes que pueda capturar cada usuario, utilizarlo como un listado
   de recordatorios de tareas". Se implementó como "Mis pendientes": un botón
   más en el encabezado (junto a la campanita de notificaciones, mismo patrón
   de franja desplegable) donde cada cuenta captura, marca como hecho y borra
   sus propios recordatorios de texto libre — guardado en Firestore
   (colección /pendientes, ver firestore.rules) para que sobreviva a cerrar
   la pestaña, igual que /notificaciones.

   Ampliación, mismo día: cada pendiente ahora también guarda cuándo se creó
   y una fecha de entrega informativa (no disparan ningún aviso, solo se
   muestran y ordenan el listado), y el panel separa "Pendientes" de
   "Realizadas" en dos grupos, cada uno acomodado por fecha de entrega
   (ver ordenarPendientes()). El campo de fecha trae una etiqueta VISIBLE
   ("Fecha de entrega"), no solo un title=, para no confundirla con la
   fecha en que se creó el pendiente (pedido explícito de Victor).

   También se agregó el tema 'mi-cuenta' en el módulo de Ayuda —pedido de
   Victor: "cada aplicación, movimiento o creación, añadirlo en el módulo
   de ayudas"— cubriendo Mi cuenta, notificaciones, Mis pendientes, MFA y
   el cierre de sesión por inactividad, todas funciones que se agregaron
   esta sesión y hasta ahora no tenían guía.

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
            // p1: pendiente, entrega más lejana (28-sep) — debe quedar AL FINAL de los pendientes con fecha.
            { document: { name:'projects/x/databases/(default)/documents/pendientes/p1',
              fields: { usuarioUid:{stringValue:'u-owner'}, texto:{stringValue:'Llamar al cliente NGK'},
                hecho:{booleanValue:false}, creadoEn:{stringValue:'2026-09-20T10:00:00.000Z'}, hechoEn:{stringValue:''},
                fechaEntrega:{stringValue:'2026-09-28'} } } },
            // p3: pendiente, entrega más próxima (22-sep) — debe quedar PRIMERO.
            { document: { name:'projects/x/databases/(default)/documents/pendientes/p3',
              fields: { usuarioUid:{stringValue:'u-owner'}, texto:{stringValue:'Cotizar refacciones'},
                hecho:{booleanValue:false}, creadoEn:{stringValue:'2026-09-18T09:00:00.000Z'}, hechoEn:{stringValue:''},
                fechaEntrega:{stringValue:'2026-09-22'} } } },
            // p4: pendiente, SIN fecha de entrega — debe quedar AL FINAL de todos los pendientes.
            { document: { name:'projects/x/databases/(default)/documents/pendientes/p4',
              fields: { usuarioUid:{stringValue:'u-owner'}, texto:{stringValue:'Pendiente sin fecha'},
                hecho:{booleanValue:false}, creadoEn:{stringValue:'2026-09-21T09:00:00.000Z'}, hechoEn:{stringValue:''},
                fechaEntrega:{stringValue:''} } } },
            // p2: ya realizado.
            { document: { name:'projects/x/databases/(default)/documents/pendientes/p2',
              fields: { usuarioUid:{stringValue:'u-owner'}, texto:{stringValue:'Ya resuelto'},
                hecho:{booleanValue:true}, creadoEn:{stringValue:'2026-09-19T10:00:00.000Z'}, hechoEn:{stringValue:'2026-09-19T12:00:00.000Z'},
                fechaEntrega:{stringValue:''} } } }
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
    orden: pend.lista.map(p => p.id), // p3 (22-sep) < p1 (28-sep) < p4 (sin fecha) < p2 (hecho)
  }));
  chkF('Se cargan los 4 pendientes de esta cuenta', trasCargar.total === 4);
  chkF('El contador solo cuenta los NO hechos (3)', trasCargar.activos === 3);
  chkF('El punto de aviso se muestra con el número correcto', trasCargar.puntoOculto === false && trasCargar.puntoTexto === '3');
  chkF('Se acomodan por fecha de entrega (más próxima primero), sin fecha al final, hechos hasta el fondo',
    trasCargar.orden.join(',') === 'p3,p1,p4,p2');

  // --------- 3) Abrir la franja: separa "Pendientes" de "Realizadas", con fechas informativas ---------
  await page.click('#btnPendientes');
  await page.waitForTimeout(120);
  const conPanelAbierto = await page.evaluate(() => {
    const texto = document.getElementById('panelPendientes').textContent;
    return {
      panelOculto: document.getElementById('panelPendientes').hidden,
      tituloPendientes: texto.includes('Pendientes (3)'),
      tituloRealizadas: texto.includes('Realizadas (1)'),
      hechoTachado: document.querySelector('[data-pend-id="p2"]').classList.contains('hecho'),
      hechoChecado: document.querySelector('[data-pend-id="p2"] .pend-check').checked,
      activoSinChecar: document.querySelector('[data-pend-id="p1"] .pend-check').checked === false,
      fechasDeP1: document.querySelector('[data-pend-id="p1"] .pend-fechas').textContent,
      fechasDeP4: document.querySelector('[data-pend-id="p4"] .pend-fechas').textContent,
    };
  });
  chkF('Clic en el botón abre la franja de pendientes', conPanelAbierto.panelOculto === false);
  chkF('Se ve el grupo "Pendientes" con su contador (3)', conPanelAbierto.tituloPendientes);
  chkF('Se ve el grupo "Realizadas" con su contador (1)', conPanelAbierto.tituloRealizadas);
  chkF('El pendiente ya hecho se ve tachado', conPanelAbierto.hechoTachado);
  chkF('...y su checkbox aparece marcado', conPanelAbierto.hechoChecado);
  chkF('El pendiente activo NO aparece marcado', conPanelAbierto.activoSinChecar);
  chkF('Se muestra cuándo se creó y su fecha de entrega, como dato informativo', /Creado: 20 sep 2026/.test(conPanelAbierto.fechasDeP1) && /Entrega: 28 sep 2026/.test(conPanelAbierto.fechasDeP1));
  chkF('Un pendiente sin fecha de entrega solo muestra "Creado", sin "Entrega"', /Creado: 21 sep 2026/.test(conPanelAbierto.fechasDeP4) && !/Entrega/.test(conPanelAbierto.fechasDeP4));

  // El <input type=date> del formulario trae una etiqueta VISIBLE (no solo un
  // title=, que es un tooltip fácil de no ver) para no confundirlo con la
  // fecha en que se creó el pendiente — pedido explícito de Victor.
  const etiquetaFechaVisible = await page.evaluate(() => {
    const etiqueta = document.querySelector('.pend-fecha-etiqueta');
    return !!etiqueta && etiqueta.textContent.trim().startsWith('Fecha de entrega')
      && etiqueta.querySelector('#pendFechaEntrega') !== null;
  });
  chkF('El campo de fecha del formulario trae la etiqueta visible "Fecha de entrega"', etiquetaFechaVisible);

  // Clic fuera de la franja: se cierra sola, como cualquier menú desplegable.
  await page.mouse.click(10, 10);
  await page.waitForTimeout(120);
  const trasClicFuera = await page.evaluate(() => document.getElementById('panelPendientes').hidden);
  chkF('Un clic fuera de la franja la cierra', trasClicFuera === true);

  // --------- 4) Capturar un pendiente nuevo, con fecha de entrega, desde la franja ---------
  await page.click('#btnPendientes');
  await page.waitForTimeout(120);
  await page.fill('#pendTexto', 'Revisar contrato de la póliza');
  await page.fill('#pendFechaEntrega', '2026-09-24'); // entre p3 (22-sep) y p1 (28-sep)
  await page.press('#pendTexto', 'Enter');
  await page.waitForTimeout(150);
  const trasAgregar = await page.evaluate(() => ({
    total: pend.lista.length,
    campoVacio: document.getElementById('pendTexto').value === '',
    escrito: window._escrituras[window._escrituras.length - 1],
    orden: pend.lista.filter(p => !p.hecho).map(p => p.id),
  }));
  chkF('El nuevo pendiente se agrega a la lista en memoria', trasAgregar.total === 5);
  chkF('El campo de texto se limpia tras capturarlo', trasAgregar.campoVacio);
  chkF('Se manda a guardar con el texto y la fecha de entrega correctos, sin marcar como hecho', trasAgregar.escrito
    && trasAgregar.escrito.fields.texto.stringValue === 'Revisar contrato de la póliza'
    && trasAgregar.escrito.fields.fechaEntrega.stringValue === '2026-09-24'
    && trasAgregar.escrito.fields.hecho.booleanValue === false
    && trasAgregar.escrito.fields.usuarioUid.stringValue === 'u-owner');
  const nuevoIdCapturado = trasAgregar.orden.find(id => !['p3','p1','p4'].includes(id));
  chkF('El nuevo pendiente se intercala por su fecha de entrega (entre p3 y p1), no al principio ni al final',
    trasAgregar.orden.join(',') === ['p3', nuevoIdCapturado, 'p1', 'p4'].join(','));

  // --------- 5) Marcar un pendiente como hecho ---------
  await page.click('[data-pend-id="p1"] .pend-check');
  await page.waitForTimeout(150);
  const trasMarcar = await page.evaluate(() => ({
    p1Hecho: pend.lista.find(p => p.id === 'p1').hecho,
    activos: pend.lista.filter(p => !p.hecho).length,
    escrito: window._escrituras[window._escrituras.length - 1],
  }));
  chkF('Al tocar el checkbox, el pendiente queda marcado como hecho', trasMarcar.p1Hecho === true);
  chkF('El contador de activos baja', trasMarcar.activos === 3);
  chkF('Se manda a guardar el cambio con hecho:true', trasMarcar.escrito && trasMarcar.escrito.fields.hecho.booleanValue === true);

  // --------- 6) Borrar un pendiente ---------
  await page.click('[data-pend-id="p2"] .pend-borrar');
  await page.waitForTimeout(150);
  const trasBorrar = await page.evaluate(() => ({
    total: pend.lista.length,
    siguePresente: pend.lista.some(p => p.id === 'p2'),
  }));
  chkF('El pendiente borrado desaparece de la lista', trasBorrar.total === 4 && trasBorrar.siguePresente === false);
  const seBorroEnServidor = await page.evaluate(() => window._borrados.some(r => r.indexOf('/pendientes/p2') === 0));
  chkF('Se manda a borrar el documento correcto en el servidor', seBorroEnServidor);

  // --------- 7) La función queda documentada en el módulo de Ayuda ---------
  // Pedido de Victor: "cada aplicación, movimiento o creación, añadirlo en
  // el módulo de ayudas" — se agregó el tema 'mi-cuenta' cubriendo Mi
  // cuenta, notificaciones, Mis pendientes, MFA y el cierre por inactividad.
  const ayuda = await page.evaluate(() => {
    const tema = typeof temaAyudaPorId === 'function' ? temaAyudaPorId('mi-cuenta') : null;
    const contenido = tema ? (typeof tema.contenido === 'function' ? tema.contenido() : tema.contenido) : '';
    return { existe: !!tema, mencionaPendientes: contenido.includes('Mis pendientes'), mencionaMfa: /verificaci.n en dos pasos/i.test(contenido) };
  });
  chkF('Existe un tema de Ayuda para esta pantalla del encabezado', ayuda.existe);
  chkF('...y menciona "Mis pendientes"', ayuda.mencionaPendientes);
  chkF('...y menciona la verificación en dos pasos (MFA)', ayuda.mencionaMfa);

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
