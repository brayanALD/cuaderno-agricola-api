import type { Dependencias, Identidad, Sesion, SesionConUsuario, Usuario } from '@/lib/puertos';
import { credencialesSchema, recuperarSchema, refreshSchema } from '@/schemas/auth';

type ConAuth = Pick<Dependencias, 'auth'>;

/** `POST /api/auth/registro`: contraseña ≥ 8; correo repetido → 409 (lo traduce el proveedor). */
export async function registrar(deps: ConAuth, cuerpo: unknown): Promise<SesionConUsuario> {
  const { email, password } = credencialesSchema.parse(cuerpo);
  return deps.auth.registrar(email, password);
}

/** `POST /api/auth/login`: el mismo 401 exista o no el correo (lo garantiza el proveedor). */
export async function iniciarSesion(deps: ConAuth, cuerpo: unknown): Promise<SesionConUsuario> {
  const { email, password } = credencialesSchema.parse(cuerpo);
  return deps.auth.iniciarSesion(email, password);
}

/** `POST /api/auth/refresh`: cambia el refreshToken por una sesión nueva. */
export async function refrescar(deps: ConAuth, cuerpo: unknown): Promise<Sesion> {
  const { refreshToken } = refreshSchema.parse(cuerpo);
  return deps.auth.renovar(refreshToken);
}

/** `POST /api/auth/recuperar`: responde `{ ok: true }` exista o no el correo (no se revela quién tiene cuenta). */
export async function recuperarPassword(deps: ConAuth, cuerpo: unknown): Promise<{ ok: true }> {
  const { email } = recuperarSchema.parse(cuerpo);
  await deps.auth.recuperarPassword(email);
  return { ok: true };
}

/** `GET /api/auth/yo`: el usuario sale del token ya verificado. */
export function miPerfil(identidad: Identidad): {
  usuario: Omit<Usuario, 'email'> & { email: string | null };
} {
  return { usuario: { id: identidad.uid, email: identidad.email } };
}
