/* Reporte de Victor (21-sep-2026, con el PDF real que subió y una captura
   mostrando que se guardó como documento, no como imagen): al subir un
   plano en PDF a un proyecto de Imagen/Aperturas, nunca se convertía a
   imagen — siempre se degradaba al PDF guardado tal cual.

   Causa raíz: cargarPdfJs() trae pdf.js desde cdnjs.cloudflare.com
   (PDFJS_CDN_BASE), pero el Content-Security-Policy de la página
   (script-src) NUNCA incluyó ese dominio — así que el navegador bloqueaba
   SIEMPRE la carga del script (y de su worker, que cae en script-src al no
   haber worker-src propio), para CUALQUIER PDF, no por archivo. El único
   indicio era un mensaje engañoso ("sin conexión a internet"), cuando la
   verdadera causa era la política de seguridad de la propia página.

   Este test verifica que el CSP ya declara ese origen. No puede verificar
   la descarga real de pdf.js de punta a punta: este sandbox de desarrollo
   sale a internet por un proxy propio que bloquea cdnjs.cloudflare.com por
   política (ERR_TUNNEL_CONNECTION_FAILED, ajeno al CSP de la página y ajeno
   a cómo navega un usuario real) — ver tests/README.md. */
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
  await page.goto(URL_BASE + '/index.html');
  await page.waitForTimeout(300);

  const csp = await page.evaluate(() => {
    const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    return meta ? meta.content : null;
  });
  chkF('La página SÍ trae un meta de Content-Security-Policy', !!csp);
  const scriptSrc = (csp || '').split(';').map(s => s.trim()).find(s => s.startsWith('script-src')) || '';
  chkF('script-src del CSP incluye cdnjs.cloudflare.com (de donde carga pdf.js)', /https:\/\/cdnjs\.cloudflare\.com/.test(scriptSrc));
  chkF('script-src NO se abrió de más (sigue sin *, sigue con self)', scriptSrc.includes("'self'") && !scriptSrc.includes('*'));

  const pdfjsBase = await page.evaluate(() => (typeof PDFJS_CDN_BASE !== 'undefined') ? PDFJS_CDN_BASE : null);
  chkF('PDFJS_CDN_BASE apunta al mismo origen que ahora permite el CSP', pdfjsBase && scriptSrc.includes(new URL(pdfjsBase).origin));

  chkF('No hubo errores de página', errores.filter(e => e.startsWith('PAGEERROR')).length === 0);

  console.log('Errores capturados:', JSON.stringify(errores));
  await browser.close();
  console.log('\nTotal de fallas:', fallas);
  process.exit(fallas > 0 ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO:', e); process.exit(1); });
