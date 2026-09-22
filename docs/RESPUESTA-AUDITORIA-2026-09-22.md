# Respuesta a la auditoría de seguridad externa (22-sep-2026)

> Victor mandó una segunda auditoría, hecha por otra IA, revisando nada más
> el sitio público (sin acceso al código ni al backend). Esta página revisa
> sus 26 puntos uno por uno contra el código y las reglas REALES del
> tablero, dice qué ya se corrigió hoy, qué ya estaba bien por cómo está
> armada la plataforma (y por qué la auditoría no lo podía saber desde
> afuera), qué de plano no aplica, y qué sigue pendiente porque necesita
> una decisión de Victor o un cambio de arquitectura más grande.

**Punto de partida importante**: la auditoría asume, sin poder confirmarlo
desde afuera, una arquitectura típica de "frontend + backend propio
(Node/Express) + base de datos SQL (Postgres/Supabase)". Control de Forpass
**no tiene backend propio**: es un solo `index.html` que habla directo con
Firebase (Auth + Firestore + Storage). Eso cambia dónde vive cada
protección — casi todo lo que la auditoría le pide a "un middleware de
Express" o a "políticas RLS de Supabase", aquí lo hacen
`config/firestore.rules` y `config/storage.rules`, que sí se pudieron leer y
verificar directamente. Por eso varios puntos que la auditoría marca
"requiere revisión de código/backend" aquí quedan resueltos con una
respuesta directa, no con un "no se pudo confirmar".

## Resumen: qué se corrigió hoy en código

| Archivo | Cambio |
|---|---|
| `index.html` | Contraseña mínima: 12 caracteres para cualquier cuenta, 15 para Owner/Admin (antes: 6 para todos), en las 4 pantallas que piden una — crear cuenta interna, crear cuenta de cliente, autoservicio "Solicita tu acceso" y "Cambiar mi contraseña" |
| `index.html` | La contraseña temporal que el sistema sugiere ahora siempre alcanza el mínimo de Owner/Admin (antes podía nacer corta para ese permiso) |
| `index.html` | "¿Olvidaste tu contraseña?" ya no delata si un correo tiene cuenta en Forguard o no — antes, un correo sin cuenta mostraba un error distinto al de un correo con cuenta (enumeración de usuarios) |
| `.well-known/security.txt` (nuevo) | Contacto de seguridad público, formato estándar (RFC 9116) |
| `.nojekyll` (nuevo) | Sin este archivo, GitHub Pages no serviría `.well-known/` (Jekyll ignora carpetas que empiezan con punto) |
| `tests/test_seguridad_politica_clave.js` (nuevo) | Prueba automatizada de los dos puntos de arriba — falla si algo de esto se revierte por accidente |
| `index.html` | Cierre automático de sesión a las 8 horas de inactividad (ver punto 4) |
| `tests/test_seguridad_inactividad.js` (nuevo) | Prueba automatizada del cierre por inactividad, al arrancar y con la pestaña abierta |

Suite completa: **25/25 pruebas pasaron** después de estos cambios.

## Los 26 puntos, uno por uno

### 1–2. Resumen ejecutivo y Pros/puntos fuertes
Sin acción — son contexto, no hallazgos. El flujo de aprobación de clientes
y la separación por módulos que la auditoría elogia ya existen y se
mantienen.

### 3. Política de contraseñas — ✅ CORREGIDO HOY
Ver tabla de arriba. **Falta un paso fuera de código**: Firebase Auth por sí
solo sigue aceptando contraseñas de 6 caracteres si alguien manda la
petición directo a su API (sin pasar por nuestra pantalla) — el mínimo real
del lado del servidor se configura en **Firebase Console → Authentication →
Settings → Password Policy** (subirlo ahí a 12, "Enforce uppercase/number",
etc.). Es el mismo tipo de paso manual que ya hicimos con las reglas de
Firestore/Storage: código no basta, hay que publicarlo en la consola.

### 4. Persistencia de sesión (JWT en localStorage) — ✅ MITIGADO HOY (sin backend no se puede cerrar del todo)
Confirmado: `guardarSesion()` (index.html) guarda `sesion` completo —
incluido `idToken` y `refreshToken` — en `localStorage`. Es real, y es el
riesgo #2 que la propia auditoría marca como el que más preocupa.

El arreglo de libro (cookies `Secure + HttpOnly + SameSite`, gestionadas por
un backend/BFF) **no se puede hacer sin agregar un servidor** — hoy no hay
ninguno; todo habla directo del navegador a Firebase. Añadir ese backend
(una Cloud Function, por ejemplo) sigue siendo un cambio de arquitectura de
fondo, no un ajuste de una tarde, y cambiaría cómo funciona el login en todo
el tablero — Victor decidió no entrarle a eso todavía.

Lo que SÍ se hizo hoy, con su visto bueno: **cierre automático de sesión a
las 8 horas sin actividad** (`LIMITE_INACTIVIDAD_MS`/`sesionInactivaDemasiado()`/
`marcarActividad()` en `index.html`). Antes, una sesión guardada en
localStorage duraba viva PARA SIEMPRE — `renovarToken()` la refrescaba sola
sin límite mientras nadie diera "Cerrar sesión". Ahora:
- Si nadie toca la app (clic, tecla) en 8 horas, la próxima vez que se
  abra la pestaña o pase el reloj de vigilancia (`revisarCuenta()`, cada 2
  minutos con la pestaña visible) se cierra sola, con aviso explícito.
- Se revisa ANTES de gastar una lectura de red o de intentar renovar el
  token — un dispositivo perdido/olvidado con la sesión abierta, o un
  refreshToken robado por un eventual XSS, dejan de servir después de 8
  horas sin uso, en vez de para siempre.
- Se eligió NO cambiar a `sessionStorage` (que cerraría la sesión con solo
  cerrar la pestaña): Victor prefirió no añadir esa fricción a quien
  trabaja en campo, y el cierre por inactividad ya acota el riesgo real sin
  ese costo.

Esto NO vuelve el token invisible a un XSS mientras la sesión sigue viva
—eso solo lo da una cookie HttpOnly, y esa necesita el backend que no
existe— pero si Firestore/Storage/Auth por sí solos no verían movimiento en
8h, ya no hay sesión que robar. Por lo mismo, el punto 10 (XSS) sigue
importando: mientras la sesión SÍ está activa, `esc()`/CSP siguen siendo la
única defensa real.

### 5. Broken Access Control / IDOR / BOLA — ✅ YA RESUELTO (verificado hoy)
Este es el que la auditoría marca como el más crítico, y aquí SÍ se pudo
verificar a fondo porque no depende de un backend oculto: **la autorización
real vive en `config/firestore.rules`**, no en el frontend. Revisé las 615
líneas del archivo hoy mismo y confirmé que las colecciones con datos de
cliente (`polizas_cliente`, `cotizaciones_cliente`, `reportes`, `sitios`,
`clientes`) exigen `resource.data.clienteId == miClienteId()` para el rol
`cliente` — un cliente JAMÁS puede leer el reporte, póliza o sitio de otro
cliente cambiando un ID en la URL o en la petición, porque Firestore evalúa
esa regla en el servidor de Google en cada lectura, sin importar qué pida
el navegador. Esto es justo el ejemplo `findFirst({ clientId })` que
propone la auditoría, solo que expresado como regla declarativa en vez de
código de backend.

### 6. Controles administrativos y "Ver como" — ✅ YA RESUELTO (no es lo que la auditoría teme)
Revisé el código de "Ver como…" (modalidad "vista previa"). **No es
impersonación de otra cuenta**: es el Owner viendo su PROPIA sesión con la
interfaz simulando lo que vería otro permiso — nunca inicia sesión como
otra persona, nunca lee datos de otra cuenta que el Owner no pudiera ya ver.
Y aunque la interfaz simule otro rol, cualquier lectura/escritura real
sigue pasando por las reglas de Firestore con el rol VERDADERO de la
cuenta — exactamente el principio que pide la auditoría ("nunca confiar
solo en controles de interfaz, el backend aplica autorización en cada
request"), aquí el "backend" son las reglas.

### 7. Modelo de autorización granular — ⚠️ PARCIAL, no rehecho hoy
Ya existen 8 roles (Owner, Admin, Analyst, Viewer, Técnico, Reportero,
Control de activos, Cliente) con permisos distintos por colección — más
granular que un simple ADMIN/USER, pero no llega al modelo
permiso-por-acción (`report.approve`, `quote.approve`, etc.) que sugiere la
auditoría. Rehacer el modelo de permisos completo es un proyecto de varias
sesiones, no un ajuste de hoy — se puede planear aparte si se quiere ir a
ese nivel de granularidad.

### 8. SQL/NoSQL Injection — ✅ NO APLICA (arquitectura)
No hay SQL: Firestore no arma consultas por concatenación de texto como
`"SELECT * WHERE email = '" + email + "'"`, sus consultas son estructuradas
(`where(campo, '==', valor)`) — la clase de vulnerabilidad que describe la
auditoría no existe en esta arquitectura.

### 9. Supabase / RLS — ✅ NO APLICA (no se usa Supabase)
El tablero usa Firebase, no Supabase. El equivalente de RLS aquí es
`config/firestore.rules`/`config/storage.rules` (ver punto 5), y no hay
ningún `SERVICE_ROLE_KEY` ni llave privada de servidor en el frontend (ver
punto 19).

### 10. XSS — ✅ Verificado con muestreo, sin auditoría línea por línea de 30,600 líneas
Revisé cómo se pinta contenido de usuario (descripciones, observaciones,
nombres de proveedor/cliente) en varias pantallas: todo pasa por `esc()`
antes de ir a `innerHTML`. Es la defensa real aquí — el CSP de la página
necesita `'unsafe-inline'` en `script-src` porque es un archivo único sin
proceso de build (no hay forma de firmar el script con un hash/nonce sin
herramientas de compilación), así que el CSP por sí solo NO bloquea un XSS
si `esc()` fallara en algún punto. No se revisaron las 30,600 líneas una
por una hoy — si quieres esa certeza al 100%, es tarea para una sesión
dedicada solo a eso.

### 11. Validación server-side — ✅ YA EXISTE (como reglas, no como middleware)
`config/firestore.rules` valida tipos y campos en varias colecciones (ver
por ejemplo el candado de `/polizas`, que congela campos por tipo de
cambio). No hay un schema tipo Zod centralizado, pero el principio
—nunca confiar solo en el frontend— ya se cumple vía reglas.

### 12. Hashing de contraseñas — ✅ NO APLICA (lo maneja Firebase Auth)
Las contraseñas nunca las manejamos nosotros: Firebase Auth las guarda con
su propio hash (scrypt) del lado de Google. No hay código de hashing propio
que pudiera estar usando SHA-256 sin KDF.

### 13. Recuperación de contraseña — ✅ CORREGIDO HOY (enumeración) + ⚠️ resto ya lo maneja Firebase
La enumeración de usuarios se corrigió (ver arriba). Token de un solo uso,
expiración corta, invalidación tras el cambio: eso lo maneja Firebase Auth
internamente en su flujo de `sendOobCode`/reset, no es código nuestro.

### 14. Brute force / credential stuffing — ⚠️ Parcial (depende de Firebase, sin protección propia)
Firebase Auth ya frena intentos repetidos de login con retrasos crecientes
(`TOO_MANY_ATTEMPTS`, ya traducido en la pantalla). Lo que NO existe es
protección contra abuso del **formulario público de reportes** (el link con
QR, sin sesión) — alguien podría mandar muchos reportes falsos. Backoff
exponencial y detección de password spraying a nivel de IP necesitan un
backend o un WAF (Cloudflare, por ejemplo) — no se puede hacer solo con
reglas de Firestore.

### 15. MFA — ⚠️ PENDIENTE, requiere decisión + upgrade de proyecto
No implementado. Firebase soporta MFA (TOTP/SMS) pero requiere subir el
proyecto a Identity Platform (cambia de plan/precio) y agregar la UI de
enrolamiento — es un proyecto aparte, no un ajuste de código de hoy.
Recomendado como siguiente prioridad después de resolver el punto 4
(persistencia de sesión), ya que ambos son los huecos reales más grandes
que quedan para las cuentas Owner/Admin.

### 16. CSRF — ✅ NO APLICA (no se usan cookies de sesión)
El tablero nunca usa cookies para autenticar — cada petición a Firestore/
Storage manda el `idToken` explícito en el header `Authorization`, nunca
algo que el navegador adjunte solo. CSRF depende de que el navegador mande
credenciales automáticamente (como sí hacen las cookies); aquí no aplica.

### 17. CORS — ✅ NO APLICA (no hay API propia)
No hay servidor propio que necesite configurar CORS: todas las llamadas van
directo del navegador a las APIs de Google (`identitytoolkit`, `firestore`,
`firebasestorage`), que ya tienen su propio control de acceso.

### 18. Cabeceras de seguridad — ⚠️ Parcial, límite real de GitHub Pages
- **Content-Security-Policy**: ya existe (agregada/ajustada en sesiones
  anteriores).
- **Referrer-Policy**: ya existe (`<meta name="referrer"
  content="strict-origin-when-cross-origin">`, línea 32 de `index.html`).
- **Strict-Transport-Security, X-Content-Type-Options, Permissions-Policy,
  Cross-Origin-Opener-Policy**: estas **no se pueden poner con una etiqueta
  `<meta>`** — necesitan una cabecera HTTP real, y GitHub Pages no deja
  configurar cabeceras propias en un sitio estático. Para tenerlas hay que
  poner un proxy delante (Cloudflare, por ejemplo) — otro cambio de
  infraestructura, no de código.

### 19. Variables de entorno y secretos — ✅ NO APLICA (nada que auditar)
Busqué en todo `index.html` cualquier rastro de llave privada, service role
key, `DATABASE_URL`, `JWT_SECRET`, etc. — no hay nada de eso porque no hay
backend que necesite esos secretos. Lo único "expuesto" es
`CONFIG_NUBE.apiKey` (la API key pública de Firebase), y esa SÍ está
pensada por Firebase para ser pública — no protege nada por sí sola, la
protección real son las reglas (punto 5).

### 20. Exposición de arquitectura / code splitting — ⚠️ Aceptado, es el diseño de la plataforma
Es un solo archivo HTML a propósito (sin build, fácil de editar y
desplegar) — separar en bundles por lazy loading rompería ese diseño. Se
deja como riesgo aceptado, no como pendiente.

### 21. Logging y auditoría — ⚠️ Parcial
`/bitacora` (Firestore) ya registra creación/edición/borrado de registros,
cambios de permiso y altas/bajas de cuenta (`anotar()` en `index.html`, se
verificó hoy). Lo que falta: `LOGIN_SUCCESS`/`LOGIN_FAILURE` no se
registran. Un login FALLIDO no se puede registrar desde el cliente sin
abrir una puerta de escritura a Firestore para gente sin sesión (un riesgo
nuevo, no una mejora) — requeriría Cloud Functions o los audit logs
propios de Identity Platform. No se improvisó una solución a medias hoy
para no dar una falsa sensación de cobertura.

### 22. Arquitectura objetivo recomendada — Ya documentado, diferente de lo propuesto
La arquitectura real (Firebase directo, sin backend propio) ya está
documentada en el propio código y en `README.md`. El diagrama de la
auditoría asume un backend/BFF que no existe aquí a propósito.

### 23–24. Plan de acción priorizado / Riesgos que más preocupan
Los 4 riesgos que la auditoría marca como los que más preocupan, con su
estado real:
1. "Cliente A puede consultar información de Cliente B" → **verificado que
   NO puede** (punto 5).
2. "JWT persistente en localStorage" → **confirmado y mitigado hoy**: sigue
   en localStorage (decisión de Victor, no se movió a `sessionStorage`),
   pero ya no dura viva para siempre — se cierra sola a las 8h sin
   actividad (punto 4).
3. "Permisos de Admin controlados solo desde frontend" → **verificado que
   NO es así**: los aplica Firestore, no la interfaz (puntos 5 y 6).
4. "Contraseñas de 6 caracteres sin MFA ni rate limiting" → **contraseña ya
   corregida hoy**; MFA sigue pendiente (punto 15); rate limiting de login
   ya lo trae Firebase Auth de fábrica.

### 25. Fase 2: auditoría del código — Esto ya es una Fase 2, hecha hoy
La auditoría pedía justo esto como siguiente paso — "revisar el repositorio
[...] entregable ideal: matriz de vulnerabilidades con severidad, evidencia,
archivo/línea, código corregido". Esta página es esa matriz, con el código
ya corregido donde se pudo (ver tabla del principio) en vez de solo
señalado.

### 26. Notas
De acuerdo: esta era una revisión externa no intrusiva, y lo de arriba es
la validación real contra el código que esa revisión no podía hacer sola.

## Lo que sigue, en orden de importancia real

1. **Firebase Console → Authentication → Password Policy**: subir el
   mínimo del lado del servidor a 12 (paso manual, 5 minutos) — **pendiente,
   Victor decidió no activarlo todavía**.
2. ~~Decidir sobre el punto 4~~ — **hecho**: cierre por inactividad a las 8h,
   sin mover la sesión a `sessionStorage` ni agregar un backend.
3. **MFA para Owner/Admin** (punto 15) — depende de subir a Identity
   Platform.
4. Si se quiere, una sesión dedicada a auditar `esc()`/`innerHTML` en las
   30,600 líneas completas (punto 10), no solo por muestreo.
