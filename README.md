# MediPlan API

Backend de **MediPlan**: un sistema para gestionar y seguir los medicamentos de adultos mayores y sus cuidadores. Está hecho con **NestJS + PostgreSQL (TypeORM)** para el taller *Backend – NestJS* de Computación en Internet III (Universidad Icesi, 2026-2).

MediPlan permite a pacientes/cuidadores registrar sus medicamentos y horarios, marcar cada dosis como tomada u omitida y generar reportes de adherencia (también en PDF). Los familiares remotos pueden monitorear el tratamiento en modo solo lectura y reciben alertas (Twilio SMS/WhatsApp) cuando se omite una dosis. Al registrar un medicamento se consulta **openFDA** para mostrar advertencias e interacciones.

> **App desplegada:** <https://mediplan-api-sm1x.onrender.com/api> · Swagger: <https://mediplan-api-sm1x.onrender.com/api/docs>

> El informe técnico detallado (endpoints, parámetros, respuestas, autenticación, autorización y persistencia) está en [`docs/INFORME.md`](docs/INFORME.md).

---

## Cumplimiento de la rúbrica del taller

| Requisito (peso) | Implementación |
|---|---|
| **Seed (5 %)** | `POST /api/seed` (solo ADMIN) y script `npm run seed`. Cargan el usuario **admin**, cuidadores (uno con 2FA), familiares, 6 medicamentos, 30 días de tomas, contactos y notificaciones. Además, al arrancar se crea el admin si no existe. |
| **Autenticación (5 %)** | JWT (access de 15 min + refresh de 7 días con rotación) y **2FA TOTP** (Google Authenticator/Authy) con QR. Login, logout (revoca la sesión: access y refresh dejan de servir al instante), rutas protegidas por un guard global. bcrypt con costo 12 y rate limiting en el login. |
| **Autorización (5 %)** | 3 roles: `ROLE_ADMIN`, `ROLE_CAREGIVER` y `ROLE_FAMILY`. Usa `@Roles()` + `RolesGuard` global y control de acceso por paciente (un familiar solo ve a los pacientes a los que está vinculado). **Administración de roles**: `PATCH /api/users/:id/role` y `PATCH /api/users/:id/status`. |
| **Pruebas (25 %)** | **207 pruebas unitarias (Jest)** con cobertura de **98.8 % de statements / 85 % de branches**, y **57 pruebas de integración (Supertest)** contra PostgreSQL real. El umbral de 80 % se exige en `jest.coverageThreshold`. |
| **Persistencia (10 %)** | TypeORM + PostgreSQL 16 con 6 entidades, relaciones, índices, constraint único `(medicamento, fecha, hora)` y **migraciones versionadas** que se ejecutan automáticamente. |
| **Funcionalidades (25 %)** | Los 4 módulos del anteproyecto (medicamentos, tomas, contactos y reportes con PDF) más openFDA, Twilio y jobs programados. **48 endpoints**. Colección Postman en [`postman/MediPlan.postman_collection.json`](postman/MediPlan.postman_collection.json). |
| **Informe (10 %)** | [`docs/INFORME.md`](docs/INFORME.md) y la documentación Swagger en `/api/docs`. |
| **Despliegue (15 %)** | `Dockerfile`, blueprint de Render (`render.yaml`) y pipeline de GitHub Actions: lint → pruebas unitarias → e2e → **deploy automático** a Render solo si todo pasa. |
| **GitHub Actions antes del push** | Workflow `.github/workflows/ci-cd.yml` (en cada push/PR) y hook **Husky `pre-push`** que ejecuta lint y pruebas antes de cada `git push`. |
| **Swagger** | Todos los endpoints están documentados en **`/api/docs`** (JSON en `/api/docs-json`), con autenticación Bearer. |

---

## Stack

- **NestJS 11** (TypeScript, Express)
- **PostgreSQL 16** + **TypeORM 0.3** (migraciones)
- **@nestjs/jwt + passport-jwt**, **bcryptjs**, **otplib** (TOTP) y **qrcode**
- **@nestjs/schedule** (cron jobs), **@nestjs/throttler** (rate limiting) y **helmet**
- **@nestjs/swagger** (OpenAPI), **class-validator** y **Joi** (validación de variables de entorno)
- **pdfkit** (reportes PDF), **openFDA** (fetch) y **Twilio** (API REST)
- **Jest + Supertest**, **ESLint + Prettier** y **Husky**

## Requisitos

- Node.js ≥ 20 (probado con Node 24)
- Docker (para PostgreSQL), o un PostgreSQL ≥ 14 propio

## Puesta en marcha (local)

```bash
# 1. Dependencias
npm install

# 2. Variables de entorno
cp .env.example .env          # ajuste los secretos si lo desea

# 3. Base de datos (crea "mediplan" y "mediplan_test")
docker compose up -d db

# 4. Ejecutar la API (aplica las migraciones al iniciar)
npm run start:dev

# 5. Cargar los datos de demostración
npm run seed
```

- API: <http://localhost:3000/api>
- Swagger: <http://localhost:3000/api/docs>
- Health: <http://localhost:3000/api/health>

También puede levantar todo con Docker: `docker compose --profile full up --build`.

### Usuarios de demostración (seed)

| Rol | Email | Contraseña | Notas |
|---|---|---|---|
| ROLE_ADMIN | `admin@mediplan.com` | `Admin123*` | Configurable con `ADMIN_EMAIL` / `ADMIN_PASSWORD` |
| ROLE_CAREGIVER | `cuidador@mediplan.com` | `Cuidador123*` | María Gómez: 4 medicamentos, 30 días de historial |
| ROLE_CAREGIVER | `cuidador2fa@mediplan.com` | `Cuidador123*` | **2FA activo**. Clave TOTP: `KVKFKRCPNZQUYMLXOVYDSQKJKZDTSRLD` |
| ROLE_FAMILY | `familiar@mediplan.com` | `Familiar123*` | Andrés, vinculado a María |
| ROLE_FAMILY | `familiar2@mediplan.com` | `Familiar123*` | Lucía, vinculada a Jorge |

Para probar el 2FA del usuario demo, agregue la clave en Google Authenticator/Authy ("Ingresar clave de configuración"), o genere un código con:
`node -e "console.log(require('otplib').authenticator.generate('KVKFKRCPNZQUYMLXOVYDSQKJKZDTSRLD'))"`.

## Cómo probar cada funcionalidad

1. **Swagger** (`/api/docs`): haga `POST /api/auth/login`, copie el `accessToken` y péguelo en **Authorize**.
2. **Postman**: importe `postman/MediPlan.postman_collection.json`, ajuste `baseUrl` y use **Run collection**. La colección guarda los tokens y los IDs automáticamente e incluso calcula el código 2FA. Corre de punta a punta sin intervención (71 peticiones / 79 aserciones). Para correrla por consola:
   ```bash
   npx newman run postman/MediPlan.postman_collection.json --env-var baseUrl=http://localhost:3000
   ```
3. **Flujo sugerido**: login admin → seed → login cuidador → crear medicamento (ver alertas de openFDA) → `POST /api/tomas/jobs/generar` (admin) → `GET /api/tomas/hoy` → `PATCH /api/tomas/:id` (TOMADO/OMITIDO) → ver la notificación del familiar en `GET /api/notificaciones` → reportes → `GET /api/reportes/exportar/pdf`.

## Pruebas

```bash
npm test              # unitarias (Jest)
npm run test:cov      # unitarias + reporte de cobertura (coverage/lcov-report/index.html)
npm run test:e2e      # integración (Supertest) contra PostgreSQL: requiere `docker compose up -d db`
npm run test:all      # ambas
```

Resultado actual:

| Suite | Pruebas | Cobertura |
|---|---|---|
| Unitarias (Jest) | 207 en 37 suites | Statements 98.84 % · Branches 85.44 % · Functions 94.47 % · Lines 98.92 % |
| Integración (Supertest) | 57 en 2 suites | Flujos completos de auth, 2FA, roles, medicamentos, tomas, contactos, reportes y PDF |

Las pruebas e2e usan `.env.test` (base `mediplan_test`): el esquema se borra y se recrea con las migraciones en cada suite, y openFDA y el scheduler quedan deshabilitados.

## CI/CD y despliegue

**Pipeline** (`.github/workflows/ci-cd.yml`), en cada push y pull request:

1. `lint-unit`: `npm ci` → ESLint → build → Jest con cobertura (falla si baja del 80 %).
2. `e2e`: levanta un servicio PostgreSQL 16 y ejecuta las pruebas de Supertest.
3. `deploy` (solo en `main` y si los dos jobs anteriores pasan): dispara el *deploy hook* de Render y verifica `GET /api/health`.

**Hook local**: Husky ejecuta `npm run lint:check` y `npm test` en cada `git push` (`.husky/pre-push`). Se instala con `npm install`.

### Desplegar en Render (gratis)

1. En Render: **New → Blueprint** y seleccione este repositorio. `render.yaml` crea la BD PostgreSQL y el servicio web (los secretos JWT se generan solos). Defina `ADMIN_PASSWORD` cuando se lo pida.
2. En el servicio web: **Settings → Deploy Hook**. Copie la URL.
3. En GitHub: **Settings → Secrets and variables → Actions**:
   - Secret `RENDER_DEPLOY_HOOK_URL` = la URL del paso 2.
   - Variable `APP_URL` = la URL pública (ej. `https://mediplan-api.onrender.com`).
4. Haga push a `main`: GitHub Actions prueba y, si todo pasa, despliega.
5. Cargue los datos: login como admin y `POST /api/seed`.

> Las migraciones se aplican solas al arrancar. En el plan gratuito de Render el servicio se duerme por inactividad. Al despertar, la app genera las tomas del día que falten (job al iniciar).

**Variables de Twilio** (opcionales): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` y `TWILIO_CHANNEL=sms|whatsapp`. Sin ellas, las notificaciones se guardan con estado `SIMULADA`.

## Endpoints

Prefijo global `/api`. Todas las respuestas exitosas tienen la forma `{ status, message, data, timestamp }` y los errores `{ status, error, message, timestamp, path }`.

| Módulo | Método y ruta | Rol |
|---|---|---|
| Auth | `POST /auth/register` · `POST /auth/login` · `POST /auth/2fa/verify` · `POST /auth/refresh` | Público |
| Auth | `POST /auth/logout` · `GET/PUT /auth/me` · `PUT /auth/change-password` · `POST /auth/2fa/setup` · `POST /auth/2fa/enable` · `POST /auth/2fa/disable` | Autenticado |
| Usuarios | `POST /users` · `GET /users` · `GET /users/:id` · `PATCH /users/:id/role` · `PATCH /users/:id/status` | ADMIN |
| Medicamentos | `GET /medicamentos` · `GET /medicamentos/:id` | Autenticado* |
| Medicamentos | `POST /medicamentos` · `PUT /medicamentos/:id` · `PATCH /medicamentos/:id/toggle` · `DELETE /medicamentos/:id` | CAREGIVER |
| Tomas | `GET /tomas` · `GET /tomas/hoy` · `GET /tomas/resumen` · `GET /tomas/:id` | Autenticado* |
| Tomas | `PATCH /tomas/:id` | CAREGIVER |
| Tomas (jobs) | `POST /tomas/jobs/generar` · `POST /tomas/jobs/detectar-omisiones` · `POST /tomas/jobs/resumen-diario` | ADMIN |
| Contactos | `GET /contactos` · `GET /contactos/:id` | Autenticado* |
| Contactos | `GET /contactos/mis-pacientes` | FAMILY |
| Contactos | `POST /contactos` · `PUT /contactos/:id` · `DELETE /contactos/:id` · `PATCH /contactos/:id/notificaciones` | CAREGIVER |
| Reportes | `GET /reportes/adherencia` · `/por-medicamento` · `/patrones` · `/historial` · `/resumen` · `/exportar/pdf` | Autenticado* |
| Notificaciones | `GET /notificaciones` | Autenticado* |
| Notificaciones | `POST /notificaciones/reintentar` | ADMIN |
| openFDA | `GET /openfda/consulta?principioActivo=` | Autenticado |
| Seed | `POST /seed` | ADMIN |
| Health | `GET /health` | Público |

\* Con control de acceso por paciente: el CAREGIVER ve sus propios datos, el FAMILY solo los de los pacientes a los que está vinculado (`pacienteId` es opcional si está vinculado a uno solo) y el ADMIN debe indicar `pacienteId`.

## Estructura

```
src/
├── auth/            # login, JWT, refresh, logout, 2FA (TOTP), sesiones
├── users/           # usuarios, administración de roles, admin inicial
├── medicamentos/    # módulo 1: medicamentos y horarios
├── tomas/           # módulo 2: registro de tomas + scheduler (cron jobs)
├── contactos/       # módulo 3: contactos + control de acceso por paciente
├── reportes/        # módulo 4: adherencia, patrones, historial, PDF
├── notificaciones/  # Twilio (SMS/WhatsApp) + historial de envíos
├── openfda/         # integración openFDA (Drug Label API)
├── seed/            # endpoint y script de datos iniciales
├── health/          # health check
├── common/          # guards, decoradores, filtros, interceptores, utilidades
├── config/          # validación de .env y configuración de TypeORM
└── database/migrations/
test/                # pruebas e2e (Supertest)
postman/             # colección Postman
docs/INFORME.md      # informe técnico
```

## Scripts útiles

| Script | Descripción |
|---|---|
| `npm run start:dev` | API en modo watch |
| `npm run build` / `npm run start:prod` | Compilar y ejecutar `dist/` |
| `npm run seed` / `npm run seed:prod` | Cargar los datos demo (TS / compilado) |
| `npm run migration:generate` | Generar una migración a partir de las entidades |
| `npm run migration:run` / `migration:revert` | Aplicar / revertir migraciones |
| `npm run lint` | ESLint con autofix |
