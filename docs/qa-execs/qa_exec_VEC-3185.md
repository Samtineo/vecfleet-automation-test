# VEC-3185 — Validación de email inválido en la cola de notificaciones

**Estado:** 9/9 PASS. QA Report: [VEC-3196](https://vecfleet-kanban.atlassian.net/browse/VEC-3196).
**Módulo:** Notificaciones / Email. Doc funcional viva en El Motor (Confluence, 1617788929). Este archivo es el replay de QA (setup + corrida + gotchas).

## Feature
La cola `notificaciones_cola_emails` se procesa con `EmailQueueService::processEmailQueue()` (`POST /crons/process-email-queue`). El fix de VEC-3185 valida cada `to` con `filter_var($to, FILTER_VALIDATE_EMAIL)`: si es inválido, loguea warning + borra la fila + sigue el loop (no rompe la cola); si es válido, envía por SMTP + borra la fila.

## Prerrequisitos de entorno (vec-dev)
1. Configs activas: `notificaciones.email.modo = hibrido` y `notificaciones.email.dominios_premium`.
2. SMTP premium configurado en `notifications.email.smtp_premium.*`.
3. TF con al menos un perfil en `tipo_formulario_perfil`.
4. Al menos un usuario con ese perfil, `notificaciones_activas = 1` y email válido.

## Datos de prueba en vec-dev
- **TF 49** "QA VEC-3122 Acumulacion" (`con_movil=1`).
- **Perfil 719** "ADMINISTRADOR VF - SOLE" configurado como notificador.
- **Atributos:** AD 100 (Check Motor), AD 101 (Check Frenos). `estado=2` = DESAPROBADO.
- **Móvil de prueba:** ID 4 (CPV6A93, `base_id=1`).
- **Destinatarios:** stineo@vecfleet.io (persona 27) y smontano@vecfleet.io (persona 127).

## Payload de submit (dispara notificación)
```json
{
  "tipo_formulario_id": 49,
  "movil_id": 4,
  "latitudForm": -34.6037,
  "longitudForm": -58.3816,
  "activo": 1,
  "valores_dinamicos": [
    { "atributo_dinamico_id": 100, "estado": 2, "value": "DESAPROBADO" },
    { "atributo_dinamico_id": 101, "estado": 1, "value": "APROBADO" }
  ],
  "activos_asociados_ids": []
}
```

## Secuencia de verificación
```
1. POST /formulario          → fallas > 0
2. CHECK notificacion_emails → fila nueva
3. POST /crons/process-email-group → Ok
4. CHECK notificaciones_cola_emails → fila con to=email (válido o inválido)
5. POST /crons/process-email-queue → Ok
6. CHECK inbox               → email recibido (caso válido)
7. CHECK tablas              → vacías (fila consumida / borrada)
```

## Gotchas (operativos, no van a El Motor)
- **`perfil_notificar_activo` es red herring:** NO controla la generación de notificaciones (solo filtra listados del front). El control real está en `tipo_formulario_perfil` (pivot) + `notificaciones_activas` del usuario.
- **Timestamps `notificacion_email_personas`:** `NotificacionEmail` tiene `$timestamps=false` pero la tabla tiene `created_at`/`updated_at` NOT NULL. En clientes con strict mode (DBeaver) el INSERT manual falla → proveer ambos explícitamente. En no-strict MySQL graba `0000-00-00`.
- **`dominios_premium` usa substring (`strpos`), no dominio exacto:** "vec" matchea "vecfleet.io" pero también "service.vec.com"; "elis" desviaba todo "elis-br.com.br" al SMTP premium aunque no estuviera configurado (bug VEC-3185 original). Usar keywords específicas. Default hardcodeado si vacío: `hotmail,outlook,live,msn`.
- **Orden de crons obligatorio:** `process-email-group` primero (mueve a la cola), luego `process-email-queue` (envía). Correr solo el segundo no tiene efecto si el primero no corrió.
