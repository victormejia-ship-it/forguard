/* Veredicto de auditoría (21-sep-2026), hallazgo crítico #9 (0.5 d-p, el
   más rápido de la lista): "La copia local no restaura visitas y tumba el
   arranque". cargar() (localStorage) y restaurarSnapshotIndexedDB() (IndexedDB)
   reconstruían datos={...} SIN la clave "visitas" — quedaba undefined, y
   cualquier vista que la recorriera (el módulo Visitas) tronaba en el primer
   render() tras un refresh, si la sesión anterior se había quedado ahí. */
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

  // --------- Simula un respaldo real de localStorage con visitas capturadas ---------
  await page.evaluate(() => {
    const respaldo = {
      v: 1, clientes: [normalizarCliente({ id:'c1', nombre:'NGK' })], sitios: [],
      polizas: [], catalogo: [], segmentos: [], parametros: { clientes:[], sitios:[] },
      cotizaciones: [], reportes: [], levantamientos: [], proyectosImagen: [], activos: [],
      personal: [], proveedores: [], gastosProveedor: [], refacciones: [], ordenesCompra: [],
      visitas: [normalizarVisita({ id:'v1', clienteId:'c1', fecha: hoyISO(), tecnicoNombre:'Juan' })]
    };
    localStorage.setItem('forguard_control_forpass_v1', JSON.stringify(respaldo));
  });

  // --------- cargar() (la copia rápida de localStorage, que corre SIEMPRE al arrancar) ---------
  const resultadoCargar = await page.evaluate(() => {
    datos = { v:1 }; // limpio a propósito, para no arrastrar el estado por default de la página ya cargada
    cargar();
    return { esArray: Array.isArray(datos.visitas), cantidad: datos.visitas ? datos.visitas.length : null };
  });
  chkF('cargar() SÍ deja datos.visitas como array (ya no undefined)', resultadoCargar.esArray === true);
  chkF('cargar() SÍ trae la visita capturada (1 registro)', resultadoCargar.cantidad === 1);

  // --------- El módulo Visitas ya no truena al renderizar con datos recién cargados ---------
  await page.evaluate(() => {
    sesion.correo='owner@a.com'; sesion.uid='u-owner'; sesion.idToken='FAKE'; sesion.refreshToken='F2';
    sesion.expira=Date.now()+3600000; sesion.rol='owner'; sesion.nombre='Victor Owner';
    ocultarAcceso();
    irAModulo('visitas');
  });
  await page.waitForTimeout(200);
  chkF('El módulo Visitas renderiza sin errores de página', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);
  chkF('El título del módulo se pintó correctamente (no quedó en blanco)', (await page.textContent('h2')).length > 0);

  // --------- restaurarSnapshotIndexedDB() (la otra ruta de "copia local") ---------
  const resultadoIDB = await page.evaluate(async () => {
    datos = { v:1 };
    await guardarSnapshotIndexedDB({
      v:1, clientes:[], sitios:[], polizas:[], catalogo:[], segmentos:[], parametros:{clientes:[],sitios:[]},
      cotizaciones:[], reportes:[], levantamientos:[], proyectosImagen:[], activos:[], personal:[],
      proveedores:[], gastosProveedor:[], refacciones:[], ordenesCompra:[],
      visitas: [normalizarVisita({ id:'v2', clienteId:'c1', fecha: hoyISO(), tecnicoNombre:'Ana' })]
    });
    await restaurarSnapshotIndexedDB();
    return { esArray: Array.isArray(datos.visitas), cantidad: datos.visitas ? datos.visitas.length : null };
  });
  chkF('restaurarSnapshotIndexedDB() SÍ deja datos.visitas como array', resultadoIDB.esArray === true);
  chkF('restaurarSnapshotIndexedDB() SÍ trae la visita guardada (1 registro)', resultadoIDB.cantidad === 1);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
