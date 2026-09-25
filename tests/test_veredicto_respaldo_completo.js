/* Veredicto de auditoría (21-sep-2026), hallazgo crítico (2 d-p): "El
   respaldo que baja un Admin omite 7 de 16 colecciones — activos,
   refacciones, gastos". descargarRespaldo() listaba a mano solo 9 de las
   18 claves de `datos` y nunca se actualizó al agregar módulos nuevos
   (Activos, Proveedores, Refacciones, Órdenes de Compra, Visitas,
   Imagen/Aperturas, Personal), a diferencia del listener de restaurar que
   sí las traía todas. Este test llena las 19 colecciones con datos reales
   (la 19na, nominaPersonal, agregada el 25-sep-2026 junto con "Nómina
   directa del pilar" de Resultados),
   llama a descargarRespaldo() interceptando el Blob, y confirma que TODAS
   quedan en el JSON exportado, no solo las 9 originales. */
const { chromium } = require('playwright');
const { URL_BASE, OPCIONES_NAVEGADOR } = require('./lib/entorno');
const chk = (label, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' - ' + label); return cond; };
let fallas = 0;
const chkF = (label, cond) => { if(!chk(label, cond)) fallas++; };

(async () => {
  const browser = await chromium.launch(OPCIONES_NAVEGADOR);
  const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });
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
    datos.clientes = [normalizarCliente({ id:'c1', nombre:'NGK' })];
    datos.sitios = [normalizarSitio({ id:'s1', clienteId:'c1', nombre:'Planta 1' })];
    datos.polizas = [{ id:'p1' }];
    datos.catalogo = [{ id:'cat1' }];
    datos.segmentos = [{ id:'seg1' }];
    datos.cotizaciones = [{ id:'cot1' }];
    datos.reportes = [normalizarReporte({ id:'r1', sitioId:'s1' })];
    datos.levantamientos = [{ id:'lev1' }];
    datos.proyectosImagen = [normalizarProyectoImagen({ id:'pi1', clienteId:'c1' })];
    datos.activos = [{ id:'act1' }];
    datos.personal = [{ id:'per1' }];
    datos.nominaPersonal = [{ id:'per1', sueldoMensual:100 }];
    datos.proveedores = [{ id:'prov1' }];
    datos.gastosProveedor = [{ id:'gp1' }];
    datos.refacciones = [{ id:'ref1' }];
    datos.ordenesCompra = [{ id:'oc1' }];
    datos.visitas = [normalizarVisita({ id:'v1', clienteId:'c1' })];
  });

  const exportado = await page.evaluate(() => {
    // Interceptamos el mismo camino real que usa el botón: descargar(blob, nombre)
    let capturado = null;
    const originalDescargar = window.descargar;
    window.descargar = (blob) => { capturado = blob; };
    descargarRespaldo();
    window.descargar = originalDescargar;
    return capturado ? capturado.text() : null;
  });
  const json = JSON.parse(await exportado);

  const colecciones = ['clientes','sitios','polizas','catalogo','segmentos','cotizaciones','reportes',
    'levantamientos','proyectosImagen','activos','personal','nominaPersonal','proveedores','gastosProveedor',
    'refacciones','ordenesCompra','visitas'];
  colecciones.forEach(clave => {
    chkF(`El respaldo SÍ incluye "${clave}" con datos`, Array.isArray(json[clave]) && json[clave].length > 0);
  });
  chkF('El respaldo incluye "parametros" (objeto, no arreglo)', json.parametros !== undefined);
  chkF('El respaldo trae el sello "generado"', typeof json.generado === 'string');

  chkF('No hubo errores de página al generar el respaldo', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
