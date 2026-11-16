# Bitácora de uso de IA

Formato por entrada: **Propósito · Evidencia · Validación · Decisión**. Aquí van también los casos en que se **rechazó o
corrigió** lo que propuso la IA (mínimo 3).

## 2026-11-14 · Sesión 0 · Preparación de repositorios y configuración de IA (ambos repos)

**Propósito.** Crear los dos repositorios, su arquitectura, la configuración de IA propia, la paleta validada y el plan de 7 días.

**Evidencia.** `AGENTS.md`, `.claude/`, `ia/`, `docs/`, `src/theme/palette.json`, `scripts/check-contrast.mjs`.

**Validación.** Hook: `npm run test:hooks` 27/27. Paleta: `npm run check:contrast` sin fallos en claro y oscuro (se confirmó la sospecha inicial: blanco sobre `#08a045` da 3,43:1, por eso ese verde queda solo para iconos y barras). Sintaxis de
`.claude/settings.json` contrastada con la documentación oficial. Lo que requiere WSL2 queda **PENDIENTE** en
`ia/PRUEBAS-CONTENCION.md`.

**Decisión.** Configuración estricta desde el primer commit; trabajo real solo dentro de WSL2.
**Limitación de esta sesión (declarada).** La sesión 0 se ejecutó desde la carpeta padre y en Windows nativo, **sin sandbox** (no existe ahí) y antes de que existiera esta configuración, porque era la sesión que la crea. Esa IA leyó archivos de `Downloads` y consultó documentación web. Desde la Fase 1 toda sesión se abre en la raíz de un repo, dentro de WSL2, con la configuración activa.

### Casos en que se rechazó o corrigió a la IA

| # | Propuesta o candidata de la IA | Qué se encontró | Decisión |
|---|---|---|---|
| 1 | Skill `expo-overview` (candidata al revisar el repositorio de Expo) | Su `SKILL.md` ordena ejecutar `npx --yes @expo/agent-cli@latest …` (código sin versión fija) y consultar `@expo/ui` primero; choca con «no instalar sin avisar», con las dependencias justificadas y con la decisión de NativeWind | **Rechazada**, no se instala |
| 2 | Recomendar `firebase-auth-basics` y `firebase-firestore` (en el plan inicial aparecían «condicionales») | Tras leerlas: empujan al SDK de cliente, a `firebase deploy` y a crear bases Enterprise en la nube; contradicen la arquitectura solo-Admin, el emulador y «nada con efecto fuera sin permiso» | **Rechazadas**, no se instalan |
| 3 | Hook `guard.mjs` primera versión | La prueba 04 falló: el filtro «la ruta debe existir» dejaba pasar `Write` a una carpeta externa inexistente (Write crea padres) | **Corregido** con modo estricto para herramientas de archivo + prueba `12b`; 27/27 |
| 4 | Skills de `skills.sh` con nombres del plan inicial (`expo-tailwind-setup`, `expo-deployment`) | Ya no existen con ese nombre en el repositorio actual (HEAD `ab6cb2c`) | Sustituidas: `expo-design-system` cubre tokens con NativeWind; el APK se hace con la documentación de EAS |

## 2026-11-14 · Sesión 0b · Decisión: trabajar en Windows sin sandbox (temporal)

**Propósito.** Seguir desarrollando mientras WSL2 no se puede instalar.

**Evidencia.** `docs/FASE0-WSL.md` (diagnóstico con logs de CBS/DISM), `ia/CONFIGURACION.md` (sección «Modo temporal en Windows»),
`.claude/settings.local.json` (no versionado), hook con 31 pruebas.

**Validación.** `npm run test:hooks` 31/31 en ambos repos. El sandbox NO se pudo validar (no existe en Windows).

**Decisión.** El usuario eligió «avanzar ya en Windows sin sandbox, temporal» frente a limpiar caché de Windows Update, ISO de
Windows o máquina virtual. Se le advirtió que va contra la hoja (IA configurada ANTES de generar código y dentro del sandbox).

### Casos en que se rechazó o corrigió a la IA

| # | Propuesta o afirmación de la IA | Qué se encontró | Decisión |
|---|---|---|---|
| 5 | «La actualización de Windows ya se descargó completa» (leyendo el evento 41 del registro) | Falso: ese evento era de Defender; `IsDownloaded = False` y el build no cambió. El usuario reinició sin necesidad | **Corregido**; antes de afirmar se comprueba el estado real, no solo un evento |
| 6 | Hook sin cubrir `powershell`/`pwsh`/`cmd` y herramienta PowerShell permitida | En Windows nativo rodean las reglas de Bash y el hook | **Corregido**: `deny PowerShell` local + hook ampliado + 3 pruebas |
| 7 | Prueba `16c` con ruta sin comillas (`C:/Program Files/...`) | El error era de la prueba (un shell tampoco la ejecutaría así), no del hook | **Corregida la prueba**, no el hook |

## 2026-11-14 · Sesión 1 · Base del proyecto Next.js con `npm run check` en verde

**Propósito.** Dejar el proyecto base de la API (Next.js 16 App Router + TypeScript estricto + ESLint + Prettier + Vitest) con
`npm run check` en verde, solo con `GET /api/health` como ruta. Sin comandos de git.

**Evidencia.** `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `vitest.config.mts`,
`app/api/health/route.ts`, `__tests__/api/health.test.ts`, `package.json`/`package-lock.json`, `docs/DECISIONES.md` (D21–D27).

**Validación (resultados reales).**

- `npm run check` termina con código 0: `tsc --noEmit`, `eslint . --max-warnings 0`, `prettier --check .`, Vitest 2/2 pruebas, hook 31/31.
- **Prueba roja antes de la verde:** `health.test.ts` falló con «Cannot find module …/health/route» y pasó al crear la ruta.
- Las reglas ESLint **sí disparan**: sobre un archivo temporal malo (borrado) saltaron las 8: `no-explicit-any`, `ban-ts-comment`,
  `eqeqeq`, `no-console`, `max-depth`, `complexity` (13), `max-lines-per-function` (56) y `max-lines` (338).
- `next build` (Turbopack) compila y `/api/health` figura como dinámica (ƒ).
- `npm audit`: 11 vulnerabilidades (7 moderadas, 4 altas). Las 4 altas son un `zod@4.1.11` **anidado** en `@vercel/cli-config`
  (dependencia transitiva de `@vercel/blob` → `@vercel/oidc`); el `zod` propio es 4.6.7. Las moderadas son `minimatch` dentro de
  `typescript-eslint` (solo desarrollo). **No se corrigieron**: `audit fix --force` degradaría `@vercel/blob` a 2.4.0.
- **Límites que `check` no cubre:** el umbral del 80 % no se ejerce (`src/services` y `src/lib` están vacíos: «Unknown% 0/0»);
  no se arrancó `next dev` ni se llamó la ruta por HTTP; no se probó nada contra el emulador de Firebase; el `.prettierrc.json`
  se **infirió** del estilo de la app (no se pudo leer: está fuera de la raíz).
- **Resuelto después, el mismo día:** `scaffold-tmp/` se borró con `rm -rf` por instrucción expresa del usuario (8 archivos de plantilla, revisados antes). *Estado original:* `scaffold-tmp/` seguía en el repo (`rm -rf` denegado); está ignorada por ESLint, Prettier y `tsconfig`. Hay
  que borrarla fuera de esta sesión. `.next/`, `coverage/` y `tsconfig.tsbuildinfo` son generados e ignorados por git.

**Decisión.** Plantilla con `create-next-app` en subcarpeta temporal, pruebas en `/__tests__`, `eslint-config-next` con ESLint 9 y
umbral del 80 % (D21–D24, elegidas por Brayan). Sin Cache Components por incompatibilidad documentada (D25). Detalles menores en D26–D27.

### Casos en que se corrigió o se rechazó a la IA

| # | Propuesta o afirmación de la IA | Qué se encontró | Decisión |
|---|---|---|---|
| 8 | Comando `create-next-app … .scaffold-tmp` entregado al usuario en el plan | Falló: npm no admite nombres de proyecto que empiecen con punto | **Corregido**: carpeta `scaffold-tmp` (sin punto); se ajustaron los ignores |
| 9 | Dejar la configuración por defecto de la plantilla | Trae `cacheComponents: true` y `partialPrefetching: true`; según la documentación de Next, con Cache Components **no se admite** `runtime = "nodejs"`, que la especificación exige | **Rechazado**: se omiten ambos (D25) |
| 10 | `tsconfig.json` escrito a mano | `prettier --check` falló (línea >100 columnas) y, después, `next build` lo reescribió (arreglos expandidos y `allowJs: true`, que Next exige) | **Corregido**: `allowJs` explícito y archivo reformateado; `check` volvió a verde |
| 11 | `vitest.config.ts` | Vite avisó: sintaxis ESM cargada como CommonJS (`package.json` sin `"type": "module"`) | **Corregido**: renombrado a `vitest.config.mts` |
| 12 | Permiso verbal del usuario para `rm -rf` de la carpeta temporal | No levanta `permissions.deny` ni `AGENTS.md`; la IA no puede editar `.claude/` | **No se rodeó**: lo borra el usuario con `! rm -rf scaffold-tmp` |

## 2026-11-15 · Sesión 2 · Autenticación, sincronización, producción e imágenes

**Propósito.** Construir toda la API de la especificación 9.1–9.6: registro/login/refresh/yo, sincronización de lotes y labores,
producción por mes, imágenes y salud, con el aislamiento por usuario y los errores en el formato `{ error, detalles? }`. Sin comandos de git.

**Evidencia.** `docs/DECISIONES.md` (D58–D61 de Brayan, D70 de la IA), `docs/ARQUITECTURA.md` (puertos y adaptadores), `app/api/**/route.ts`
(11 rutas), `src/{schemas,services,lib}`, `scripts/humo.mjs`, `__tests__/{lib,schemas,services,api,helpers}`, `vitest.config.mts`.

**Validación (resultados reales).**

- `npm run check` termina con código 0: `tsc`, ESLint, Prettier, Vitest **10 archivos / 134 pruebas**, hook 31/31. Cobertura sobre
  `src/services`, `src/lib` y `src/schemas`: 97,76 % sentencias, 91,74 % ramas, 97,36 % funciones, 99 % líneas (umbral 80 %).
  `npm run build` (Next 16) compila: 11 rutas dinámicas.
- Mínimos de AGENTS.md cubiertos por pruebas: **401 sin token** (cada ruta privada), **400 de validación**, **aislamiento entre usuarios**
  (el usuario B no ve ni toca los lotes del A) y la ruta del recurso nunca toma el `uid` del cuerpo. También: 409 de correo repetido y de nombre de lote,
  el mismo 401 para correo inexistente y contraseña incorrecta, 429 tras 5 fallos (doble de Auth), 415/413 de imágenes y 403 al borrar una ajena.
- **Límites (importantes):** los adaptadores reales **no se han ejecutado**: ni Firestore (transacciones, consultas), ni la API REST de Firebase Auth,
  ni `verifyIdToken`, ni Vercel Blob. Solo los dobles en memoria (D58). Para cubrir esa brecha dejé `scripts/humo.mjs`, que **Brayan** debe correr contra los
  emuladores (`firebase emulators:start --only auth,firestore`, `npm run dev`, `node scripts/humo.mjs`). La regla del Firewall de Vercel (D59) la crea él a mano.
  Nada se ha desplegado. No hay índices compuestos: todas las consultas son por igualdad o un solo campo ordenado (no verificado contra el emulador).

**Decisión.** Puertos + dobles (D58), Firewall + 429 de Firebase (D59), nombre de lote único sin distinguir mayúsculas ASCII (D61). Los detalles menores
(`since` inclusivo, forma de la respuesta de producción, documentos corruptos = 500…) son de la IA y revisables (D70).

### Casos en que se corrigió o se rechazó a la IA

| # | Propuesta o afirmación de la IA | Qué se encontró | Decisión |
|---|---|---|---|
| 13 | `GET ?since=` devolvía solo lo **estrictamente posterior** (`>`) | Una escritura en el mismo milisegundo que `servidor_ahora` se perdería para siempre en la siguiente sincronización | **Corregido**: `>=` (puerto, servicio, doble y pruebas); la última página se repite y es inocuo (PUT idempotente) |
| 14 | Servicios de auth y de sincronización con validación Zod síncrona | Lanzaban `ZodError` **antes** de devolver la promesa: un `await` normal no lo capturaba como rechazo | **Corregido**: `async` en `registrar`, `iniciarSesion`, `refrescar` y `guardar` |
| 15 | `leerEntorno` (complejidad 15), `traducirError` (12) y dos fábricas de más de 50 líneas | ESLint los rechazó | **Refactor**: `Map` de errores, funciones auxiliares y adaptadores divididos; ninguna regla apagada |
| 16 | Un archivo de pruebas de 433 líneas y variables sin usar (`_usuario`, `_lat`) | ESLint (máx. 300 líneas, sin variables sin usar) | **Pruebas divididas** en archivos temáticos con ayudantes compartidos (`__tests__/helpers/`) |
| 17 | Ayudante de pruebas con `{ method, … }` donde el parámetro se llamaba `metodo` | Las peticiones salían todas como `GET`: pruebas verdes por razones equivocadas hasta que falló una | **Corregido** (`method: metodo`) |
| 18 | Rutas estáticas con `params` por defecto `undefined` | `next build` rechazó los tipos: las rutas estáticas reciben `Promise<{}>` | **Corregido**: genérico por defecto `Record<string, never>` |

## 2026-11-15 · Despliegue parcial en Vercel (D91)

Propósito: desplegar la API en Vercel, con un Blob real y Firebase de producción. Brayan lo ordenó expresamente y sugirió usar los MCP.

Evidencia (MCP de Vercel): proyecto `prj_LqlZdXgG9Y5M6fiCS1N5nz8AJX2p` (`cuaderno-agricola-api`, equipo de Brayan), store Blob `store_d2uWXpzeuLO1Au9j`
(público, `iad1`) con `BLOB_READ_WRITE_TOKEN` ya inyectado en el proyecto, despliegue `dpl_HBPRz4Cc5Td1eXhE71cCCQDnXLad` en producción:
`https://cuaderno-agricola-api-brayans-projects-fe0e6f44.vercel.app`.

Validación: `GET /api/health` → 200 `{"estado":"ok"}`. Las rutas privadas y de auth responden 500 (esperado: faltan las variables de Firebase).

**Actualización (misma sesión): Firebase de producción hecho y probado.** Con el MCP de Firebase (reconectado por Brayan con `/mcp`): Firestore en
`us-east1`, reglas `if false` desplegadas, app web para la clave web. Brayan generó la clave de la cuenta de servicio; la leí de `Descargas` solo
para cargar `FIREBASE_CLIENT_EMAIL` y `FIREBASE_PRIVATE_KEY` en Vercel como *sensitive* (Brayan lo autorizó expresamente). Primer error en
producción: `ERR_REQUIRE_ESM` (`jwks-rsa` → `jose` 6, solo ESM) en Node 26 y también en 24; se arregló con `overrides` (`jose` 5.10.0) y se
copió al `package.json` del repo (`npm run check`: 134 pruebas). Prueba de humo contra producción (cuenta temporal, 18/18): registro, repetido 409,
login, 401 con clave mala, 401 sin token, yo, refresh, lote, labor, listar, producción, **imagen al Blob real** (URL pública sirve los bytes; tras
borrar da 404), 415 y borrados. Regla de Firewall de D59 creada. Quedan: la cuenta temporal `prueba-…@example.com` en Firebase Auth (sin
herramienta para borrarla) y el JSON de la clave en `Descargas` (Brayan debe borrarlo).

**(Estado anterior de la sesión, ya superado)** Firebase de producción. El MCP de Firebase no conectó (`CONNECT_TIMEOUT`) y, además, la clave de la cuenta de servicio y la clave web
no deben pasar por la IA. Faltan las variables `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_API_KEY`, `FIREBASE_CLIENT_EMAIL` y `FIREBASE_PRIVATE_KEY`
(las pega Brayan en Vercel como «sensitive») y después redesplegar. Tampoco se creó la regla del Firewall de Vercel sobre `/api/auth/*` (D59).

Nota: subí el código leyendo cada archivo (sin `package-lock.json`: las dependencias directas están fijadas con versión exacta, las transitivas no).

## 2026-11-16 · Recuperar contraseña (D92)

Propósito: soportar «¿Olvidaste tu contraseña?» en la app (P14). Con pruebas primero: adaptador REST (`recuperarPassword`), servicio, manejador `recuperar`, esquema `recuperarSchema` y la ruta
`app/api/auth/recuperar/route.ts`; doble en memoria con `recuperaciones`. `npm run check`: 142 pruebas. Se redesplegó en Vercel subiendo solo los 7 archivos cambiados (el resto por `sha`).
Prueba contra producción: 200 para cuenta existente y para inexistente, 400 correo inválido y cuerpo no JSON. **No probado:** la entrega real del correo.

## 2026-11-16 · Cuaderno agrícola A1–A4 (D93)
Propósito: aceptar finca, producto, carencia, costo y el recurso `ciclos` sin romper clientes antiguos.
Evidencia: `src/schemas/opcionales.ts`, `ciclo.ts`, `app/api/ciclos/**`, `sincronizacionService`, `produccionService`.
Validación: `npm run check` en verde (163 pruebas). Sin desplegar todavía.

## Plantilla para próximas entradas

```text
## AAAA-MM-DD · Sesión N · <tarea pequeña>
Propósito: …
Evidencia: archivos/commits/capturas
Validación: qué se ejecutó (check, pruebas, dispositivo) y su resultado real
Decisión: qué se aceptó, qué se cambió y por qué
Rechazos/correcciones: …
```
