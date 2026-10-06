# Respaldo automático de Firestore

El único respaldo que existía hasta ahora era manual: "Respaldo JSON" en
Clientes (Admin/Owner), que descarga toda la base a un archivo en el
momento en que alguien le da clic. Si nadie lo recuerda, no hay copia
reciente.

Firestore trae una función nativa de respaldos programados que corre sola,
sin escribir ningún código ni Cloud Function. Vive enteramente en la
consola de Firebase/Google Cloud — fuera de este repositorio — así que
hay que activarla a mano, una sola vez, desde ahí.

## Pasos

1. **Firebase Console** → proyecto `forguard-soft-services`.
2. Si el proyecto sigue en el plan gratuito (Spark), pasarlo a **Blaze**
   (pago por uso) — es requisito para los respaldos programados. El costo
   de los respaldos en sí es solo el almacenamiento de las copias
   (normalmente unos cuantos dólares al mes para una base de este tamaño).
3. **Firestore Database** → pestaña **Backups** (Copias de seguridad).
4. **Create backup schedule** (Crear programación de respaldo):
   - Frecuencia: diaria (recomendado) o semanal.
   - Retención: cuánto tiempo guardar cada copia (p. ej. 7 o 30 días).
5. Guardar. A partir de ahí corre solo — no requiere tocar nada más ni
   aquí ni en el código.

## Alternativa por línea de comandos

Si se prefiere `gcloud` en vez de la consola:

```
gcloud firestore backups schedules create \
  --database='(default)' \
  --recurrence=daily \
  --retention=7d \
  --project=forguard-soft-services
```

## Qué NO cambia

- El "Respaldo JSON" manual de Clientes sigue existiendo tal cual, para
  cuando alguien quiera bajar una copia a su propia computadora en el
  momento (por ejemplo, antes de una operación grande como fusionar
  clientes).
- Este respaldo automático vive del lado de Google Cloud, separado de
  ese archivo — es la red de seguridad de fondo, no un reemplazo del
  flujo manual.
