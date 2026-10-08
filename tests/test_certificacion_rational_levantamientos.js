/* Certificación RATIONAL en Levantamientos (08-oct-2026, mismo pedido de
   Victor que test_certificacion_rational.js: "estamos buscando
   certificarnos ante un proveedor llamado RATIONAL... Requiero que podamos
   hacer algo similar para podernos certificar ante este proveedor" —
   "en todos los lados donde se involucren los equipos rational", según la
   aclaración de alcance que dio antes de que se construyera).

   Pólizas y Levantamientos son los DOS únicos lugares de Forguard con un
   campo `marca` propio por equipo (modalServicioPoliza y modalHallazgo),
   así que son los dos lugares donde esta certificación puede aparecer. El
   checklist (datos.checklistRational, editable desde Pólizas → "Checklist
   RATIONAL") y las categorías de evidencia (CATEGORIA_EVIDENCIA_RATIONAL)
   se REUSAN tal cual — ver test_certificacion_rational.js para cómo se
   construyeron.

   Diferencia real con modalServicioPoliza: ahí `x.marca` ya viene fijo del
   renglón de la póliza al abrir el modal. En un hallazgo de levantamiento,
   `marca` es un campo de texto que alguien puede escribir DESPUÉS de abrir
   el modal (un hallazgo nuevo arranca sin marca) — por eso la sección de
   certificación no se decide una sola vez al armar el HTML, sino que
   #hzMarca tiene su propio listener de 'input' que la muestra/esconde EN
   VIVO según lo que se vaya escribiendo, sin tener que cerrar y reabrir el
   modal. normalizarHallazgo() y normalizarListaEvidencias() (generalizada
   con un segundo parámetro para el tope general, antes fijo en
   EVIDENCIA_MAX_POR_SERVICIO) cargan con el resto. */
const { chromium } = require('playwright');
const path = require('path');
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
  await page.route('**firebasestorage.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"name":"fake"}' }));
  await page.goto(URL_BASE + '/index.html');
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    sesion.correo='owner@a.com'; sesion.uid='u-owner'; sesion.idToken='FAKE'; sesion.refreshToken='F2';
    sesion.expira=Date.now()+3600000; sesion.rol='owner'; sesion.nombre='Victor Owner';
    ocultarAcceso();
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'BORGWARNER' })];
    datos.levantamientos = [normalizarLevantamiento({
      id:'l1', clienteId:'c1', sitioNombre:'BorgWarner', fecha:'2026-09-01', realizoNombre:'Edgar',
      hallazgos: [
        { id:'h1', ubicacion:'Cocina caliente', equipoNombre:'Horno Rational', marca:'Rational', modelo:'iCOMBIPRO', serie:'E22SJ24073155686', hallazgo:'Fuga de vapor en la puerta', accion:'correctivo', prioridad:'alta' },
        { id:'h2', ubicacion:'Cámara 2', equipoNombre:'Refrigerador', marca:'True', hallazgo:'Empaque desgastado', accion:'correctivo', prioridad:'media' }
      ]
    })];
    render();
  });
  await page.waitForTimeout(300);

  // --------- 1) Editar un hallazgo YA con marca Rational: la sección aparece de una vez ---------
  await page.evaluate(() => modalHallazgo('l1', 'h1'));
  await page.waitForTimeout(150);
  chkF('Hallazgo YA con marca Rational: la sección aparece visible de entrada', await page.locator('#hzZonaRational').isVisible());
  chkF('Trae los 36 puntos del checklist vigente (el mismo que Pólizas)', await page.locator('#hzChecklistRational input[type="checkbox"]').count() === 36);
  chkF('Trae las 7 categorías de evidencia', await page.locator('#hzEvidenciaRationalWrap .fotos-unidad').count() === 7);

  const checksHz = page.locator('#hzChecklistRational input[type="checkbox"]');
  await checksHz.nth(0).check();
  await checksHz.nth(1).check();
  chkF('El contador de puntos marcados se actualiza en vivo', (await page.locator('#hzChecklistRational .pista').textContent()).includes('2 de'));

  const fixturePath = path.join(__dirname, 'fixtures', 'foto_prueba.png');
  const [fc1] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('[data-agregar-categoria-rational="panelElectrico"]')
  ]);
  await fc1.setFiles(fixturePath);
  await page.waitForTimeout(300);
  const fotosPanel = await page.locator('#hzEvidenciaRationalWrap').evaluate(el => {
    const b = Array.from(el.querySelectorAll('.fotos-unidad')).find(x => x.querySelector('.fotos-unidad-titulo').textContent.includes('Panel'));
    return b ? b.querySelectorAll('.evidencia-foto').length : -1;
  });
  chkF('La foto subida cae en la categoría correcta ("Panel eléctrico")', fotosPanel === 1);
  chkF('Esa foto NO aparece en la galería general de "Fotos de evidencia"', await page.locator('#hzGaleriaEvidencia .evidencia-foto').count() === 0);

  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(300);
  const guardadoH1 = await page.evaluate(() => {
    const h = datos.levantamientos.find(x=>x.id==='l1').hallazgos.find(x=>x.id==='h1');
    return { marcados: Object.keys(h.checklistRational).length, categorias: h.evidencias.map(e=>e.categoriaRational) };
  });
  chkF('Se guardaron los 2 puntos marcados del checklist', guardadoH1.marcados === 2);
  chkF('Se guardó la foto con su categoría ("panelElectrico")', guardadoH1.categorias.includes('panelElectrico'));

  // --------- 2) Hallazgo de OTRA marca: el modal se queda igual que siempre ---------
  await page.evaluate(() => modalHallazgo('l1', 'h2'));
  await page.waitForTimeout(150);
  chkF('Un hallazgo de otra marca (True) NO muestra la sección de certificación', !(await page.locator('#hzZonaRational').isVisible()));
  await page.click('[data-modal="cancelar"]');

  // --------- 3) Hallazgo NUEVO: escribir "Rational" en Marca muestra la
  // --------- sección EN VIVO, sin reabrir el modal (a diferencia de
  // --------- modalServicioPoliza, aquí la marca se escribe DESPUÉS de abrir) ---------
  await page.evaluate(() => modalHallazgo('l1', null));
  await page.waitForTimeout(150);
  chkF('Hallazgo nuevo: arranca sin la sección (todavía sin marca)', !(await page.locator('#hzZonaRational').isVisible()));
  await page.fill('#hzMarca', 'Rational');
  await page.waitForTimeout(100);
  chkF('Al escribir "Rational" en Marca, la sección aparece sola', await page.locator('#hzZonaRational').isVisible());
  await page.fill('#hzMarca', 'True');
  await page.waitForTimeout(100);
  chkF('Al cambiar a otra marca, la sección se esconde de nuevo', !(await page.locator('#hzZonaRational').isVisible()));
  await page.click('[data-modal="cancelar"]');

  chkF('No hubo errores de página en todo el escenario', errores.length === 0);
  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
