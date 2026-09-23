# Pruebas de `index.html`

Veredicto de auditoría (21-sep-2026): *"Cero pruebas automatizadas y ningún
cambio pasa por revisión humana"*. Esta carpeta es el primer paso real
contra esa parte — son las pruebas de extremo a extremo (Playwright, sobre
un Chromium de verdad) escritas mientras se cerraban los hallazgos del
veredicto y los cambios de otras sesiones recientes. No son cobertura
completa de las 32 pantallas del tablero, pero cubren los escenarios que sí
llegaron a tronar en producción — y quedan aquí para que la próxima persona
que toque algo relacionado sepa si lo rompió, sin tener que probarlo a mano.

## Cómo correrlas

```bash
cd tests
npm install
npm test
```

`npm test` levanta un servidor estático propio (sirve la raíz del repo,
para que `index.html` cargue igual que en producción), corre cada
`test_*.js` en su propio Chromium, y al final imprime cuántas pasaron y
cuáles fallaron.

Para correr una sola prueba mientras se depura algo puntual:

```bash
cd /ruta/al/repo
python3 -m http.server 9811 &      # o cualquier servidor estático
cd tests
node test_veredicto_sync_incremental.js
```

## Cómo están escritas

- **Nunca tocan Firebase de verdad.** Todo lo que hablaría con
  `identitytoolkit`/`securetoken`/`firestore.googleapis.com` se intercepta
  (`page.route()`) o se reemplaza directo (`window.pedirNube = ...`,
  `window.escribirNube = ...`) — así corren sin internet, sin cuentas
  reales, y sin poder tronar nada en el proyecto de Firebase de producción.
  Cuál de las dos formas usa cada prueba depende de qué tan a fondo hay que
  fingir la respuesta del servidor; los archivos más nuevos (`test_veredicto_*`)
  explican en un comentario por qué eligieron una sobre la otra.
- Arrancan la app real (`page.goto(...)`), simulan una sesión ya con
  permiso (`sesion.correo = ...; ocultarAcceso();`) en vez de pasar por el
  formulario de login en cada prueba, y de ahí llaman directo a las
  funciones globales del archivo (`guardarReporte(...)`, `bajarDeLaNube(...)`,
  `modalReporte(...)`) o interactúan con botones reales cuando el propio
  flujo de UI es lo que se está probando.
- Cada prueba imprime `OK`/`FAIL` por cada verificación (no solo un
  pasó/falló global) y termina con `process.exit(0)` o `process.exit(1)` —
  así `run-all.js` (o CI, el día que exista) puede darle seguimiento.
- `lib/entorno.js` centraliza la URL base y cómo se lanza Chromium, para no
  tener que tocar 20 archivos si cambia el puerto o el entorno.

## Qué cubren

| Archivo | Qué prueba |
|---|---|
| `test_veredicto_visitas_arranque.js` | `cargar()`/`restaurarSnapshotIndexedDB()` restauran `datos.visitas` |
| `test_veredicto_agenda_tecnico.js` | La agenda del técnico no truena al recargar |
| `test_veredicto_respaldo_completo.js` | El respaldo del Admin incluye las 16 colecciones |
| `test_veredicto_mantenimiento_rechazado.js` | Un rechazo definitivo del servidor no borra el registro solo |
| `test_veredicto_login_no_completa.js` | El login no deja al técnico varado si falla la sincronización |
| `test_veredicto_sync_incremental.js` | El refresco de 30s solo baja colecciones que de verdad cambiaron |
| `test_veredicto_conflicto_edicion.js` | Aviso cuando dos personas editan el mismo reporte |
| `test_smoke_arranque.js` | Ningún módulo principal truena al abrirlo |
| `test_poliza_*.js` | Duplicar póliza, importar Excel, vigencia en tarjetas |
| `test_precios_historial.js` | Historial de cambios de precio |
| `test_proyecto_imagen_*.js` | Imagen/Aperturas: costo vs. precio de venta, documento y PDF |
| `test_proyecto_imagen_aumento_iva.js` | Imagen/Aperturas: aumento/descuento % a costo o precio de venta (solo Admin), e IVA en el total del documento |
| `test_proyecto_imagen_storage.js` | Imagen/Aperturas: las imágenes/PDFs se suben a Storage al guardar (ya no se embeben en el documento), y se pueden migrar las viejas |
| `test_pdf_a_imagen_csp.js` | El Content-Security-Policy permite cargar pdf.js desde cdnjs.cloudflare.com (si no, un plano en PDF nunca se convertía a imagen) |
| `test_proyecto_imagen_tarjetas.js` | Imagen/Aperturas: las tarjetas muestran costo/precio/margen (solo quien puede editar) y el logo del cliente |
| `test_proyecto_imagen_pie_traslape.js` | El documento de Imagen/Aperturas espera a que las imágenes (ya migradas a Storage, se bajan por red) terminen de decodificar antes de paginar — si no, el pie de página se empalmaba con la última imagen de la hoja |
| `test_proyecto_imagen_hoja_cierre.js` | El documento de Imagen/Aperturas ya no imprime una hoja en blanco al final (bug de `page-break-after` en la última hoja) y en su lugar cierra con una hoja de branding solo con el logo de Forguard |
| `test_seguridad_politica_clave.js` | Política de contraseña (12 caracteres normal, 15 Owner/Admin) y que "¿Olvidaste tu contraseña?" ya no delata qué correos tienen cuenta (enumeración de usuarios) |
| `test_seguridad_inactividad.js` | El cierre automático de sesión a las 8h de inactividad — al arrancar con una sesión guardada vieja, y con la pestaña abierta y dejada quieta |
| `test_seguridad_mfa.js` | MFA (TOTP) para Owner/Admin: login con segundo factor, activar/desactivar desde "Mi cuenta", el recordatorio antes de la fecha límite y el bloqueo obligatorio después |
| `test_documentos_hoja_cierre.js` | Cotizaciones, Órdenes de Compra, Levantamientos y Pólizas también cierran con la hoja de solo-logo (y ya no imprimen una hoja en blanco de más) — mismo arreglo que Imagen/Aperturas |

## Lo que falta (siguiente paso, no de esta sesión)

- Correrlas en CI (GitHub Actions) en cada push/PR — hoy son manuales.
- Cobertura de los módulos que nunca se tocaron en una sesión con pruebas:
  Cotizaciones a fondo, Activos, Órdenes de Compra, Personal/Organigrama,
  el portal de clientes, y el panel de Admin.
- Un modo "revisión humana obligatoria" (regla de rama protegida en GitHub)
  es configuración del repositorio, no algo que estas pruebas resuelvan.
