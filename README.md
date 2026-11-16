# Cuaderno de campo agrícola (API)

API del «Cuaderno de campo agrícola»: **autenticación** (Firebase Auth mediada por la API), **sincronización** de lotes y labores en Firestore,
**producción por mes** e **imágenes** en Vercel Blob. La consume la app móvil: <https://github.com/brayanALD/cuaderno-agricola-app>.
Proyecto 37 de Desarrollo Móvil · autor: Brayan Aldana.

- En producción: <https://cuaderno-agricola-api-brayans-projects-fe0e6f44.vercel.app> (`GET /api/health` → `{"estado":"ok"}`)
- Documentación: [`docs/ESPECIFICACION.md`](docs/ESPECIFICACION.md) (el contrato son las secciones 9.1–9.6) · [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) · [`docs/DECISIONES.md`](docs/DECISIONES.md) · [`ia/BITACORA.md`](ia/BITACORA.md)

## Rutas

Todas con `export const runtime = "nodejs"`. Las privadas exigen `Authorization: Bearer <idToken>`; el `uid` sale del token verificado, nunca del cuerpo.
Errores siempre como `{ "error", "detalles"? }`.

| Método y ruta | Privada | Qué hace |
|---|---|---|
| `GET /api/health` | no | Estado del servicio |
| `POST /api/auth/registro` | no | Crea la cuenta (contraseña de 8 a 128 caracteres); 409 si el correo ya existe |
| `POST /api/auth/login` | no | Inicia sesión; el mismo 401 exista o no el correo |
| `POST /api/auth/refresh` | no | Renueva el token |
| `POST /api/auth/recuperar` | no | Manda el correo para crear una contraseña nueva; responde 200 exista o no la cuenta |
| `GET /api/auth/yo` | sí | Usuario de la sesión |
| `GET /api/lotes` · `GET /api/labores` · `GET /api/ciclos` | sí | Cambios desde `?since=` (inclusivo), con borrados lógicos |
| `GET /api/labores?lote_id&tipo&desde&hasta&limite&cursor` | sí | Consulta paginada de labores vivas, de la más reciente a la más antigua (necesita los índices de `firestore.indexes.json`) |
| `PUT` / `DELETE /api/lotes/:id` · `/api/labores/:id` · `/api/ciclos/:id` | sí | Crear o reemplazar (idempotente) y borrado lógico; borrar un lote borra sus labores y ciclos |
| `POST /api/sync` | sí | Hasta 50 cambios en un solo viaje, cada uno con su resultado |
| `GET /api/lotes/:id/produccion` | sí | Kilos cosechados por mes y total |
| `POST /api/imagenes` | sí | Sube una imagen (bytes crudos, JPEG/PNG/WebP, hasta ~4 MB) al Blob |
| `DELETE /api/imagenes?url=` | sí | Borra una imagen propia (403 si no lo es) |

## Tecnologías

Next.js (App Router, Route Handlers) · TypeScript estricto · `firebase-admin` (Firestore solo por Admin SDK; reglas `allow read, write: if false`) ·
`zod` · `@vercel/blob` · Vitest. Datos privados bajo `usuarios/{uid}/…`, borrado lógico, `id` generado por el cliente.

Firebase y Blob solo aparecen en adaptadores delgados (`src/lib/firebase`, `src/lib/blob`); los servicios dependen de puertos y las pruebas usan dobles en memoria.

## Cómo ejecutarla

```bash
npm install
cp env.example .env.local     # valores falsos; en desarrollo se usan los emuladores
firebase emulators:start --only auth,firestore --project demo-cuaderno-agricola
npm run dev
```

Variables (en Vercel, nunca en el repositorio): `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_API_KEY`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (con `\n` literales) y
`BLOB_READ_WRITE_TOKEN`. En Vercel no se admite configurar un emulador.

### Calidad

```bash
npm run check      # tipos + lint + formato + pruebas + hook de seguridad
```

**280 pruebas**, cobertura de **98,5 %** de sentencias y **94,7 %** de ramas (umbral: 80 %). Incluyen lo mínimo exigido: 401 sin token, 400 de validación y aislamiento entre usuarios, y una prueba de contrato con la app (`contrato/contrato.json`).

En GitHub, `.github/workflows/verificacion.yml` corre `npm run check` y `npm run build` en cada push a `main` y en cada pull request.

## Despliegue

Vercel (Node 24, región `iad1`) con el Blob público `cuaderno-agricola-imagenes`. Notas que costaron un fallo en producción:

- `package.json` fuerza `jose@5.10.0` para `jwks-rsa` (`overrides`): con `jose` 6, solo ESM, la función fallaba con `ERR_REQUIRE_ESM`.
- Límite de intentos: regla del Firewall de Vercel sobre `/api/auth/*` (20 peticiones por minuto por IP) más el 429 de Firebase.

## Seguridad

- Sin secretos en el repositorio ni en la app: la clave web de Firebase y la cuenta de servicio solo viven en Vercel (variables *sensitive*).
- La app nunca recibe `firebaseConfig`; entra por esta API.
- Validación con Zod de todo lo que llega; solo se guardan los campos declarados.
- Los errores internos responden `500 Error interno` sin detalles y nunca se registran contraseñas, tokens ni datos personales.

## Trabajo con IA

Configuración en [`AGENTS.md`](AGENTS.md) e [`ia/`](ia/); decisiones en [`docs/DECISIONES.md`](docs/DECISIONES.md); cada sesión, con sus validaciones y correcciones, en la [bitácora](ia/BITACORA.md).
