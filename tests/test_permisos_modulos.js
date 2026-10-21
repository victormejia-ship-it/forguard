/* Cuadrante de permisos por módulo (12-oct-2026, pedido de Victor: "necesito
   deseo crear una modulo en una pagina web que pueda contener todos los
   modulos de contenido de la misma pagina y pueda seleccionar conforme a un
   roll de cuenta... que sea un estilo cuadrante para seleccionar quien puede
   ver que cosa").

   Hasta antes de esto, qué módulo veía cada rol estaba escrito a mano en
   modulosPermitidos() — un if por rol, solo editable tocando código. Ahora
   la fuente de verdad es datos.permisosModulos (documento único, mismo
   molde que /segmentos), y la pantalla vive dentro de Administración →
   "Permisos por módulo" (no un módulo nuevo en el menú principal: es
   configuración de cuentas, el mismo lugar donde ya se crean/bloquean
   cuentas) — un cuadrante Módulo×Rol con un checkbox por cruce.

   Decisiones de diseño: Owner se enseña fijo y deshabilitado (siempre ve
   todo, no se puede quitar ni por accidente, ver modulosPermitidos());
   Cliente ni aparece (tiene su portal aparte); 'mi-agenda' tampoco aparece
   como fila (es de Técnico siempre, ni vive en MODULOS). Los arreglos de
   PERMISOS_MODULOS_DEFAULT son el valor de ARRANQUE: hasta que un Admin
   guarde algo, el comportamiento es IDÉNTICO al que tenía la app antes de
   este cambio (verificado abajo, módulo por módulo, contra lo que tenía
   modulosPermitidos() escrito a mano). permisosModulosDeRol() siempre
   devuelve en el orden de MODULOS (nunca el orden en que se guardaron los
   checkboxes) — de eso depende que modulosPermitidos()[0] (la pantalla de
   "inicio" de ese rol) sea siempre la misma. */
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
    admin.usuarios = []; admin.bitacora = [];
    estado.vista = 'admin';
    render();
  });
  await page.waitForTimeout(300);

  // --------- 1) El cuadrante arranca sin romper nada, una fila por módulo ---------
  chkF('El bloque "Permisos por módulo" aparece en Administración', await page.locator('h3:has-text("Permisos por módulo")').count() === 1);
  const filas = await page.evaluate(() => MODULOS.length);
  chkF('Hay una fila por cada módulo de MODULOS', await page.locator('table.tabla tbody tr').count() === filas);
  chkF('"Mi agenda" no aparece como fila (no vive en MODULOS)', !(await page.locator('table.tabla tbody').textContent()).includes('Mi agenda'));

  // --------- 2) Owner: fijo, marcado, deshabilitado — no se puede tocar ---------
  const ownerChecks = page.locator('table.tabla tbody tr td:nth-child(2) input[type="checkbox"]');
  chkF('Los checkboxes de la columna Owner están todos marcados', (await ownerChecks.evaluateAll(els => els.every(e => e.checked))));
  chkF('...y todos deshabilitados (no se puede desmarcar a Owner)', (await ownerChecks.evaluateAll(els => els.every(e => e.disabled))));

  // --------- 3) Los valores de arranque coinciden EXACTO con lo que ya tenía la app ---------
  const arranque = await page.evaluate(() => {
    const roles = ['admin','analyst','viewer','tecnico','reportero','control_activos'];
    const out = {};
    roles.forEach(r => out[r] = permisosModulosDeRol(r));
    return out;
  });
  chkF('Admin de arranque: todo MENOS organigrama/activos/equipos', !arranque.admin.includes('organigrama') && !arranque.admin.includes('activos') && !arranque.admin.includes('equipos') && arranque.admin.includes('crm') && arranque.admin.includes('rational'));
  chkF('Analyst de arranque: igual que Admin', JSON.stringify(arranque.analyst) === JSON.stringify(arranque.admin));
  chkF('Viewer de arranque: igual que Admin/Analyst', JSON.stringify(arranque.viewer) === JSON.stringify(arranque.admin));
  chkF('Técnico de arranque: su puñado de siempre (sin mi-agenda, eso se suma aparte)', JSON.stringify(arranque.tecnico) === JSON.stringify(['reportes','levantamientos','visitas','polizas','cotizaciones','rational','ayuda']));
  chkF('Reportero de arranque: Reportes/Levantamientos/Ayuda nada más', JSON.stringify(arranque.reportero) === JSON.stringify(['reportes','levantamientos','ayuda']));
  chkF('control_activos de arranque: solo Activos', JSON.stringify(arranque.control_activos) === JSON.stringify(['activos']));

  // --------- 4) Marcar un módulo nuevo para un rol y guardar lo deja guardado de verdad ---------
  chkF('reportero:crm arranca SIN marcar', !(await page.locator('[data-permiso-modulo="reportero:crm"]').isChecked()));
  await page.check('[data-permiso-modulo="reportero:crm"]');
  await page.click('[data-accion="guardar-permisos-modulos"]');
  await page.waitForTimeout(200);
  const guardadoReportero = await page.evaluate(() => datos.permisosModulos.reportero);
  chkF('Queda guardado de verdad en datos.permisosModulos', guardadoReportero.includes('crm'));
  chkF('...en el orden de MODULOS, no en el orden en que se marcó', JSON.stringify(guardadoReportero) === JSON.stringify(['crm','reportes','levantamientos','ayuda']));

  // --------- 5) El cambio de verdad cambia lo que ese rol puede ver ---------
  const reporteroVeCrm = await page.evaluate(() => { sesion.rol='reportero'; return modulosPermitidos().includes('crm'); });
  chkF('Reportero AHORA sí ve el módulo CRM', reporteroVeCrm);
  chkF('...y su "inicio" pasa a ser CRM, por ir antes que Reportes en MODULOS (orden canónico, no el orden en que se marcó)', await page.evaluate(() => modulosPermitidos()[0] === 'crm'));
  await page.evaluate(() => { sesion.rol='owner'; });

  // --------- 6) Quitarle un módulo a un rol también se respeta ---------
  await page.evaluate(() => { estado.vista='admin'; render(); });
  await page.waitForTimeout(150);
  await page.uncheck('[data-permiso-modulo="tecnico:rational"]');
  await page.click('[data-accion="guardar-permisos-modulos"]');
  await page.waitForTimeout(200);
  const tecnicoVeRational = await page.evaluate(() => { sesion.rol='tecnico'; return modulosPermitidos().includes('rational'); });
  chkF('Quitarle RATIONAL a Técnico desde el cuadrante lo deja sin verlo de verdad', !tecnicoVeRational);
  chkF('...pero "Mi agenda" lo sigue teniendo siempre (no es parte del cuadrante)', await page.evaluate(() => modulosPermitidos().includes('mi-agenda') && modulosPermitidos()[0] === 'mi-agenda'));
  await page.evaluate(() => { sesion.rol='owner'; });

  // --------- 7) "Restaurar valores originales" regresa todo a lo de arranque ---------
  await page.evaluate(() => { estado.vista='admin'; render(); });
  await page.waitForTimeout(150);
  await page.click('[data-accion="restaurar-permisos-modulos"]');
  await page.waitForTimeout(150);
  await page.click('.modal button:has-text("Sí, restaurar")');
  await page.waitForTimeout(200);
  chkF('datos.permisosModulos queda vacío (sin overrides)', JSON.stringify(await page.evaluate(() => datos.permisosModulos)) === '{}');
  const tecnicoRestaurado = await page.evaluate(() => { sesion.rol='tecnico'; return modulosPermitidos(); });
  chkF('Técnico vuelve a ver RATIONAL (restaurado)', tecnicoRestaurado.includes('rational'));
  const reporteroRestaurado = await page.evaluate(() => { sesion.rol='reportero'; return modulosPermitidos(); });
  chkF('Reportero vuelve a NO ver CRM (restaurado)', !reporteroRestaurado.includes('crm'));
  await page.evaluate(() => { sesion.rol='owner'; });

  // --------- 8) Un rol que no es Admin ve el cuadrante de solo lectura ---------
  await page.evaluate(() => { sesion.rol='analyst'; estado.vista='admin'; render(); });
  await page.waitForTimeout(150);
  chkF('Analyst ve el cuadrante (puede consultarlo)', await page.locator('h3:has-text("Permisos por módulo")').count() === 1);
  chkF('...pero todas las casillas están deshabilitadas', (await page.locator('[data-permiso-modulo]').evaluateAll(els => els.every(e => e.disabled))));
  chkF('...y no ve "Guardar cambios" ni "Restaurar"', await page.locator('[data-accion="guardar-permisos-modulos"]').count() === 0 && await page.locator('[data-accion="restaurar-permisos-modulos"]').count() === 0);

  chkF('No hubo errores de página en todo el escenario', errores.length === 0);
  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
