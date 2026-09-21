/* Configuración compartida por todas las pruebas — así no hay que tocar
   20 archivos si algún día cambia el puerto o cómo se arranca Chromium.

   URL_BASE: dónde sirve la copia de index.html que se va a probar. Por
   default asume el servidor estático de tests/README.md
   (`python3 -m http.server 9811` desde la raíz del repo); se puede pisar
   con la variable de entorno URL_BASE para correr las pruebas contra otro
   puerto o contra un despliegue ya publicado.

   OPCIONES_NAVEGADOR: en la máquina de un desarrollador normal (o en CI
   después de `npx playwright install`), chromium.launch() a secas ya
   encuentra el navegador que Playwright instaló. Solo hace falta apuntar
   a un Chromium específico con PLAYWRIGHT_EXECUTABLE_PATH en un entorno
   que traiga uno preinstalado en una ruta fija y no permita instalar uno
   nuevo (como el sandbox donde se escribieron estas pruebas). */
const URL_BASE = process.env.URL_BASE || 'http://127.0.0.1:9811';

const OPCIONES_NAVEGADOR = process.env.PLAYWRIGHT_EXECUTABLE_PATH
  ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
  : {};

module.exports = { URL_BASE, OPCIONES_NAVEGADOR };
