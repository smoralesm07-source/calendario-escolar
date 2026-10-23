# Preparación del traslado aislado de alertas escolares

Fecha de auditoría: 2026-10-23. Documento de preparación; **no se ha realizado migración ni cambio en producción**.

## Principio de aislamiento
El servicio escolar debe trasladarse a un **proyecto Supabase distinto del proyecto principal de Atlas**. El nuevo proyecto debe pertenecer preferentemente a una organización Free propia, si es elegible; no crear una nueva instancia pagada en la organización Pro actual porque eliminaría gran parte del ahorro.

Origen actual: proyecto Supabase `bzqxvidggykkdouotylg`.
Repositorio consumidor: `calendario-escolar`, `app.js`.
Funciones: `school-alerts` (gestion de suscripciones), `school-alert-notify` (generacion y envio).
Tablas: `public.school_alert_events`, `public.school_alert_subscriptions`, `public.school_alert_deliveries`.

## Línea base del origen (2026-10-23, lectura SQL)
- 144 eventos.
- 1 suscripción.
- 64 entregas.
- Última actualización / entrega: 2026-10-23.
- RLS habilitado y ninguna política de acceso directo: deben conservarse los controles de las Edge Functions.

## Preservación
1. Obtener un backup cifrado y verificable de las tres tablas, incluyendo claves primarias, UNIQUE, FK, índice, trigger y tokens almacenados como hash. **No subir emails, hashes, secretos ni copias de datos al repositorio público**.
2. Descargar y conservar las dos Edge Functions con sus versiones y hashes; nunca publicar credenciales.
3. Preparar un proyecto Supabase nuevo e independiente. Reproducir tablas con la estructura del ORIGEN (no usar sin adaptar las tablas vacías del proyecto Atlas).
4. Importar `school_alert_subscriptions`, `school_alert_events` y finalmente `school_alert_deliveries` preservando los ID. La columna `id` de deliveries es `bigint` en origen, pero `uuid` en la copia vacía del proyecto Atlas: evitar conversiones implícitas.
5. Configurar de forma privada `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `APP_BASE_URL`, `SCHOOL_ALERT_FEED_URL`, `SUPABASE_URL` y la clave de servicio correspondiente. Nunca copiar claves de servicio a la web.
6. Validar confirmación, consulta de estado, desuscripción, generación de eventos y notificaciones sin duplicarlas. Mantener el emisor anterior bloqueado o sin agendamiento solo después de probar el nuevo.
7. Una vez verificado el nuevo endpoint, cambiar exclusivamente el valor público de `window.CALENDARIO_ALERT_API_URL` en `alert-backend-config.js` hacia `https://NUEVO-REF.supabase.co/functions/v1/school-alerts`. El archivo `index.html` de esta rama ya carga dicha configuración antes que `app.js`. **No configurar el destino ni fusionar la rama mientras falte restauración, validación de correo o las pruebas de CORS y autenticación.**
8. Tras el cambio, comparar la cantidad de registros, IDs y estadísticas de entrega; validar una entrega real controlada y conservar rollback.
9. No retirar AML CLAUDE hasta confirmar que el sitio escolar y el proceso automatizado de notificaciones usan exclusivamente el nuevo backend.

## Estado de este branch
`app.js` admite un endpoint alternativo mediante `window.CALENDARIO_ALERT_API_URL`; `index.html` carga `alert-backend-config.js`, cuyo valor actual está vacío. Mientras siga vacío, se utiliza el backend original. El branch no cambia el sitio activo ni crea gastos adicionales.

## Condición de cierre del frente escolar
La función del origen recibe cero solicitudes productivas, el sitio usa la nueva URL, las suscripciones y hashes están preservados, los envíos no se duplican y la restauración ha sido probada.
