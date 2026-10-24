# Migración completa de Calendario Escolar a Supabase de Atlas
Auditoría y copia de datos: 2026-10-24. Preparación de corte sin alterar el sitio publicado.

## Destino autorizado
Origen: `AML CLAUDE` — `bzqxvidggykkdouotylg`.
Destino: Supabase **principal** de Atlas — `ldmtlwzqaqmegedktlxr`.
El módulo escolar utiliza SOLO las tablas `public.school_alert_*` y funciones `school-alerts` / `school-alert-notify`. No requiere mezclar datos escolares con tablas analíticas de Atlas.

## EJECUTADO y verificado
- Copiadas 144 filas de `public.school_alert_events`.
- Copiada la única suscripción, con UUID, correo, preferencias de cursos, hashes de tokens, estado y timestamps.
- Copiadas 65 entregas históricas de correo, manteniendo el UUID de PK propio de Atlas y el bigint original en la columna adicional `legacy_delivery_id` (índice único).
- Validación de integridad con hashes MD5 sobre cada fila de eventos y suscripciones, y sobre todas las columnas compartidas de entregas (sin ID sustituido). Todas las comparaciones fueron iguales; 0 entregas huérfanas y 0 IDs originales perdidos.
- Se desplegó en el destino `school-alert-notify` versión 3 con el código de la función origen, JWT habilitado, sin URL del proyecto antiguo incrustada. Esto preserva compatibilidad con cursos `3D`, `6B`, `GENERAL3` y `GENERAL6`.
- La función `school-alerts` ya estaba desplegada en el proyecto Atlas; se verificó el código, sin reemplazarla.
- Código del sitio y workflow diario preparados en esta rama, no en main:
  - `alert-backend-config.js` contiene el nuevo endpoint público en Atlas.
  - `.github/workflows/sync.yml` llama al endpoint nuevo y exige `secrets.SCHOOL_SUPABASE_ANON_KEY` (secreto del proyecto destino); si falta, la tarea falla de forma visible en vez de aparentar éxito.
- No se tocó el proceso de actualización de Atlas ni ninguna tabla fuera del módulo escolar.

## BLOQUEOS ANTES DE FUSIONAR ESTA RAMA (cutover)
1. **Configurar** en GitHub Actions > Secrets and variables > Actions del repositorio `calendario-escolar`: `SCHOOL_SUPABASE_ANON_KEY` = clave **legacy anon**, activa, del proyecto principal `ldmtlwzqaqmegedktlxr`. La conexión disponible no permite editar secrets de GitHub. No usar la antigua clave de AML CLAUDE, ni service_role.
2. **Confirmar sin exponerla** que `RESEND_API_KEY` y `RESEND_FROM_EMAIL` están configuradas correctamente como secretos de las Edge Functions del proyecto Atlas; probar envío controlado en el nuevo destino. La interfaz disponible permite desplegar funciones, pero no inspeccionar su configuración secreta. Mantener las claves fuera del repositorio público.
3. Verificar `APP_BASE_URL` para enlaces de confirmación/desuscripción y `SCHOOL_ALERT_FEED_URL` al JSON del calendario.
4. Hacer una sincronización final **delta** porque AML CLAUDE sigue recibiendo notificaciones; volver a comparar eventos/suscripciones/entregas y hashes. Mantener los IDs heredados y no enviar correos de prueba no deseados.
5. Testear el endpoint de suscripción `school-alerts`: alta, confirmación, consulta, actualización y baja; comprobar con suscripción de prueba separada, sin afectar la real.
6. Testear `school-alert-notify` con feed de prueba seguro y sin doble envío. Garantizar que solo un proceso diario queda activo cuando se produzca el corte.
7. Fusionar esta rama **solo tras estas pruebas**, verificar web en GitHub Pages y una ejecución de sync.yml exitosa hacia `ldmtlwzqaqmegedktlxr`.
8. Comprobar cero solicitudes productivas al backend escolar en `bzqxvidggykkdouotylg`; si falla, volver a `main` anterior, manteniendo intactas las tablas antiguas.

## ESTADO
**Datos históricos migrados y comprobados; función de notificación equivalente desplegada. Corte de tráfico NO EJECUTADO.**
El origen sigue activo como protección. **No borrar AML CLAUDE** hasta haber validado los otros componentes de Atlas y probado el backup íntegro de ese proyecto.
