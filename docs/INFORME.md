# Informe técnico — MediPlan API

**Curso:** Computación en Internet III, Universidad Icesi (2026-2)
**Taller:** Backend – NestJS
**Proyecto:** MediPlan, sistema de gestión y seguimiento de medicamentos para adultos mayores y sus cuidadores
**Repositorio:** `https://github.com/ICESI-CI3/icesi-2026b-nestjs-taller-group-9`
**Aplicación desplegada:** `https://<su-servicio>.onrender.com/api` (Swagger en `/api/docs`). *Actualizar tras el despliegue.*

---

## 1. Descripción general

MediPlan es una API REST construida con **NestJS 11**. Usa **PostgreSQL** como base de datos y **TypeORM** como ORM. Implementa los cuatro módulos funcionales del anteproyecto:

1. **Medicamentos y horarios**: CRUD con validación de horarios (HH:mm), fechas de tratamiento, consulta automática a **openFDA** y alerta de interacciones con los demás medicamentos activos del paciente.
2. **Registro de tomas**: generación automática diaria de las tomas (`PENDIENTE`), marcado `TOMADO`/`OMITIDO` y detección automática de omisiones (más de 2 h sin marcar).
3. **Contactos de emergencia y familiares**: hasta 10 contactos por paciente, siempre al menos uno de emergencia, teléfono en formato E.164 y vínculo opcional con un usuario `ROLE_FAMILY`, que obtiene acceso de solo lectura.
4. **Reportes y estadísticas**: adherencia global con serie diaria, adherencia por medicamento, patrones de omisión (heatmap día × hora), historial paginado, dashboard y **exportación a PDF**.

Las integraciones externas son **openFDA** (Drug Label API) y **Twilio** (SMS/WhatsApp). Si Twilio no tiene credenciales, el sistema funciona en modo simulado.

### 1.1 Arquitectura

```
Cliente (Swagger / Postman / Frontend)
        │  HTTPS + JSON  (Authorization: Bearer <JWT>)
        ▼
┌──────────────────────────── NestJS ────────────────────────────┐
│ Guards globales: Throttler → JwtAuthGuard → RolesGuard          │
│ ValidationPipe (class-validator) · ResponseInterceptor · Filter │
│                                                                 │
│ AuthModule  UsersModule  MedicamentosModule  TomasModule        │
│ ContactosModule (PatientAccessService)  ReportesModule (PDF)    │
│ NotificacionesModule (Twilio)  OpenFdaModule  SeedModule        │
│ TomasScheduler (@nestjs/schedule: cron jobs)                    │
└───────────────┬───────────────────────────────┬─────────────────┘
                │ TypeORM (repositorios)        │ fetch
                ▼                               ▼
          PostgreSQL 16                 openFDA · Twilio
```

Cada módulo sigue la separación **controller → service → repository (TypeORM)**. Los DTOs se validan con `class-validator` y las entidades viven en `entities/`.

### 1.2 Formato de respuesta

Un interceptor global envuelve toda respuesta exitosa:

```json
{ "status": 200, "message": "OK", "data": { }, "timestamp": "2026-10-05T15:30:00.000Z" }
```

Un filtro global de excepciones normaliza los errores (incluye los de PostgreSQL: `23505` → 409 y `23503` → 400):

```json
{ "status": 400, "error": "Bad Request", "message": ["El email no es válido"], "timestamp": "...", "path": "/api/auth/register" }
```

Los listados paginados devuelven `data = { items: [...], meta: { page, size, totalItems, totalPages } }`.

| Código | Uso |
|---|---|
| 200 | GET, PUT, PATCH y acciones POST (login, refresh, jobs) |
| 201 | Recurso creado (POST) |
| 204 | Eliminación (DELETE) |
| 400 | Validación de datos, UUID inválido, regla de negocio |
| 401 | Token ausente, inválido, expirado o revocado; credenciales o código 2FA inválidos |
| 403 | Rol sin permiso o sin acceso al paciente; usuario inactivo |
| 404 | Recurso no encontrado |
| 409 | Conflicto (email duplicado, toma ya registrada, regla de contactos) |
| 429 | Demasiados intentos de login |

---

## 2. Autenticación

### 2.1 JWT con access y refresh token

- **Login** (`POST /api/auth/login`): valida email y contraseña con **bcrypt** (costo 12). Si es correcto crea una **sesión** en la tabla `sesiones` y devuelve:
  - `accessToken`: JWT HS256, **15 min**. Payload: `{ sub, sid, email, rol, type: "access" }`, sin datos médicos.
  - `refreshToken`: JWT firmado con **otro secreto**, **7 días**. Payload: `{ sub, sid, type: "refresh", jti }`.
- En la BD solo se guarda el **hash SHA-256 del refresh token**.
- **Refresh** (`POST /api/auth/refresh`): verifica la firma, que la sesión exista, no esté revocada ni expirada y que el hash coincida. Después **rota** el refresh token: el anterior queda inválido, lo que permite detectar su reutilización.
- **Rutas protegidas**: el `JwtAuthGuard` es **global** (`APP_GUARD`) y solo las rutas marcadas con `@Public()` quedan abiertas. La `JwtStrategy` (passport-jwt) valida la firma y la expiración. Luego `AuthService.validateAccessPayload` comprueba en la BD que la sesión siga activa y que el usuario esté activo, y **toma el rol vigente de la BD**, de modo que un cambio de rol hecho por el admin aplica de inmediato.
- **Logout** (`POST /api/auth/logout`): marca la sesión como revocada (`revocada_en`). Desde ese momento **el access token y el refresh token de esa sesión dejan de funcionar** (401), sin esperar a que expiren.
- **Cambio de contraseña**: verifica la contraseña actual y **revoca todas las demás sesiones** del usuario.
- **Fuerza bruta**: `@nestjs/throttler` limita el login y la verificación 2FA a **5 intentos por minuto por IP + email**. El resto de la API tiene un límite general de 100 peticiones por minuto. Se usa `helmet` para las cabeceras de seguridad y CORS es configurable.

### 2.2 Segundo factor (2FA, TOTP RFC 6238)

1. `POST /api/auth/2fa/setup`: genera un secreto (otplib) y devuelve `secret`, `otpauthUrl` y `qrCodeDataUrl` (QR en PNG base64) para escanear con Google Authenticator o Authy.
2. `POST /api/auth/2fa/enable { code }`: activa el 2FA solo si el código es válido, lo que prueba que la app quedó bien configurada.
3. Desde entonces el **login devuelve** `{ requiresTwoFactor: true, twoFactorToken }`. El `twoFactorToken` es un JWT de 5 min con `type: "2fa"` que **no sirve como access token**.
4. `POST /api/auth/2fa/verify { twoFactorToken, code }`: completa el login y entrega los tokens.
5. `POST /api/auth/2fa/disable { code }`: desactiva el 2FA (exige un código válido).

Se acepta una ventana de ±30 s por desfases de reloj. El secreto TOTP nunca se serializa en las respuestas (`select: false` + `@Exclude`).

---

## 3. Autorización

### 3.1 Roles

| Rol | Descripción | Permisos |
|---|---|---|
| `ROLE_ADMIN` | Administrador del sistema | Gestiona usuarios y **asigna roles**, activa o desactiva cuentas, ejecuta el seed y los jobs, y consulta (solo lectura) los datos de cualquier paciente |
| `ROLE_CAREGIVER` | Cuidador/paciente | CRUD de sus medicamentos, marca tomas, gestiona contactos, consulta y exporta reportes |
| `ROLE_FAMILY` | Familiar remoto | **Solo lectura** de medicamentos, tomas, contactos, reportes y notificaciones de los pacientes a los que está vinculado |

### 3.2 Mecanismos

- **Por rol (RBAC)**: el decorador `@Roles(...)` más el `RolesGuard` global. Si el rol no está permitido responde **403**. Por ejemplo, `POST /api/medicamentos` exige `ROLE_CAREGIVER`, así que un familiar recibe 403.
- **Por datos (pertenencia)**: `PatientAccessService` aplica la regla 17.2 del anteproyecto: *"un usuario solo puede acceder a datos de pacientes con los que tiene relación directa"*.
  - CAREGIVER: solo a sí mismo. Pedir otro `pacienteId` da 403, y modificar recursos ajenos también.
  - FAMILY: solo a los pacientes donde existe un `ContactoFamiliar` con su `usuario_id`. Si está vinculado a un único paciente, `pacienteId` es opcional.
  - ADMIN: puede leer cualquier paciente indicando `pacienteId`.
- **Administración de roles**: los usuarios se registran como `ROLE_CAREGIVER` o `ROLE_FAMILY` (no pueden auto-asignarse `ROLE_ADMIN`). El admin cambia roles con `PATCH /api/users/:id/role` y el estado con `PATCH /api/users/:id/status`. No puede cambiar su propio rol ni desactivarse a sí mismo. Al arrancar, si no existe ningún admin, se crea uno con `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

El orden de los guards globales es: `AppThrottlerGuard` → `JwtAuthGuard` → `RolesGuard`.

---

## 4. Persistencia

- **ORM**: TypeORM 0.3 con `@nestjs/typeorm` y PostgreSQL 16. La configuración está centralizada en `src/config/typeorm.config.ts` y acepta `DATABASE_URL` (Render) o `DB_*`.
- **Migraciones**: `synchronize: false`. El esquema se crea con la migración versionada `src/database/migrations/*-InitialSchema.ts` (enums, tablas, índices y llaves foráneas), que se aplica sola al iniciar (`migrationsRun: true`). Para generar nuevas: `npm run migration:generate`.
- **Validación de configuración**: Joi valida las variables de entorno al arrancar (por ejemplo, los secretos JWT son obligatorios).
- **Repositorios**: `@InjectRepository` con consultas tipadas (`find`, `findAndCount`, operadores `Between`, `ILike`, `In`, etc.). No hay SQL concatenado, lo que evita inyección SQL. La generación de tomas usa `INSERT … ON CONFLICT DO NOTHING` (idempotente) y la detección de omisiones hace un `UPDATE` masivo.

### 4.1 Modelo de datos

| Tabla | Campos principales | Relaciones / restricciones |
|---|---|---|
| `usuarios` | id (uuid), nombre, email (único), password_hash, rol (enum), telefono, activo, ultimo_login, two_factor_enabled, two_factor_secret | — |
| `sesiones` | id (uuid = `sid` del JWT), refresh_token_hash, expira_en, revocada_en, user_agent | N:1 usuario (CASCADE) |
| `medicamentos` | id, nombre, principio_activo, dosis, frecuencia, horarios (jsonb), fecha_inicio, fecha_fin (null = crónico), instrucciones, activo, info_openfda (jsonb) | N:1 usuario (paciente). Índice `idx_medicamento_paciente` |
| `registros_toma` | id, fecha (date), hora_programada (time), hora_real (timestamptz), estado (enum), notas, notificacion_enviada, omision_automatica | N:1 medicamento, N:1 usuario. **Único** `(medicamento_id, fecha, hora_programada)`. Índices `idx_toma_paciente_fecha`, `idx_toma_estado`, `idx_toma_medicamento` |
| `contactos_familiares` | id, nombre, relacion, telefono (E.164), email, es_emergencia, recibe_notificaciones | N:1 paciente, N:0..1 usuario (FAMILY, SET NULL). Único `(paciente_id, usuario_id)` |
| `notificaciones` | id, tipo (DOSIS_OMITIDA / RESUMEN_DIARIO), canal (SMS / WHATSAPP), destino, mensaje, estado (ENVIADA / FALLIDA / SIMULADA), estado_proveedor, proveedor_sid, error, intentos | N:1 paciente, N:1 contacto, N:1 toma |

La eliminación de un medicamento es **lógica** (`activo = false`) y el historial de tomas se conserva. Las tomas **no se pueden eliminar**.

### 4.2 Procesos automáticos (scheduler)

| Job | Cuándo | Qué hace |
|---|---|---|
| `generar-tomas` | 00:01 (America/Bogota) y al iniciar la app | Desactiva tratamientos vencidos y crea las tomas `PENDIENTE` de cada medicamento activo |
| `detectar-omisiones` | Cada 5 min | Marca `OMITIDO` (automático) las tomas pendientes con más de 2 h de retraso, notifica a los familiares y reintenta los envíos fallidos |
| `resumen-diario` | 21:00 | Envía a los familiares: *"Resumen MediPlan: X tomó T de N dosis programadas hoy (P% adherencia)"* |

Los tres jobs también pueden ejecutarse a mano como ADMIN en `/api/tomas/jobs/*`.

---

## 5. Endpoints

Prefijo: `/api`. Las columnas *Params* indican body (B), query (Q) y path (P). Los endpoints "Autenticado*" aplican el control de acceso por paciente de la sección 3.2.

### 5.1 Autenticación (`/auth`)

| Método y ruta | Acceso | Params | Respuesta |
|---|---|---|---|
| `POST /auth/register` | Público | B: `nombre`, `email`, `password` (mín. 8, con mayúscula, minúscula y número), `rol` (`ROLE_CAREGIVER` \| `ROLE_FAMILY`), `telefono?` (E.164) | 201: usuario (sin secretos). 400 validación. 409 email duplicado |
| `POST /auth/login` | Público (5/min) | B: `email`, `password` | 200: `{ accessToken, refreshToken, tokenType, expiresIn, requiresTwoFactor: false, usuario }` o `{ requiresTwoFactor: true, twoFactorToken, expiresIn }`. 401 credenciales. 403 inactivo. 429 |
| `POST /auth/2fa/verify` | Público (5/min) | B: `twoFactorToken`, `code` (6 dígitos) | 200: tokens + usuario. 401 código o token inválido |
| `POST /auth/refresh` | Público | B: `refreshToken` | 200: `{ accessToken, refreshToken, tokenType, expiresIn }` (rotado). 401 inválido o revocado |
| `POST /auth/logout` | Autenticado | — | 200: `{ message }`. Revoca la sesión |
| `GET /auth/me` | Autenticado | — | 200: perfil |
| `PUT /auth/me` | Autenticado | B: `nombre?`, `email?`, `telefono?` | 200: perfil actualizado. 409 email en uso |
| `PUT /auth/change-password` | Autenticado | B: `currentPassword`, `newPassword` | 200. 401 contraseña actual incorrecta. 400 si es igual a la anterior |
| `POST /auth/2fa/setup` | Autenticado | — | 201: `{ secret, otpauthUrl, qrCodeDataUrl }`. 409 si ya está activo |
| `POST /auth/2fa/enable` | Autenticado | B: `code` | 200. 401 código inválido. 400 sin setup previo |
| `POST /auth/2fa/disable` | Autenticado | B: `code` | 200. 401 código inválido. 400 si no está activo |

### 5.2 Usuarios (`/users`): solo `ROLE_ADMIN`

| Método y ruta | Params | Respuesta |
|---|---|---|
| `POST /users` | B: `nombre`, `email`, `password`, `rol` (cualquiera), `telefono?` | 201: usuario. 409 |
| `GET /users` | Q: `page`, `size`, `rol?`, `search?` (nombre o email) | 200: paginado |
| `GET /users/:id` | P: `id` (uuid) | 200. 404 |
| `PATCH /users/:id/role` | B: `rol` | 200: usuario con el nuevo rol. 400 si es el propio admin o el rol no es válido |
| `PATCH /users/:id/status` | B: `activo` (boolean) | 200. 400 si es el propio admin |

### 5.3 Medicamentos (`/medicamentos`)

| Método y ruta | Acceso | Params | Respuesta |
|---|---|---|---|
| `POST /medicamentos` | CAREGIVER | B: `nombre`, `principioActivo`, `dosis`, `frecuencia`, `horarios[]` (HH:mm, únicos, 1–24), `fechaInicio`, `fechaFin?` (≥ inicio), `instrucciones?` | 201: `{ medicamento, alertas: { advertencias[], interacciones[], mensaje? }, tomasGeneradasHoy }`. 400. 403 |
| `GET /medicamentos` | Autenticado* | Q: `pacienteId?`, `activo?`, `nombre?` (nombre o principio activo), `page`, `size` | 200: paginado |
| `GET /medicamentos/:id` | Autenticado* | P: `id` | 200: `{ medicamento (con infoOpenfda), alertas }`. 403. 404 |
| `PUT /medicamentos/:id` | CAREGIVER (dueño) | B: cualquier campo de creación | 200: `{ medicamento, alertas, tomasGeneradasHoy }`. Si cambia el principio activo se vuelve a consultar openFDA |
| `PATCH /medicamentos/:id/toggle` | CAREGIVER (dueño) | — | 200: medicamento con `activo` invertido. Al reactivar genera las tomas restantes del día |
| `DELETE /medicamentos/:id` | CAREGIVER (dueño) | — | 204: soft delete (`activo=false`) |
| `GET /openfda/consulta` | Autenticado | Q: `principioActivo` | 200: información de openFDA (advertencias, interacciones, reacciones adversas, indicaciones, dosificación) |

**Integración openFDA**: `GET https://api.fda.gov/drug/label.json?search=openfda.generic_name:"<término>"&limit=1`. Como openFDA indexa los nombres en inglés, se traducen los principios activos en español más comunes (metformina → metformin, losartán → losartan…) y se aplican heurísticas. Si no encuentra resultados o la API falla, el medicamento se registra igual con un aviso. Las interacciones se cruzan con los demás medicamentos activos del paciente.

### 5.4 Tomas (`/tomas`)

| Método y ruta | Acceso | Params | Respuesta |
|---|---|---|---|
| `GET /tomas` | Autenticado* | Q: `pacienteId?`, `fecha?`, `desde?`, `hasta?`, `estado?`, `medicamentoId?`, `page`, `size` | 200: paginado (cada toma incluye `medicamento { id, nombre, dosis, principioActivo }`). 400 si el rango está invertido |
| `GET /tomas/hoy` | Autenticado* | Q: `pacienteId?`, `estado?` | 200: tomas de hoy ordenadas por hora |
| `GET /tomas/resumen` | Autenticado* | Q: `pacienteId?`, `fecha?` | 200: `{ fecha, total, pendientes, tomadas, omitidas, adherencia }` |
| `GET /tomas/:id` | Autenticado* | P: `id` | 200. 403. 404 |
| `PATCH /tomas/:id` | CAREGIVER (dueño) | B: `estado` (`TOMADO` \| `OMITIDO`), `notas?` | 200. `TOMADO` registra `horaReal` (hora del servidor). `OMITIDO` notifica a los familiares. 400 si la fecha es futura. 409 si ya estaba TOMADO o en el mismo estado |
| `POST /tomas/jobs/generar` | ADMIN | B: `fecha?` | 200: `{ creadas }` (idempotente) |
| `POST /tomas/jobs/detectar-omisiones` | ADMIN | — | 200: `{ omitidas, notificaciones }` |
| `POST /tomas/jobs/resumen-diario` | ADMIN | B: `fecha?` | 200: `{ pacientes, notificaciones }` |

### 5.5 Contactos (`/contactos`)

| Método y ruta | Acceso | Params | Respuesta |
|---|---|---|---|
| `POST /contactos` | CAREGIVER | B: `nombre`, `relacion`, `telefono` (E.164), `email?`, `esEmergencia?`, `recibeNotificaciones?`, `usuarioEmail?` (usuario FAMILY a vincular) | 201. Si no hay contacto de emergencia, este queda como tal. 409 si supera 10 contactos o el usuario ya está vinculado. 400 si el usuario no es FAMILY |
| `GET /contactos` | Autenticado* | Q: `pacienteId?` | 200: lista (emergencias primero) |
| `GET /contactos/mis-pacientes` | FAMILY | — | 200: `[{ pacienteId, nombre, email, relacion, esEmergencia }]` |
| `GET /contactos/:id` | Autenticado* | P: `id` | 200. 403. 404 |
| `PUT /contactos/:id` | CAREGIVER (dueño) | B: campos de creación (parciales) | 200. 409 si se quita el único contacto de emergencia |
| `DELETE /contactos/:id` | CAREGIVER (dueño) | — | 204. 409 si es la única emergencia y quedan otros contactos |
| `PATCH /contactos/:id/notificaciones` | CAREGIVER (dueño) | B: `recibeNotificaciones` | 200 |

### 5.6 Reportes (`/reportes`): Autenticado*

`periodo` ∈ `7d`, `30d` (por defecto) y `90d`. Fórmula: **Adherencia (%) = tomas TOMADO / total de tomas programadas × 100**.

| Método y ruta | Params | Respuesta |
|---|---|---|
| `GET /reportes/adherencia` | Q: `periodo`, `pacienteId?` | `{ desde, hasta, total, tomadas, omitidas, pendientes, adherencia, serie: [{ fecha, total, tomadas, …, adherencia }] }` (para el gráfico de líneas y el gauge) |
| `GET /reportes/por-medicamento` | Q: `periodo`, `pacienteId?` | `{ medicamentos: [{ medicamentoId, nombre, dosis, total, tomadas, omitidas, adherencia, tasaOmision }] }`, ordenado de peor a mejor (gráfico de barras) |
| `GET /reportes/patrones` | Q: `periodo`, `pacienteId?` | `{ totalOmitidas, heatmap[7][24], porDia[], porHora[], peorDia, peorHora }` |
| `GET /reportes/historial` | Q: `fechaInicio?`, `fechaFin?`, `medicamentoId?`, `estado?`, `page`, `size`, `pacienteId?` | Paginado y cronológico |
| `GET /reportes/resumen` | Q: `pacienteId?` | Dashboard: `{ paciente, hoy, adherencia7d, medicamentosActivos, proximaToma, alertas[] }` |
| `GET /reportes/exportar/pdf` | Q: `periodo`, `pacienteId?` | `application/pdf` descargable con resumen, gráfico de barras, tablas por medicamento, patrones e historial |

### 5.7 Notificaciones, seed y health

| Método y ruta | Acceso | Params | Respuesta |
|---|---|---|---|
| `GET /notificaciones` | Autenticado* | Q: `pacienteId?`, `tipo?`, `estado?`, `page`, `size` | 200: historial paginado de alertas |
| `POST /notificaciones/reintentar` | ADMIN | — | 200: `{ reintentadas, enviadas }` |
| `POST /seed` | ADMIN | — | 200: conteos y credenciales demo. Reinicia la BD |
| `GET /health` | Público | — | 200: `{ status, database, uptime }` |

**Twilio**: `POST https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json` con `To` (teléfono E.164, con prefijo `whatsapp:` en WhatsApp), `From` y `Body`. Se registran el SID, el estado del proveedor y el error, y los envíos fallidos se reintentan hasta 3 veces.

---

## 6. Pruebas

| Tipo | Herramienta | Comando | Resultado |
|---|---|---|---|
| Unitarias | Jest + mocks (`@nestjs/testing`) | `npm run test:cov` | **207 pruebas, 37 suites.** Cobertura: statements **98.84 %**, branches **85.44 %**, functions **94.47 %**, lines **98.92 %** |
| Integración | Supertest + PostgreSQL real | `npm run test:e2e` | **57 pruebas, 2 suites** |
| Manuales | Postman / Newman | `npx newman run postman/MediPlan.postman_collection.json` | **71 peticiones, 79 aserciones, 0 fallos** |

- **Unitarias**: cubren servicios (reglas de negocio, casos de error), controladores, guards, la estrategia JWT, el filtro de excepciones, el interceptor, las utilidades de fecha y zona horaria, los cálculos de reportes, la generación de PDF, el cliente de openFDA (con `fetch` simulado), el cliente de Twilio, el scheduler y el seed. El umbral mínimo de 80 % está configurado en `package.json` (`coverageThreshold`) y el pipeline falla si no se alcanza.
- **Integración** (`test/*.e2e-spec.ts`): levantan la aplicación completa (`AppModule` + `setupApp`) sobre la base `mediplan_test`, que se recrea en cada suite aplicando las migraciones. Cubren registro, login, refresh con rotación, 2FA completo (setup, enable, login en 2 pasos y disable), cambio de contraseña, logout con revocación inmediata, administración de roles con efecto inmediato, desactivación de usuarios, seed, CRUD de medicamentos con validaciones, permisos FAMILY/CAREGIVER/ADMIN, generación idempotente de tomas, marcado y transiciones, notificación por omisión, job de omisiones, reglas de contactos, todos los reportes y la descarga del PDF.

*(Adjunte aquí capturas de `npm run test:cov`, `npm run test:e2e` y de la ejecución del pipeline en GitHub Actions.)*

## 7. Despliegue y CI/CD

- **Contenedor**: `Dockerfile` multi-etapa (node:24-alpine), corre como usuario sin privilegios.
- **Nube**: Render (`render.yaml` crea PostgreSQL y el servicio web, con health check en `/api/health`).
- **Pipeline** (`.github/workflows/ci-cd.yml`): `lint-unit` (ESLint, build, Jest con cobertura) y `e2e` (servicio PostgreSQL) se ejecutan en cada push y PR. El job `deploy` corre solo en `main` si los anteriores pasan: dispara el deploy hook de Render y verifica el health check.
- **Antes del push**: un hook de Husky (`.husky/pre-push`) ejecuta lint y pruebas unitarias.

## 8. Seguridad (resumen)

bcrypt (costo 12), JWT de corta duración con sesiones revocables, rotación de refresh tokens, 2FA TOTP, rate limiting en el login, `helmet`, CORS configurable, validación estricta de entrada (`whitelist` + `forbidNonWhitelisted`), consultas parametrizadas del ORM, secretos solo en variables de entorno validadas con Joi, secretos excluidos de las respuestas (`select: false` + `@Exclude`) y tokens sin información médica.
