/* Veredicto de auditoría (21-sep-2026), hallazgo crítico (1 d-p): "Al
   recargar, la agenda del técnico truena y deja la sesión sin sincronizar".
   Causa raíz: visitasDeCuenta() hacía datos.visitas.filter(...) sin
   protección, y vistaMiAgenda() (la pantalla de arranque de un técnico) la
   llama dos veces (directo, y adentro de sitiosDeCuenta() para los
   preventivos). Si datos.visitas queda undefined en cualquier camino de
   carga —como pasaba antes del fix de cargar()/restaurarSnapshotIndexedDB()—
   truena ahí mismo. Este test cubre el escenario real completo (técnico
   recarga con una sesión ya guardada) Y la robustez de visitasDeCuenta()
   por su cuenta, para que un futuro camino de carga que vuelva a olvidar
   "visitas" no tumbe la agenda otra vez. */
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

  // --------- Escenario real: un técnico con reportes/visitas asignadas recarga la página ---------
  await page.evaluate(() => {
    const respaldo = {
      v: 1, clientes: [normalizarCliente({ id:'c1', nombre:'NGK' })],
      sitios: [normalizarSitio({ id:'s1', clienteId:'c1', nombre:'NGK Planta 1' })],
      polizas: [], catalogo: [], segmentos: [], parametros: { clientes:[], sitios:[] },
      cotizaciones: [], reportes: [normalizarReporte({ id:'r1', sitioId:'s1', sitioNombre:'NGK Planta 1',
        titulo:'Fuga de gas', estatus:'abierto', tecnicos:[{ uid:'u-tec', nombre:'Juan Técnico' }] })],
      levantamientos: [], proyectosImagen: [], activos: [], personal: [], proveedores: [], gastosProveedor: [],
      refacciones: [], ordenesCompra: [],
      visitas: [normalizarVisita({ id:'v1', clienteId:'c1', sitioId:'s1', sitioNombre:'NGK Planta 1',
        fecha: hoyISO(), tecnicoUid:'u-tec', tecnicoNombre:'Juan Técnico' })]
    };
    localStorage.setItem('forguard_control_forpass_v1', JSON.stringify(respaldo));
  });
  await page.reload();
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    sesion.correo='tecnico@a.com'; sesion.uid='u-tec'; sesion.idToken='FAKE'; sesion.refreshToken='F2';
    sesion.expira=Date.now()+3600000; sesion.rol='tecnico'; sesion.nombre='Juan Técnico';
    ocultarAcceso();
    /* Mismo flujo real de arranque (ver el bloque ARRANQUE): cargar() lee la
       copia local, cargarModulo() arranca en 'resultados' a propósito
       (pedido de Victor, 10-sep-2026) y el candado de permisos de render()
       redirige solo a modulosPermitidos()[0] — 'mi-agenda' para un técnico. */
    cargar();
    cargarModulo();
    render();
  });
  await page.waitForTimeout(200);

  chkF('La agenda del técnico renderiza sin errores de página al "recargar"', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);
  chkF('El título "Mi agenda" se pinta correctamente', (await page.textContent('h2')) === 'Mi agenda');
  const texto = await page.textContent('body');
  chkF('Su reporte asignado aparece en la agenda', texto.includes('Fuga de gas'));
  chkF('Su visita próxima aparece en la agenda', texto.includes('NGK Planta 1'));

  // --------- Robustez propia de visitasDeCuenta(): aunque datos.visitas vuelva a faltar, no truena ---------
  const resultadoDefensivo = await page.evaluate(() => {
    const antes = datos.visitas;
    datos.visitas = undefined;
    let error = null, resultado = null;
    try{ resultado = visitasDeCuenta('u-tec', 'Juan Técnico'); }
    catch(e){ error = e.message; }
    datos.visitas = antes;
    return { error, esArray: Array.isArray(resultado) };
  });
  chkF('visitasDeCuenta() ya no truena aunque datos.visitas sea undefined', resultadoDefensivo.error === null);
  chkF('visitasDeCuenta() devuelve un array vacío en ese caso, no undefined', resultadoDefensivo.esArray === true);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
