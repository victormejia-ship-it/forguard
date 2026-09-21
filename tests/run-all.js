/* Corre TODAS las pruebas de esta carpeta, una por una (cada una abre su
   propio Chromium — no vale la pena paralelizarlas para ~20 archivos), y
   reporta un resumen al final. Levanta su propio servidor estático para
   'npm test' sin pasos manuales; si ya hay uno corriendo en el mismo
   puerto (por ejemplo, dejado a propósito para depurar), lo reutiliza. */
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

const RAIZ_REPO = path.join(__dirname, '..');
const CARPETA_PRUEBAS = __dirname;
const URL_BASE = process.env.URL_BASE || 'http://127.0.0.1:9811';
const PUERTO = Number(new URL(URL_BASE).port || 80);

const TIPOS_MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json'
};

function servidorEstaVivo(){
  return new Promise(resolve => {
    const r = http.get(URL_BASE + '/index.html', res => { res.resume(); resolve(res.statusCode < 500); });
    r.on('error', () => resolve(false));
    r.setTimeout(1000, () => { r.destroy(); resolve(false); });
  });
}

/* Servidor estático mínimo, sin dependencias — sirve la raíz del repo tal
   cual (index.html, sw.js, docs/, etc.), igual que python3 -m http.server. */
function arrancarServidorPropio(){
  return new Promise((resolve, reject) => {
    const servidor = http.createServer((req, res) => {
      const ruta = decodeURIComponent(req.url.split('?')[0]);
      const archivo = path.join(RAIZ_REPO, ruta === '/' ? '/index.html' : ruta);
      if(!archivo.startsWith(RAIZ_REPO)){ res.writeHead(403); res.end(); return; }
      fs.readFile(archivo, (err, datos) => {
        if(err){ res.writeHead(404); res.end('No encontrado'); return; }
        res.writeHead(200, { 'Content-Type': TIPOS_MIME[path.extname(archivo)] || 'application/octet-stream' });
        res.end(datos);
      });
    });
    servidor.on('error', reject);
    servidor.listen(PUERTO, '127.0.0.1', () => resolve(servidor));
  });
}

(async () => {
  const yaHabiaServidor = await servidorEstaVivo();
  let servidorPropio = null;
  if(!yaHabiaServidor){
    console.log('Arrancando servidor estático en ' + URL_BASE + ' …');
    servidorPropio = await arrancarServidorPropio();
  }else{
    console.log('Reutilizando servidor ya activo en ' + URL_BASE);
  }

  const archivos = fs.readdirSync(CARPETA_PRUEBAS)
    .filter(f => f.startsWith('test_') && f.endsWith('.js'))
    .sort();

  console.log('\n' + archivos.length + ' pruebas encontradas.\n');
  const resultados = [];
  for(const archivo of archivos){
    process.stdout.write('▶ ' + archivo + ' … ');
    /* spawn() async, NUNCA spawnSync(): el servidor estático de arriba
       vive en ESTE MISMO proceso — spawnSync() bloquea TODO el proceso
       (no solo el código que la llama) hasta que el hijo termina, así que
       el servidor jamás llega a atender ninguna petición mientras corre
       una prueba, y cada page.goto() truena por timeout. Con spawn()
       async, el bucle de eventos de este proceso sigue vivo y el
       servidor sí responde. */
    const r = await new Promise(resolve => {
      let stdout = '', stderr = '';
      const hijo = spawn('node', [path.join(CARPETA_PRUEBAS, archivo)], {
        env: Object.assign({}, process.env, { URL_BASE })
      });
      hijo.stdout.on('data', d => { stdout += d; });
      hijo.stderr.on('data', d => { stderr += d; });
      hijo.on('close', codigo => resolve({ status: codigo, stdout, stderr }));
    });
    const ok = r.status === 0;
    console.log(ok ? 'OK' : 'FALLÓ');
    if(!ok) console.log(r.stdout + r.stderr);
    resultados.push({ archivo, ok });
  }

  if(servidorPropio) servidorPropio.close();

  const fallidas = resultados.filter(r => !r.ok);
  console.log('\n=========================================');
  console.log(resultados.length - fallidas.length + '/' + resultados.length + ' pruebas pasaron.');
  if(fallidas.length){
    console.log('Fallaron: ' + fallidas.map(r => r.archivo).join(', '));
  }
  process.exit(fallidas.length ? 1 : 0);
})().catch(e => { console.error('FALLO INESPERADO en run-all.js:', e); process.exit(1); });
