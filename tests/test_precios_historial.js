/* Pedido de Victor (21-sep-2026, punto 2): "que exista alguna sección donde
   nosotros podamos colocar los nuevos precios, si llegará a existir un
   aumento en la inflación podamos aumentar los costos y este a su vez vaya
   generando un histórico de precios, por el momento solo lo relacionado con
   los precios de las polizas". La "Lista de precios" ya existe (Pólizas →
   Lista de precios); lo que faltaba era el histórico: cada vez que se edita
   el precio o el costo de un equipo, debe quedar una entrada con fecha,
   quién y el antes/después — visible en un "Ver histórico" por equipo. */
const { chromium } = require('playwright');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
const chk = (label, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' - ' + label); return cond; };
let fallas = 0;
const chkF = (label, cond) => { if(!chk(label, cond)) fallas++; };

(async () => {
  const browser = await chromium.launch(OPCIONES_NAVEGADOR);
  const page = await browser.newPage({ viewport: { width: 1500, height: 1300 } });
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
    datos.catalogo = [normalizarEquipo({ id:'eq1', concepto:'Mtto preventivo horno', precio:1000, frecuencia:3, costoInsumos:100, costoManoObra:200 })];
    irAModulo('polizas'); irAPrecios();
  });
  await page.waitForTimeout(200);

  // --------- Un equipo recién creado (sin cambios) no trae botón de histórico ---------
  chkF('El equipo recién creado NO trae botón de histórico (sin cambios todavía)', await page.locator('[data-historial-equipo="eq1"]').count() === 0);

  // --------- Editar el precio por inflación genera una entrada de histórico ---------
  await page.click('[data-editar-equipo="eq1"]');
  await page.waitForTimeout(150);
  await page.fill('#eqPrecio', '');
  await page.type('#eqPrecio', '1150');
  await page.fill('#eqCostoInsumos', '');
  await page.type('#eqCostoInsumos', '120');
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);

  chkF('Ahora SÍ aparece el botón de histórico (1 cambio)', await page.locator('[data-historial-equipo="eq1"]').count() === 1);
  const tituloBtn = await page.getAttribute('[data-historial-equipo="eq1"]', 'title');
  chkF('El botón dice cuántos cambios lleva (1)', tituloBtn.includes('1'));

  const historial1 = await page.evaluate(() => catalogo().find(e => e.id === 'eq1').historial);
  chkF('Se guardó UNA entrada de histórico', historial1.length === 1);
  chkF('La entrada trae el precio ANTERIOR correcto (1000)', historial1[0].precioAnterior === 1000);
  chkF('La entrada trae el precio NUEVO correcto (1150)', historial1[0].precioNuevo === 1150);
  chkF('La entrada trae quién lo hizo (Victor Owner)', historial1[0].quien === 'Victor Owner');
  chkF('El precio ACTUAL del equipo ya es el nuevo (1150)', (await page.evaluate(() => catalogo().find(e => e.id === 'eq1').precio)) === 1150);

  // --------- Ver el histórico ---------
  await page.click('[data-historial-equipo="eq1"]');
  await page.waitForTimeout(150);
  const cuerpoModal = await page.textContent('#modalCuerpo');
  chkF('El modal muestra el título con el nombre del equipo', (await page.textContent('#modalTitulo')).includes('Mtto preventivo horno'));
  chkF('Muestra el precio anterior y el nuevo', cuerpoModal.includes('$1,000') && cuerpoModal.includes('$1,150'));
  chkF('Muestra quién hizo el cambio', cuerpoModal.includes('Victor Owner'));
  await page.click('[data-modal="cancelar"]');
  await page.waitForTimeout(150);

  // --------- Un segundo cambio se ACUMULA (no reemplaza) y queda más reciente primero ---------
  await page.click('[data-editar-equipo="eq1"]');
  await page.waitForTimeout(150);
  await page.fill('#eqPrecio', '');
  await page.type('#eqPrecio', '1300');
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);

  const historial2 = await page.evaluate(() => catalogo().find(e => e.id === 'eq1').historial);
  chkF('Ahora hay 2 entradas en el histórico (se acumula, no se reemplaza)', historial2.length === 2);
  chkF('La más reciente (1150 → 1300) va PRIMERO', historial2[0].precioAnterior === 1150 && historial2[0].precioNuevo === 1300);
  chkF('La más vieja (1000 → 1150) sigue después', historial2[1].precioAnterior === 1000 && historial2[1].precioNuevo === 1150);

  // --------- Editar SIN tocar precio/costo (solo la descripción) NO agrega entrada ---------
  await page.click('[data-editar-equipo="eq1"]');
  await page.waitForTimeout(150);
  await page.fill('#eqDescripcion', 'Se revisa el quemador y se calibra el termostato.');
  await page.click('[data-modal="guardar"]');
  await page.waitForTimeout(200);

  const historial3 = await page.evaluate(() => catalogo().find(e => e.id === 'eq1').historial);
  chkF('Editar solo la descripción NO agrega una entrada nueva (sigue en 2)', historial3.length === 2);

  console.log('Errores:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
