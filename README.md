# Control de Forpass (copia propia)

Tablero para administrar kioskos Forpass instalados: por cliente, por sitio,
con su mensualidad, vigencia y estatus de pago. Nació con Forpass y Pólizas
de mantenimiento preventivo como sus dos módulos, y desde entonces creció a
una operación más completa: Reportes (tickets), Levantamientos, Visitas,
Cotizaciones, Activos, Proveedores, Organigrama e Imagen/Aperturas, además
del portal externo para clientes y el panel de Admin (cuentas, catálogo de
precios, segmentos y parámetros). Los módulos activos, según el rol de cada
cuenta, se ven en la barra de arriba del tablero.

Es una sola página (`index.html`), sin servidor: las fuentes, el logo y el
generador de Excel van embebidos en el archivo. Se conecta a un **proyecto de
Firebase propio de Victor** (`forguard-soft-services`) — decisión explícita
(21-ago-2026), después de intentar compartir el proyecto real de Forguard y
topar con que publicar reglas y editar credenciales requería permisos de
Google Cloud de un tercero. Esta copia es independiente: no comparte datos
con la app original de Forguard, y Victor es Owner del proyecto sin depender
de nadie más.

Esta copia agrega, sobre la base original:

- **Admin → Segmentos y parámetros**: dar de alta segmentos (zonas sugeridas)
  y campos personalizados de clientes/sitios sin tocar código — ver el
  detalle al final de [docs/CONECTAR-SERVIDOR.md](docs/CONECTAR-SERVIDOR.md).
- **Módulo Cotizaciones**: cotizar un trabajo de mantenimiento (correctivo,
  preventivo, revisión…) sobre un sitio ya dado de alta, con dos caras del
  mismo documento — el **costo interno** (para saber qué cargarle al sitio o
  al cliente) y la **cotización cliente** (costo + margen, con instalación /
  mano de obra opcional) — más un documento imprimible para cada lado. El
  margen y la fórmula de instalación son editables por cotización, no un
  valor fijo de la app.

## Cómo se usa

1. **Agregar cliente** en la portada.
2. Entrar al cliente y **Agregar sitio** (por ejemplo `MXCD13`) con:
   - Forpass instalados (módulos) y estado del sitio.
   - Si se fue como *Software + Hardware* o *Solo Software*.
   - Mensualidad del sitio, y si incluyó **onboarding** y/o **viáticos**.
   - Fecha de inicio y número de mensualidades (la vigencia se calcula sola).
3. Marcar las mensualidades pagadas con las casillas numeradas de cada sitio,
   o con el botón **Marcar pagada**.

La portada muestra Forpass activos, mensualidad total, sitios atrasados,
mensualidades por vencer en 7 días y vigencias que terminan en 45 días.

## Dónde se guarda la información

Funciona de dos maneras según si `CONFIG_NUBE` (arriba de `index.html`) está
lleno o vacío:

**Modo local** (por defecto en esta copia) — en el navegador de la
computadora que la captura. Para moverla: **Respaldo JSON** descarga todo y
**Restaurar** lo abre en otra máquina.

**Modo servidor** — ya configurado con el proyecto propio de Firebase
(`forguard-soft-services`): pide correo y contraseña, guarda en el servidor,
todos ven lo mismo, hay ocho roles (Owner, Admin, Analyst, Viewer, Técnico,
Reportero, Control de activos, Cliente — cada uno acotado a lo suyo, ver
[config/firestore.rules](config/firestore.rules)) y queda historial de quién
cambió qué. Las reglas de seguridad están en
[config/firestore.rules](config/firestore.rules) — se publican con
`firebase deploy --only firestore:rules --project forguard-soft-services`.

En los dos modos, **Descargar Excel** genera un `.xlsx` con el formato de
*Control de Kioskos Forpass*, con las columnas calculadas como fórmulas vivas.

## Publicar

Es GitHub Pages, con dominio propio (`forguardfacilities.com.mx`, ver
[docs/DOMINIO-PROPIO.md](docs/DOMINIO-PROPIO.md)) — pero **no desde `main`**:
esa rama solo tiene este README, sin `index.html` ni el resto del proyecto
(verificado 21-sep-2026, veredicto de auditoría: "el README contradice la
realidad"). El tablero en producción se sirve desde la rama de trabajo
activa (hoy `claude/webpage-build-6vodst`) — confirma cuál es la rama real
en **Settings → Pages** del repo antes de dar por bueno cualquier cambio
aquí, porque el nombre puede volver a cambiar.

```bash
git add -A && git commit -m "Actualiza el control de Forpass" && git push
```

Pendiente (no urgente, pero real): mover el contenido a `main` y publicar
desde ahí es lo normal para un repo de GitHub Pages — hoy no se ha hecho
porque `main` nunca se actualizó después del commit inicial.
