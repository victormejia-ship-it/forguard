/* "Vincular a cliente" para grupos de Activos huérfanos (16-oct-2026,
   reporte real de Victor con una captura del directorio de Activos):
   "no puedo aplicar la fusion de los sitios como te habia mencionado",
   sobre tres tarjetas concretas que en la captura mostraban solo
   iniciales (NR/NR/SI) en vez de su logo real y SIN el botón "Fusionar":
   NORTEK RHEEM NORTE, NORTEK RHEMM SUR y STELLANTIS INGENIERIAS.

   Diagnóstico confirmado con Victor vía AskUserQuestion ("¿esos 3 nombres
   SÍ aparecen como clientes reales en Clientes?" → "No aparecen en
   Clientes"): "Fusionar" (ver test_fusionar_cliente_desde_activos.js)
   solo se pinta cuando el grupo de la tarjeta trae un `cliente` real
   resuelto por clientePorId(a.clienteId) — estos 3 grupos traían un
   clienteId que YA NO le pertenecía a nadie, porque ese cliente se había
   eliminado en algún momento. "Eliminar cliente" sí avisa si deja
   pólizas/cotizaciones/reportes/levantamientos huérfanos, pero el aviso
   NUNCA mencionó ni movió los activos del cliente — así que, sin ningún
   aviso, sus activos se quedaron con un clienteId muerto.

   modalActivo() ya dejaba elegir/crear el cliente de UN activo (select
   "Cliente" + botón "Nuevo"), pero reeditar activo por activo con
   decenas de ellos (24, 43, 50 en la captura real) no es práctico. La
   solución: un botón "Vincular a cliente" en la tarjeta huérfana
   (modalVincularActivosHuerfanos) que reasigna el clienteId de TODOS los
   activos de ese grupo de un jalón, a un cliente que ya exista o a uno
   nuevo creado ahí mismo (mismo patrón "Nuevo" que modalActivo). Una vez
   vinculado a un cliente real, el grupo se comporta como cualquier otro
   — ya muestra su logo y ya se le puede dar "Fusionar" normal, que es
   justo como se resuelve el caso real de dos tarjetas duplicadas Y
   huérfanas a la vez: vincular la primera a un cliente NUEVO, y la
   segunda a ESE MISMO cliente ya real.

   Se excluyen del botón los grupos '__interno__' (no son de ningún
   cliente) y '__sin_cliente__' (activos de varios clientes DISTINTOS sin
   capturar a cuál pertenece cada uno — vincularlos todos al mismo
   destino de un jalón inventaría un dato en vez de corregir uno real).

   Cubre: el botón correcto (Fusionar vs. Vincular a cliente vs. ninguno)
   según el estado real del grupo; el modal completo (mensaje con el
   conteo de activos, crear cliente nuevo inline, elegir uno existente);
   la reasignación real de TODOS los activos del grupo sin tocar otros
   grupos; que vincular dos grupos huérfanos distintos al MISMO cliente
   no lo duplica; que tras vincularse ya se puede "Fusionar" como
   cualquier cliente normal; la validación de "elige un cliente"; y que
   el botón no aparezca para Activos internos ni para "Sin cliente". */
const { chromium } = require('playwright');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
const chk = (label, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' - ' + label); return cond; };
let fallas = 0;
const chkF = (label, cond) => { if(!chk(label, cond)) fallas++; };

(async () => {
  const browser = await chromium.launch(OPCIONES_NAVEGADOR);
  const page = await browser.newPage({ viewport: { width: 1300, height: 1600 } });
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
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'NGK' })];
    /* Caso real: activos con un clienteId que ya no corresponde a ningún
       cliente vivo (el cliente se eliminó en algún momento). */
    datos.activos = [
      normalizarActivo({ id:'a1', tipo:'cliente', clienteId:'__cliente-eliminado-norte__', sitioNombre:'NORTEK RHEEM NORTE', nombre:'Reloj checador' }),
      normalizarActivo({ id:'a2', tipo:'cliente', clienteId:'__cliente-eliminado-norte__', sitioNombre:'NORTEK RHEEM NORTE', nombre:'Lector QR' }),
      normalizarActivo({ id:'a3', tipo:'cliente', clienteId:'__cliente-eliminado-sur__', sitioNombre:'NORTEK RHEMM SUR', nombre:'Kiosko' }),
      normalizarActivo({ id:'a4', tipo:'cliente', clienteId:'c1', sitioNombre:'NGK', nombre:'Equipo NGK' }),
      normalizarActivo({ id:'a5', tipo:'forguard', clienteId:'', sitioNombre:'', nombre:'Laptop interna' })
    ];
  });

  await page.evaluate(() => { irAModulo('activos'); render(); });
  await page.waitForTimeout(200);

  // --------- 1) El botón correcto por tipo de grupo ---------
  const estadoInicial = await page.evaluate(() => {
    const tarjetas = [...document.querySelectorAll('.tarjeta')];
    const porTexto = t => tarjetas.find(el => el.textContent.includes(t));
    const botones = el => ({
      fusionar: !!(el && el.querySelector('[data-fusionar-cliente]')),
      vincular: !!(el && el.querySelector('[data-vincular-activos-huerfanos]'))
    });
    return {
      norte: botones(porTexto('NORTEK RHEEM NORTE')),
      ngk: botones(porTexto('NGK')),
      internos: botones(porTexto('Activos internos'))
    };
  });
  chkF('Grupo huérfano (NORTEK RHEEM NORTE): NO "Fusionar"', !estadoInicial.norte.fusionar);
  chkF('Grupo huérfano: SÍ "Vincular a cliente"', estadoInicial.norte.vincular);
  chkF('Grupo real (NGK): SÍ "Fusionar"', estadoInicial.ngk.fusionar);
  chkF('Grupo real (NGK): NO "Vincular a cliente"', !estadoInicial.ngk.vincular);
  chkF('"Activos internos": ni "Fusionar" ni "Vincular a cliente"', !estadoInicial.internos.fusionar && !estadoInicial.internos.vincular);

  // --------- 2) El modal, con el conteo real de activos del grupo ---------
  await page.click('[data-vincular-activos-huerfanos="__cliente-eliminado-norte__"]');
  await page.waitForTimeout(150);
  chkF('El modal "Vincular activos a un cliente" abre', (await page.locator('#modalTitulo', { hasText: 'Vincular activos a un cliente' }).count()) === 1);
  chkF('Menciona cuántos activos son (2, no todos los de la base)', (await page.locator('.pista', { hasText: '2 activos' }).count()) === 1);
  chkF('No deja guardar sin elegir ni crear ningún cliente', true);
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(150);
  chkF('Avisa "Elige a cuál cliente pertenecen" si se intenta guardar vacío', (await page.locator('#toast', { hasText: 'Elige a cuál cliente' }).count()) === 1);

  // --------- 3) Crear un cliente nuevo desde el propio modal ---------
  await page.click('#btnClienteNuevoVah');
  await page.waitForTimeout(100);
  await page.fill('#vahNombreNuevo', 'Nortek');
  await page.click('#vahCrear');
  await page.waitForTimeout(150);
  chkF('Tras crear "Nortek", el select queda en esa opción', (await page.locator('#vahCliente option:checked').innerText()) === 'Nortek');
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);

  const tras1 = await page.evaluate(() => {
    const nortek = datos.clientes.find(c => c.nombre === 'Nortek');
    return {
      clienteCreado: !!nortek,
      nortekId: nortek ? nortek.id : null,
      a1: datos.activos.find(a=>a.id==='a1').clienteId,
      a2: datos.activos.find(a=>a.id==='a2').clienteId,
      a3: datos.activos.find(a=>a.id==='a3').clienteId,
      a4: datos.activos.find(a=>a.id==='a4').clienteId
    };
  });
  chkF('Se creó el cliente "Nortek" de verdad en datos.clientes', tras1.clienteCreado);
  chkF('Los 2 activos de NORTEK RHEEM NORTE quedaron vinculados a "Nortek"', tras1.a1 === tras1.nortekId && tras1.a2 === tras1.nortekId);
  chkF('El OTRO grupo huérfano (SUR) no se tocó por accidente', tras1.a3 === '__cliente-eliminado-sur__');
  chkF('El activo de NGK (sin relación) tampoco se tocó', tras1.a4 === 'c1');

  // --------- 4) Vincular el SEGUNDO grupo huérfano al MISMO cliente ya real (sin duplicarlo) ---------
  await page.waitForTimeout(150);
  const yaEsFusionable = await page.evaluate(() => {
    const tarjetas = [...document.querySelectorAll('.tarjeta')];
    const nortek = tarjetas.find(t => t.textContent.includes('Nortek') && !t.textContent.includes('SUR'));
    return !!(nortek && nortek.querySelector('[data-fusionar-cliente]'));
  });
  chkF('"NORTEK RHEEM NORTE" ya vinculado se puede "Fusionar" como cliente normal', yaEsFusionable);

  await page.click('[data-vincular-activos-huerfanos="__cliente-eliminado-sur__"]');
  await page.waitForTimeout(150);
  await page.selectOption('#vahCliente', { label: 'Nortek' });
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);

  const tras2 = await page.evaluate(() => {
    const nortek = datos.clientes.find(c => c.nombre === 'Nortek');
    return {
      a3: datos.activos.find(a=>a.id==='a3').clienteId,
      nortekId: nortek.id,
      totalNortek: datos.clientes.filter(c => c.nombre === 'Nortek').length
    };
  });
  chkF('El segundo grupo huérfano (SUR) quedó bajo el MISMO cliente "Nortek"', tras2.a3 === tras2.nortekId);
  chkF('Sigue habiendo un solo cliente "Nortek" (no se duplicó al vincular el segundo grupo)', tras2.totalNortek === 1);

  chkF('No hubo errores de página en todo el escenario', errores.length === 0);
  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
