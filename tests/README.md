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
| `test_poliza_imprimir_calendario.js` | "Imprimir calendario" en Pólizas: el documento arma solo Portada + Calendario + Cierre (sin tabla de equipos, descripción ni consideraciones) cuando se pide, y la aserción de renglones impresos (verificarRenglonesImpresos) no prende la banda roja de "mal formado" por la ausencia a propósito de esas hojas |
| `test_precios_historial.js` | Historial de cambios de precio |
| `test_proyecto_imagen_*.js` | Imagen/Aperturas: costo vs. precio de venta, documento y PDF |
| `test_proyecto_imagen_aumento_iva.js` | Imagen/Aperturas: aumento/descuento % a costo o precio de venta (solo Admin), e IVA en el total del documento |
| `test_proyecto_imagen_storage.js` | Imagen/Aperturas: las imágenes/PDFs se suben a Storage al guardar (ya no se embeben en el documento), y se pueden migrar las viejas |
| `test_pdf_a_imagen_csp.js` | El Content-Security-Policy permite cargar pdf.js desde cdnjs.cloudflare.com (si no, un plano en PDF nunca se convertía a imagen) |
| `test_proyecto_imagen_tarjetas.js` | Imagen/Aperturas: las tarjetas muestran costo/precio/margen (solo quien puede editar) y el logo del cliente |
| `test_proyecto_imagen_pie_traslape.js` | El documento de Imagen/Aperturas espera a que las imágenes (ya migradas a Storage, se bajan por red) terminen de decodificar antes de paginar — si no, el pie de página se empalmaba con la última imagen de la hoja |
| `test_proyecto_imagen_hoja_cierre.js` | El documento de Imagen/Aperturas ya no imprime una hoja en blanco al final (bug de `page-break-after` en la última hoja) y en su lugar cierra con una hoja de branding solo con el logo de Forguard; ahora también abre con la portada azul de Pólizas |
| `test_seguridad_politica_clave.js` | Política de contraseña (12 caracteres normal, 15 Owner/Admin) y que "¿Olvidaste tu contraseña?" ya no delata qué correos tienen cuenta (enumeración de usuarios) |
| `test_seguridad_inactividad.js` | El cierre automático de sesión a las 8h de inactividad — al arrancar con una sesión guardada vieja, y con la pestaña abierta y dejada quieta |
| `test_seguridad_mfa.js` | MFA (TOTP) para Owner/Admin: login con segundo factor, activar/desactivar desde "Mi cuenta"; que por defecto NO sea obligatorio (`mfaHabilitado()`, pausado 23-sep-2026 a pedido de Victor); y que el recordatorio/bloqueo obligatorio sigan funcionando cuando se reactive |
| `test_cotizaciones_excel_upsert.js` | "Importar desde Excel" en Cotizaciones corrige (etapa, proveedor, subtotal, comentarios) las cotizaciones que ya existen —identificadas por nombre+sitio+fecha, no por subtotal— y agrega las que no existen, en la misma importación |
| `test_documentos_hoja_cierre.js` | Cotizaciones, Levantamientos y Pólizas cierran con la hoja de solo-logo (y ya no imprimen una hoja en blanco de más); Órdenes de Compra NO la lleva (a propósito, pedido de Victor); Levantamientos y Pólizas abren con la portada azul, con Levantamientos mostrando 3 campos (Cliente/Fecha/Proyecto) y una póliza activa solo 2 (sin "Proyecto": el título ya dice "Póliza de Mantenimiento Preventivo" completo, así que repetirlo ahí sería la misma leyenda dos veces) |
| `test_pendientes_personales.js` | "Mis pendientes": la franja junto a la campanita de notificaciones donde cada cuenta captura, marca como hecho y borra sus propios recordatorios de texto libre, con fecha de creación/entrega informativas (etiqueta visible, no solo tooltip) y separados en "Pendientes"/"Realizadas" acomodados por fecha de entrega; y que el tema de Ayuda 'mi-cuenta' exista y la documente |
| `test_resultados_proforma.js` | Segundo intento de Resultados (24-sep-2026, rehecho desde cero calcado del Excel "Framework Proforma Forguard V2"): que la app arranque ahí, el gating por rol, que sean EXACTAMENTE 4 secciones (una por pilar) con los renglones y el orden exactos del Excel, que un renglón sin conectar siga en $0; el primer renglón ya wireado (Pólizas de mantenimiento/…incluidas en precio/Refacciones y materiales): cargo cliente vs. interno, que ambos generen ingreso y costo, que el ingreso cuente por calendario de facturación (no por "cobrado"), el costo repartido parejo entre los 12 meses, y que solo cuenten las pólizas Activas; el segundo renglón (Trabajos correctivos / preventivo / Otros costos directos, de Cotizaciones): solo estatus "Realizado" cuenta (una "aprobada" no se cuela, aunque ESTATUS_COTIZACION_INGRESO sí la marque como ganada), cargoA comedor también cuenta, la fecha usa fechaRealizado con `fecha` como respaldo si falta, y un año distinto no se cuela; y el rediseño visual (25-sep-2026, pedido de Victor: gráfico a la izquierda + datos a la derecha, y un resumen general arriba): `.wrap` se ensancha SOLO en Resultados, cada bloque (los 4 pilares + el nuevo "Resumen general Forguard") trae su gráfico primero y la tabla/ranking después, el Resumen general suma los 4 pilares en vivo (KPIs + gráfico agregado + ranking de ingresos por pilar), y el tooltip real (mouse sobre un mes) muestra el detalle correcto reutilizando el mecanismo de grafica-hit/graficaTT que había quedado huérfano desde el primer intento de Resultados; y (25-sep-2026, mismo día) tablas compactas + cumplimiento de pólizas: por default cada tabla muestra solo el mes actual y los 3 anteriores (colspan de las filas de sección cuadra con las columnas visibles, el Total sigue sumando los 12 meses completos), "Ver los 12 meses"/"Últimos meses" expande o comprime las 4 tablas a la vez con un clic (estado.resultadosMeses, mismo mecanismo genérico data-accion="vista-lista" del resto de la app); y "Cumplimiento de pólizas" (gráfico de dispersión, no de barras) apilado DEBAJO del gráfico de Ingresos/Costos/Utilidad de Servicios Técnicos —no en su propia sección ancha, pedido de Victor tras ver la primera versión—, exclusivo de ese pilar (los otros 3 no lo traen): solo pólizas Activas, cumplimientoPct/hechosDebidos/serviciosDebidos calcados de calcularPoliza() sin inventar un cálculo nuevo, el color de cada punto es el mismo semáforo ok/alerta/error/neutro de siempre, y su tooltip muestra folio/estado/cumplimiento/ingreso anual; y "Nómina directa del pilar" (25-sep-2026, en Servicios Técnicos/Operativos/Proyectos — Tecnología y Control no la trae, calcado del Excel): se deriva sola del Organigrama (datos.personal, campo `pilarId`) y de una colección aparte y sensible (datos.nominaPersonal, campo `sueldoMensual`) — solo personal Activo cuenta, de baja o sin pilar asignado no se cuela, parejo en los 12 meses, y sin sueldo capturado da $0 sin tronar; y que el dato es sensible de verdad: con exactamente los mismos datos cargados, Owner ve la suma real pero Analyst ve $0 en el mismo renglón (puedeVerNomina(), más la regla de Firestore de nominaPersonal restringida a esAdmin() — no solo escondido en la pantalla); y "Proveedores / servicios subcontratados" (25-sep-2026, Servicios Técnicos): dos fuentes — gastosProveedor con estatus Por pagar/Pagado y campo `pilarId` (Cotización/Cancelado no cuentan), MÁS Órdenes de Compra Confirmada/Enviada/Recibida (Borrador/Cancelada no) que no tienen campo Pilar propio así que se suman TODAS a Servicios Técnicos (confirmado con Victor tras encontrar, al revisar el módulo, que desde el 17-sep-2026 una Orden de Compra ya es la cuenta por pagar real y gastosProveedor quedó como historial viejo) — ambas fuentes por la fecha del gasto/orden, sin IVA en el caso de las OC |

## Lo que falta (siguiente paso, no de esta sesión)

- Correrlas en CI (GitHub Actions) en cada push/PR — hoy son manuales.
- Cobertura de los módulos que nunca se tocaron en una sesión con pruebas:
  Cotizaciones a fondo, Activos, Órdenes de Compra, Personal/Organigrama,
  el portal de clientes, y el panel de Admin.
- Un modo "revisión humana obligatoria" (regla de rama protegida en GitHub)
  es configuración del repositorio, no algo que estas pruebas resuelvan.
