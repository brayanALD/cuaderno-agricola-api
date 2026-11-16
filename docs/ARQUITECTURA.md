# Arquitectura de la API

Contrato completo en `docs/ESPECIFICACION.md` (secciones 9.1 a 9.6). Aquí solo la estructura del repositorio.

```text
[ App móvil ] ── HTTPS + Bearer (ID token de Firebase) ──▶ [ API: Next.js Route Handlers (Node) en Vercel ]
                                                              │  rutas delgadas: parsear → validar (Zod) → servicio → responder
                                                              ├──▶ Firebase Auth (API REST con FIREBASE_WEB_API_KEY, solo en Vercel)
                                                              ├──▶ Firestore (solo Admin SDK; reglas: allow read, write: if false)
                                                              └──▶ Vercel Blob (imágenes de las labores)
```

## Estructura

| Ruta | Contenido |
|---|---|
| `app/api/**/route.ts` | Handlers finos con `export const runtime = "nodejs"` |
| `src/schemas` | Esquemas Zod (cuerpos, consultas); descartan campos no declarados |
| `src/services` | Reglas de negocio (sincronización, producción por mes, unicidad de nombre de lote) |
| `src/lib` | Firebase Admin, verificación de token, formato de errores, cliente Blob |
| `contrato/contrato.json` | Contrato compartido con la app (D101), verificado por `__tests__/contrato` |
| `.github/workflows` | CI: `npm run check` y `npm run build` en cada push y pull request (D100) |
| `firestore.rules`, `firestore.indexes.json`, `firebase.json` | Reglas que niegan todo, índices y emuladores (Auth 9099, Firestore 8080, UI 4000) |

## Puertos y adaptadores (D58)

Los servicios no importan Firebase ni Blob: reciben `Dependencias { auth, almacen, imagenes, ahora, nuevoId }` (`src/lib/puertos.ts`).
`src/lib/manejadores.ts` envuelve cada ruta: las públicas solo manejan errores; las privadas además exigen `Authorization: Bearer`,
verifican el token (`auth.verificar`) y pasan la `Identidad` (`uid` del token, nunca del cuerpo ni de la URL) al servicio.

| Puerto | Adaptador real (delgado, sin pruebas unitarias) | Doble para pruebas |
|---|---|---|
| `ProveedorAuth` | `src/lib/firebase/authRest.ts` (REST de Firebase Auth + `verifyIdToken`) | `AuthEnMemoria` (con 429 tras 5 fallos) |
| `Almacen` | `src/lib/firebase/almacenFirestore.ts` (Admin SDK, transacciones) | `AlmacenEnMemoria` |
| `AlmacenImagenes` | `src/lib/blob/almacenBlob.ts` (real y uno local sin red) | `ImagenesEnMemoria` |

`src/lib/dependencias.ts` arma las reales una sola vez (perezoso); `src/lib/entorno.ts` valida las variables y prohíbe los emuladores en Vercel.

## Endpoints (resumen)

| Grupo | Rutas |
|---|---|
| Auth | `POST /api/auth/registro`, `login`, `refresh`; `GET /api/auth/yo` |
| Lotes, labores y ciclos | `GET /api/<recurso>?since=` (inclusivo `>=`, máx. 500, responde `{ items, servidor_ahora }`), `PUT /api/<recurso>/<id>` (idempotente; con `base_updated_at` opcional, D94), `DELETE /api/<recurso>/<id>` (borrado lógico; el de un lote borra también sus labores y ciclos, D99) para `lotes`, `labores` y `ciclos` |
| Consulta de labores | `GET /api/labores?lote_id&tipo&desde&hasta&limite&cursor` → `{ items, siguiente, servidor_ahora }` (D97) |
| Envío por lotes | `POST /api/sync` con hasta 50 cambios (D95) |
| Producción | `GET /api/lotes/:id/produccion` → `{ lote_id, total_kg, por_mes: [{ mes, kg }] }`, calculado en el servidor |
| Imágenes | `POST /api/imagenes`, `DELETE /api/imagenes?url=` (solo propias; 413 > ~4 MB, 415 si no es imagen) |
| Salud | `GET /api/health` |

## Firestore

`usuarios/{uid}/lote/{id}`, `usuarios/{uid}/labor/{id}` y `usuarios/{uid}/ciclo/{id}`; las reservas de nombres únicos viven en
`usuarios/{uid}/unicos/{sha256}` (D98, solo las escribe la API); campos en `snake_case`; fechas ISO 8601 UTC o `YYYY-MM-DD`; sin
`undefined` (usar `null`); campos base puestos por el servidor: `created_at`, `updated_at`, `deleted_at`.

## Desarrollo local

Solo emuladores (`FIREBASE_AUTH_EMULATOR_HOST`, `FIRESTORE_EMULATOR_HOST`); sin secretos reales en disco. Blob no tiene emulador:
mock en pruebas y subida real únicamente contra el despliegue en Vercel.
