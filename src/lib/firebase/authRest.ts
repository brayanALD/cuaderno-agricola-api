import { z } from 'zod';
import { ErrorHttp } from '../errores';
import type { Identidad, ProveedorAuth, Sesion, SesionConUsuario } from '../puertos';

const MENSAJE_CREDENCIALES = 'Correo o contraseña incorrectos.';
const MENSAJE_SESION = 'La sesión expiró. Inicia sesión de nuevo.';

/**
 * Códigos de error de Firebase Auth (`error.message`, p. ej. «WEAK_PASSWORD : …»). Credenciales
 * inválidas, correo inexistente y contraseña incorrecta dan el MISMO 401 y el mismo mensaje (así no se
 * revela qué correos existen). `TOO_MANY_ATTEMPTS_TRY_LATER` es el 429 (D59).
 */
const ERRORES = new Map<string, () => ErrorHttp>([
  ['EMAIL_EXISTS', () => new ErrorHttp(409, 'Ese correo ya está registrado.')],
  ['WEAK_PASSWORD', () => new ErrorHttp(400, 'La contraseña es demasiado débil.')],
  ['INVALID_EMAIL', () => new ErrorHttp(400, 'Escribe un correo válido.')],
  ['INVALID_LOGIN_CREDENTIALS', () => new ErrorHttp(401, MENSAJE_CREDENCIALES)],
  ['EMAIL_NOT_FOUND', () => new ErrorHttp(401, MENSAJE_CREDENCIALES)],
  ['INVALID_PASSWORD', () => new ErrorHttp(401, MENSAJE_CREDENCIALES)],
  ['USER_DISABLED', () => new ErrorHttp(403, 'La cuenta está deshabilitada.')],
  [
    'TOO_MANY_ATTEMPTS_TRY_LATER',
    () => new ErrorHttp(429, 'Demasiados intentos. Inténtalo más tarde.'),
  ],
  ['INVALID_REFRESH_TOKEN', () => new ErrorHttp(401, MENSAJE_SESION)],
  ['TOKEN_EXPIRED', () => new ErrorHttp(401, MENSAJE_SESION)],
  ['USER_NOT_FOUND', () => new ErrorHttp(401, MENSAJE_SESION)],
]);

/** Un código desconocido NO se traduce: se vuelve un error interno y no se muestra al cliente. */
export function traducirError(codigo: string): ErrorHttp {
  const crear = ERRORES.get(codigo);
  if (crear === undefined) throw new Error('Respuesta inesperada de Firebase Auth');
  return crear();
}

const sesionRest = z.object({
  idToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.string(),
  localId: z.string(),
  email: z.string(),
});

const renovacionRest = z.object({
  id_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.string(),
});

const errorRest = z.object({ error: z.object({ message: z.string() }) });

export interface OpcionesAuthRest {
  readonly apiKey: string;
  /** `host:puerto` del emulador de Auth (desarrollo); ausente = servidores de Google. */
  readonly hostEmulador?: string;
  readonly fetchImpl?: typeof fetch;
  /** Verifica el ID token con el Admin SDK (`getAuth().verifyIdToken`). */
  readonly verificarToken: (token: string) => Promise<Identidad>;
}

type Pedir = (url: string, init: RequestInit) => Promise<unknown>;

/** POST que devuelve el JSON o lanza el `ErrorHttp` que corresponde al código de Firebase. */
function crearPedir(llamar: typeof fetch): Pedir {
  return async (url, init) => {
    const respuesta = await llamar(url, init);
    const cuerpo: unknown = await respuesta.json();
    if (respuesta.ok) return cuerpo;
    const fallo = errorRest.safeParse(cuerpo);
    throw traducirError(fallo.success ? (fallo.data.error.message.split(/[\s:]/)[0] ?? '') : '');
  };
}

async function entrar(
  pedir: Pedir,
  url: string,
  email: string,
  password: string,
): Promise<SesionConUsuario> {
  const cuerpo = await pedir(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const s = sesionRest.parse(cuerpo);
  return {
    token: s.idToken,
    refreshToken: s.refreshToken,
    expiraEnSeg: Number(s.expiresIn),
    usuario: { id: s.localId, email: s.email },
  };
}

async function renovarSesion(pedir: Pedir, url: string, refreshToken: string): Promise<Sesion> {
  const cuerpo = await pedir(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
  });
  const r = renovacionRest.parse(cuerpo);
  return { token: r.id_token, refreshToken: r.refresh_token, expiraEnSeg: Number(r.expires_in) };
}

/** El correo de recuperación se pide en español; un correo sin cuenta (401) no se distingue de uno con cuenta. */
async function recuperar(pedir: Pedir, url: string, email: string): Promise<void> {
  try {
    await pedir(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-firebase-locale': 'es' },
      body: JSON.stringify({ requestType: 'PASSWORD_RESET', email }),
    });
  } catch (error) {
    if (error instanceof ErrorHttp && error.status === 401) return;
    throw error;
  }
}

/** Firebase Auth mediada por la API (sección 9.1): la app nunca ve la clave web ni `firebaseConfig`. */
export function crearProveedorAuth(opciones: OpcionesAuthRest): ProveedorAuth {
  const { apiKey, hostEmulador } = opciones;
  const base = hostEmulador ? `http://${hostEmulador}/` : 'https://';
  const toolkit = `${base}identitytoolkit.googleapis.com/v1`;
  const urlToken = `${base}securetoken.googleapis.com/v1/token?key=${apiKey}`;
  const pedir = crearPedir(opciones.fetchImpl ?? fetch);

  return {
    registrar: (email, password) =>
      entrar(pedir, `${toolkit}/accounts:signUp?key=${apiKey}`, email, password),
    iniciarSesion: (email, password) =>
      entrar(pedir, `${toolkit}/accounts:signInWithPassword?key=${apiKey}`, email, password),
    renovar: (refreshToken) => renovarSesion(pedir, urlToken, refreshToken),
    recuperarPassword: (email) =>
      recuperar(pedir, `${toolkit}/accounts:sendOobCode?key=${apiKey}`, email),
    verificar: opciones.verificarToken,
  };
}
