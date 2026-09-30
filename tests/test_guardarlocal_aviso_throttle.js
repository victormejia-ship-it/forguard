/* guardarLocal(): el aviso de consola "sin espacio ni para la copia
   liviana" no traía throttle (veredicto de Victor, 30-sep-2026, tras un
   incidente real de eliminación masiva de clientes donde también se
   descubrió esto: su base ya creció tanto que hasta la copia SIN fotos
   deja de caber en localStorage, y la consola real mostró el mismo aviso
   45 VECES SEGUIDAS en la misma sesión, disparado por
   autoSincronizarPolizaCliente/refrescarDesdeNube llamando guardarLocal()
   en bucle). El respaldo grande en IndexedDB sí se sigue guardando bien
   cada vez —no se pierde nada—, así que repetir el aviso en cada llamada
   es puro ruido, exactamente el mismo problema que ya tenían (y ya
   arreglaron) los otros dos avisos de esta misma función
   (avisoEspacioLocalUltimo/avisoEspacioGrandeUltimo, con
   PAUSA_AVISO_ESPACIO_MS). Se prueba que el nuevo throttle
   (avisoConsolaLivianaUltimo) se comporta igual: solo una vez por
   guardarLocal(), sin importar cuántas veces se llame seguido. */
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
  await page.route('**identitytoolkit.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**securetoken.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**firestore.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.goto(URL_BASE + '/index.html');
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    sesion.correo='owner@a.com'; sesion.uid='u-owner'; sesion.idToken='FAKE'; sesion.refreshToken='F2';
    sesion.expira=Date.now()+3600000; sesion.rol='owner'; sesion.nombre='Victor Owner';
    ocultarAcceso();
  });

  // --------- 1) Simula un aparato SIN espacio ni para la copia liviana, llama guardarLocal() 10 veces seguidas ---------
  const resultado = await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    let intentosSetItem = 0;
    Storage.prototype.setItem = function(){ intentosSetItem++; throw new DOMException('QuotaExceededError', 'QuotaExceededError'); };

    const warnsOriginal = console.warn;
    const warnsCapturados = [];
    console.warn = (...args) => { warnsCapturados.push(String(args[0] || '')); };

    for(let i = 0; i < 10; i++) guardarLocal();

    console.warn = warnsOriginal;
    Storage.prototype.setItem = original;

    const warnsLivianaCount = warnsCapturados.filter(w => w.includes('sin espacio ni para la copia liviana')).length;
    return { intentosSetItem, warnsLivianaCount, totalWarns: warnsCapturados.length };
  });

  chkF('guardarLocal() sí lo intentó las 10 veces (2 intentos de localStorage cada vez = 20)', resultado.intentosSetItem === 20);
  chkF('El aviso de consola "sin espacio ni para la copia liviana" salió UNA sola vez en las 10 llamadas seguidas, no 10', resultado.warnsLivianaCount === 1);

  // --------- 2) Pasado el tiempo de pausa, sí vuelve a avisar (no se calló para siempre) ---------
  const resultado2 = await page.evaluate(() => {
    avisoConsolaLivianaUltimo = 0; // simula que ya pasaron los 5 minutos de pausa
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(){ throw new DOMException('QuotaExceededError', 'QuotaExceededError'); };
    const warnsOriginal = console.warn;
    const warnsCapturados = [];
    console.warn = (...args) => { warnsCapturados.push(String(args[0] || '')); };

    guardarLocal();

    console.warn = warnsOriginal;
    Storage.prototype.setItem = original;
    return warnsCapturados.filter(w => w.includes('sin espacio ni para la copia liviana')).length;
  });
  chkF('Pasada la pausa, el aviso sí vuelve a salir (no es un "nunca más")', resultado2 === 1);

  chkF('No hubo errores de página en todo el escenario', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
