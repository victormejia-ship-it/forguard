/* Atajo "Fusionar" en el directorio de Activos (15-oct-2026, pedido de
   Victor viendo ese directorio con capturas reales: "NORTEK RHEEM NORTE"
   y "NORTEK RHEMM SUR" como dos tarjetas separadas): "en activos, aplica
   que podamos fusionar clientes con diferentes sitios como se hace con
   cotizaciones, ya que existen varios sitios para el mismo cliente".

   No había nada nuevo que construir en la capa de datos: fusionarClientes()
   (usada desde "Fusionar con otro cliente" en Clientes) YA mueve sitios,
   pólizas, cotizaciones, reportes, levantamientos, proyectos de imagen Y
   ACTIVOS del cliente que se descarta al que se conserva — ver `d.act` en
   esa función. Lo único que faltaba era un atajo para abrir ese mismo
   flujo (`modalFusionCliente`) directamente desde el directorio de
   Activos (`vistaActivosDirectorio`/`tarjetaGrupo`), sin tener que salir a
   buscar el cliente en el módulo Clientes. Se agregó el mismo botón
   "Fusionar" (`data-fusionar-cliente`, ya manejado por el delegate de
   clics global) al pie de cada tarjeta de cliente, solo para Admin/Owner
   (mismo candado que en Clientes: la fusión toca de golpe toda la base de
   un cliente) y solo cuando la tarjeta es de un cliente real — el grupo
   "Activos internos" (sin cliente) no la trae.

   El reto de layout: cada tarjeta ya es clicable por completo
   (`data-activos-grupo`, entra al inventario de ese cliente/grupo). El
   botón "Fusionar" nuevo vive DENTRO de esa tarjeta con su propio
   `data-fusionar-cliente`, y el delegate de clics ya resuelve
   `[data-fusionar-cliente]` ANTES que `[data-activos-grupo]` en la cadena
   de ifs (mismo patrón que los "puentes" de Forpass, ver el comentario
   junto a `data-ir-sitio` en el delegate) — así el clic en "Fusionar"
   nunca dispara también la navegación al inventario.

   De paso se corrigió el texto del modal `modalFusionCliente` (vivía en
   Clientes, sin tocarse): decía "pólizas, cotizaciones, reportes,
   levantamientos y proyectos de imagen" sin mencionar activos, aunque
   SÍ los mueve — ahora los nombra, para no ser engañoso justo cuando se
   dispara desde Activos.

   Esta prueba cubre: que el botón aparece en tarjetas de cliente real y
   NO en "Activos internos"; que el clic abre el modal de fusión sin
   navegar dentro de la tarjeta (regresión directa del posible conflicto
   de clic-delegate); el flujo completo de fusión de verdad (el cliente
   descartado desaparece, su activo se mueve al que se conserva); y que
   sin rol Admin/Owner el botón ni siquiera se dibuja. */
const { chromium } = require('playwright');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
const chk = (label, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' - ' + label); return cond; };
let fallas = 0;
const chkF = (label, cond) => { if(!chk(label, cond)) fallas++; };

(async () => {
  const browser = await chromium.launch(OPCIONES_NAVEGADOR);
  const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
  const errores = [];
  page.on('pageerror', e => errores.push('PAGEERROR: ' + e.message));
  await page.route('**identitytoolkit.googleapis.com/**', r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));
  await page.route('**securetoken.googleapis.com/**', r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));
  await page.route('**firestore.googleapis.com/**', r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));
  await page.goto(URL_BASE + '/index.html');
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    sesion.correo='owner@a.com'; sesion.uid='u-owner'; sesion.idToken='FAKE'; sesion.refreshToken='F2';
    sesion.expira=Date.now()+3600000; sesion.rol='owner'; sesion.nombre='Victor Owner';
    ocultarAcceso();
    datos.clientes = [
      normalizarCliente({ id:'cNorte', nombre:'NORTEK RHEEM NORTE' }),
      normalizarCliente({ id:'cSur', nombre:'NORTEK RHEMM SUR' })
    ];
    datos.sitios = [
      normalizarSitio({ id:'sNorte', clienteId:'cNorte', nombre:'Norte', zona:'CDMX' }),
      normalizarSitio({ id:'sSur', clienteId:'cSur', nombre:'Sur', zona:'CDMX' })
    ];
    datos.activos = [
      normalizarActivo({ id:'a1', tipo:'cliente', nombre:'Refrigerador', clienteId:'cNorte', sitioId:'sNorte', sitioNombre:'Norte', costoCompra:1000 }),
      normalizarActivo({ id:'a2', tipo:'cliente', nombre:'Horno', clienteId:'cSur', sitioId:'sSur', sitioNombre:'Sur', costoCompra:2000 })
    ];
    estado.modulo = 'activos'; estado.activosClienteId = ''; render();
  });
  await page.waitForTimeout(300);

  // --------- 1) El botón "Fusionar" aparece en las tarjetas de cliente real ---------
  chkF('Aparece el botón "Fusionar" en la tarjeta de NORTEK RHEEM NORTE', (await page.locator('[data-fusionar-cliente="cNorte"]').count()) === 1);
  chkF('Aparece también en NORTEK RHEMM SUR', (await page.locator('[data-fusionar-cliente="cSur"]').count()) === 1);

  // --------- 2) "Activos internos" (sin cliente real) NO trae el botón ---------
  await page.evaluate(() => {
    datos.activos.push(normalizarActivo({ id:'a3', tipo:'forguard', nombre:'Taladro' }));
    render();
  });
  await page.waitForTimeout(200);
  chkF('"Activos internos" no es un cliente real — no trae botón de Fusionar',
    (await page.locator('[data-activos-grupo="__interno__"] [data-fusionar-cliente]').count()) === 0);

  // --------- 3) Clic en "Fusionar" abre el modal SIN navegar dentro de la tarjeta ---------
  await page.click('[data-fusionar-cliente="cNorte"]');
  await page.waitForTimeout(200);
  const titulo = await page.evaluate(() => document.getElementById('modalTitulo').textContent.trim());
  chkF('El clic en "Fusionar" abre el modal de fusión (no entra al inventario del cliente)', titulo === 'Fusionar clientes duplicados');
  chkF('La pantalla se queda en Activos, no navegó dentro de la tarjeta (prueba el orden del click-delegate)',
    await page.evaluate(() => estado.activosClienteId === ''));

  // --------- 4) Fusionar de verdad: NORTEK SUR se queda con los activos de ambos ---------
  await page.selectOption('#fcOtro', 'cSur');
  await page.waitForTimeout(150);
  await page.check('input[name="fcConservar"][value="cSur"]');
  await page.waitForTimeout(150);
  const preview = await page.evaluate(() => document.getElementById('fcPreview').textContent);
  chkF('El preview ya muestra los activos de cada candidato (1 activo cada uno)', (preview.match(/1\s*activo/g) || []).length >= 1);
  chkF('El texto introductorio del modal menciona "activos" (ya no se le olvida, igual que mueve pólizas/cotizaciones)',
    (await page.evaluate(() => document.getElementById('modalCuerpo').textContent)).includes('activos'));
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(300);

  const resultado = await page.evaluate(() => ({
    clientesQuedan: datos.clientes.map(c => c.id),
    activoNorteMovido: activoPorId('a1').clienteId,
    totalActivosSur: activosDeCliente('cSur').length
  }));
  chkF('NORTEK RHEEM NORTE (descartado) ya no existe como cliente', !resultado.clientesQuedan.includes('cNorte'));
  chkF('El activo del cliente descartado se movió al que se conservó', resultado.activoNorteMovido === 'cSur');
  chkF('NORTEK RHEMM SUR ahora tiene los 2 activos (el suyo + el movido)', resultado.totalActivosSur === 2);

  // --------- 5) Sin Admin, el botón ni se dibuja ---------
  await page.evaluate(() => { sesion.rol = 'analyst'; estado.modulo = 'activos'; render(); });
  await page.waitForTimeout(200);
  chkF('Un Analyst no ve el botón "Fusionar" en el directorio de Activos', (await page.locator('[data-fusionar-cliente]').count()) === 0);

  chkF('No hubo errores de página en todo el escenario', errores.length === 0);
  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
