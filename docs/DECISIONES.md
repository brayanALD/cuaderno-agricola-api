# Registro de decisiones técnicas (API)

Regla de trabajo: **ninguna decisión técnica fuera de la especificación se toma sin preguntar** (opciones con pros y contras).
El registro completo y compartido está en el repo de la app (`docs/DECISIONES.md`); aquí solo lo que afecta a la API.

| ID | Decisión | Quién | Fecha |
|---|---|---|---|
| D1 | Todo en WSL2 (sandbox de Claude Code), repos en el sistema de archivos de Linux | Brayan | 2026-11-14 |
| D2 | Firebase Emulator Suite (Auth + Firestore) en desarrollo; sin secretos reales en disco; Blob con mock | Brayan | 2026-11-14 |
| D5 | Trabajo individual; defensa individual | Brayan | 2026-11-14 |
| D7 | Plazo de 7 días desde 2026-11-14 | Brayan | 2026-11-14 |
| D9 | Retos de excelencia: hook propio con `node:test` + cero secretos reales en disco | IA (delegado) | 2026-11-14 |
| D11 | Sin skills de Firebase (empujan a SDK de cliente, `firebase deploy` y bases en la nube) | IA (delegado) | 2026-11-14 |
| D12 | La IA no instala dependencias ni ejecuta `vercel`/`firebase`: propone, verifica el paquete y pide permiso | IA (delegado) | 2026-11-14 |
| D13 | Trabajar en Windows sin sandbox, **temporal**, hasta poder usar WSL2 (incumple la hoja; excepción solo en `.claude/settings.local.json`, ver `ia/CONFIGURACION.md`) | Brayan | 2026-11-14 |
| D21 | Scaffold con `create-next-app@16.4.6 --ts --eslint --app --api --no-tailwind --no-src-dir --use-npm --skip-install --disable-git --no-agents-md --no-agent-feedback` en la subcarpeta temporal `scaffold-tmp` (sin punto: npm no admite nombres que empiecen con punto); se **leyó** y se reescribió a mano solo lo que aplica. La subcarpeta la borra Brayan (`rm -rf` denegado) | Brayan | 2026-11-14 |
| D22 | Las pruebas viven en `/__tests__` (raíz), igual que en la app (D16); Vitest con `include: ['__tests__/**/*.test.ts']` | Brayan | 2026-11-14 |
| D23 | `eslint-config-next@16.4.6` (`core-web-vitals` + `typescript`) con **ESLint 9.39.5**; **TypeScript 6.0.3** fijado porque `typescript-eslint` declara `<6.1.0` (hay TS 7 en `latest`). npm marca ESLint 9.39.5 como «no longer supported» (rama de mantenimiento): revisar | Brayan (ESLint) · IA (TS, por compatibilidad) | 2026-11-14 |
| D24 | Cobertura Vitest (v8): umbral 80 % en statements/branches/functions/lines sobre `src/services` y `src/lib`. Las rutas delgadas quedan fuera de la medición | Brayan | 2026-11-14 |
| D25 | Sin `cacheComponents` ni `partialPrefetching` (la plantilla los activa): con Cache Components Next **no admite** `export const runtime = "nodejs"`, que la especificación y AGENTS.md exigen en cada ruta. Sale de la documentación, no es decisión nueva | Documentación | 2026-11-14 |
| D26 | Detalles menores de la IA, **revisables**: alias `@/*` → `./src/*` (igual que la app); `GET /api/health` devuelve `{ "estado": "ok" }` con `dynamic = 'force-dynamic'` (la especificación no define el cuerpo); `.prettierrc.json` (comillas simples, 100 columnas, comas finales) **inferido** del estilo de la app, sin leer su archivo (está fuera de la raíz) | IA | 2026-11-14 |
| D27 | Dependencias con versión **exacta** (`--save-exact`), como en la app; `vite@8.3.8` explícito porque Vitest 5.1.0 lo exige como peer no opcional | IA | 2026-11-14 |

| D58 | **Pruebas de la API con puertos + dobles en memoria** (cierra P7): los servicios dependen de interfaces propias (`ProveedorAuth`, `Almacen`, `AlmacenImagenes`) y Firebase/Blob solo se tocan en adaptadores delgados | Brayan | 2026-11-15 |
| D59 | **Límite de intentos de login = regla del Firewall de Vercel sobre `/api/auth/*` + traducir `TOO_MANY_ATTEMPTS_TRY_LATER` de Firebase a 429** (cierra P6) | Brayan | 2026-11-15 |
| D60 | **App: login obligatorio y una base SQLite por usuario** (`cuaderno-<uid>.db`); cerrar sesión no borra datos locales | Brayan | 2026-11-15 |
| D61 | **Nombre de lote único en la API:** comparación sin distinguir mayúsculas ASCII (misma regla que SQLite) sobre los lotes vivos del usuario; sin campos extra en Firestore | Brayan | 2026-11-15 |
| D70 | **API, detalles de la IA (revisables):** `GET ?since=` es **inclusivo** (`>=`) y `servidor_ahora` se toma ANTES de la consulta, así una escritura en el mismo milisegundo no se pierde (la última página se repite, es inocuo porque `PUT` es idempotente); máximo 500 elementos por llamada; `GET /api/lotes/:id/produccion` responde `{ lote_id, total_kg, por_mes: [{ mes, kg }] }` y 404 si el lote no existe o está borrado; la labor exige un lote propio vivo (400 con detalle `lote_id`) y cosecha ≥ siembra; el servidor no rechaza fechas futuras (lo hace el formulario de la app); un documento de Firestore sin `created_at`/`updated_at`/`deleted_at` válidos se trata como corrupto (500), no se propaga; un código desconocido de Firebase Auth no se traduce: 500 «Error interno»; no hay rutas de administración, así que el claim `rol` solo lo expone `verificar` | IA | 2026-11-15 | Todo dentro de la especificación 9.1–9.6 o de lo que no decía; ninguna es irreversible. Se prueba con los dobles (D58); el adaptador real de Firestore y el de Auth REST solo con los emuladores (`scripts/humo.mjs`) |
| D91 | **Despliegue en Vercel con el MCP de Vercel (no la CLI), por orden expresa de Brayan** (excepción puntual a «no tocar Firebase/Blob reales»): proyecto `cuaderno-agricola-api` (Hobby, región `iad1`, protección de Vercel desactivada porque la API tiene su propia autenticación), store Blob **público** `cuaderno-agricola-imagenes` (`iad1`; el código usa `access: 'public'`) conectado al proyecto (el token vive solo en Vercel), y despliegue de producción subiendo los archivos de `app/` y `src/` (sin `.env*`, pruebas, `node_modules` ni `package-lock.json`; el `package.json` subido no lleva los scripts de calidad). **Firebase de producción** (proyecto `cuaderno-agricola-7ef48`, creado por Brayan): Firestore `(default)` en `us-east1` (Standard, nativo), reglas `if false` desplegadas con el MCP de Firebase, Auth Email/Password, cuenta de servicio y clave web cargadas en Vercel como *sensitive*. **Correcciones de despliegue:** Node 24 en el proyecto y `overrides: { "jwks-rsa": { "jose": "5.10.0" } }` en `package.json` (con `jose` 6, solo ESM, la función fallaba con `ERR_REQUIRE_ESM`; `jwks-rsa` solo usa `importJWK` y `exportSPKI`, que `jose` 5 también tiene). Regla del Firewall de D59: 20 peticiones por minuto por IP en `/api/auth/*` | Brayan (orden) · IA (detalles) | 2026-11-15 |
| D92 | **Nueva ruta pública `POST /api/auth/recuperar`** (cuerpo `{ email }`): pide a Firebase el correo de restablecer contraseña (`accounts:sendOobCode`, `requestType: PASSWORD_RESET`, en español con `X-Firebase-Locale`). Responde `200 { ok: true }` **exista o no el correo** (un `EMAIL_NOT_FOUND` no se revela, como el login); 400 con correo inválido; 429 con `TOO_MANY_ATTEMPTS_TRY_LATER`; cualquier otro código de Firebase es un 500 sin detalles. Queda bajo la regla de Firewall de `/api/auth/*` (D59) | Brayan (elección en la app, P14) · IA (detalles) | 2026-11-16 |

## Pendientes (se preguntan con pros y contras)

| ID | Pregunta |
|---|---|
| P9 | Si falla una escritura de `since`: política de reintento del lado servidor (solo si la especificación no lo cubre) |

## Notas

- `vercel env pull` está **denegado**; la sección 9.5 de la especificación lo menciona para el token de Blob, pero choca con la
  configuración de IA. El token solo vive en Vercel.
- Reglas de Firestore y `firebase.json` ya existen (`firestore.rules` niega todo).
- Los IDs D21–D27 siguen a los D14–D20 del registro de la app; falta reflejarlos allí (esta sesión no puede escribir fuera de la API).
