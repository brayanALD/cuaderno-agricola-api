import { ErrorHttp } from '@/lib/errores';
import type {
  Almacen,
  AlmacenImagenes,
  Coleccion,
  Dependencias,
  Documento,
  Filtros,
  Identidad,
  ImagenSubida,
  ProveedorAuth,
  Sesion,
  SesionConUsuario,
} from '@/lib/puertos';

/** Auth en memoria: tokens `tok:<uid>`, refresh tokens de un solo uso y bloqueo tras 5 fallos (429). */
export class AuthEnMemoria implements ProveedorAuth {
  private readonly usuarios = new Map<string, { uid: string; password: string }>();
  private readonly correos = new Map<string, string>();
  private readonly roles = new Map<string, string>();
  private readonly refrescos = new Set<string>();
  private readonly fallos = new Map<string, number>();
  private contador = 0;
  /** Correos a los que se «envió» el mensaje de recuperación (solo los que existen). */
  readonly recuperaciones: string[] = [];

  asignarRol(uid: string, rol: string): void {
    this.roles.set(uid, rol);
  }

  tokenDe(uid: string): string {
    return `tok:${uid}`;
  }

  private abrir(uid: string, email: string): SesionConUsuario {
    this.contador += 1;
    const refreshToken = `rt:${uid}:${this.contador}`;
    this.refrescos.add(refreshToken);
    return {
      token: this.tokenDe(uid),
      refreshToken,
      expiraEnSeg: 3600,
      usuario: { id: uid, email },
    };
  }

  registrar(email: string, password: string): Promise<SesionConUsuario> {
    if (this.usuarios.has(email)) {
      return Promise.reject(new ErrorHttp(409, 'Ese correo ya está registrado.'));
    }
    const uid = `u${this.usuarios.size + 1}`;
    this.usuarios.set(email, { uid, password });
    this.correos.set(uid, email);
    return Promise.resolve(this.abrir(uid, email));
  }

  iniciarSesion(email: string, password: string): Promise<SesionConUsuario> {
    if ((this.fallos.get(email) ?? 0) >= 5) {
      return Promise.reject(new ErrorHttp(429, 'Demasiados intentos. Inténtalo más tarde.'));
    }
    const usuario = this.usuarios.get(email);
    if (usuario?.password !== password) {
      this.fallos.set(email, (this.fallos.get(email) ?? 0) + 1);
      return Promise.reject(new ErrorHttp(401, 'Correo o contraseña incorrectos.'));
    }
    return Promise.resolve(this.abrir(usuario.uid, email));
  }

  recuperarPassword(email: string): Promise<void> {
    if (this.usuarios.has(email)) this.recuperaciones.push(email);
    return Promise.resolve();
  }

  renovar(refreshToken: string): Promise<Sesion> {
    if (!this.refrescos.delete(refreshToken)) {
      return Promise.reject(new ErrorHttp(401, 'La sesión expiró. Inicia sesión de nuevo.'));
    }
    const uid = refreshToken.split(':')[1] ?? '';
    const {
      token,
      refreshToken: nuevo,
      expiraEnSeg,
    } = this.abrir(uid, this.correos.get(uid) ?? '');
    return Promise.resolve({ token, refreshToken: nuevo, expiraEnSeg });
  }

  verificar(token: string): Promise<Identidad> {
    const uid = token.startsWith('tok:') ? token.slice(4) : '';
    if (!this.correos.has(uid)) return Promise.reject(new ErrorHttp(401, 'No autenticado'));
    return Promise.resolve({
      uid,
      email: this.correos.get(uid) ?? null,
      rol: this.roles.get(uid) ?? null,
    });
  }
}

/** Almacén en memoria con la misma semántica que Firestore bajo `usuarios/{uid}/…`. */
export class AlmacenEnMemoria implements Almacen {
  private readonly documentos = new Map<string, Documento>();

  private clave(uid: string, coleccion: Coleccion, id: string): string {
    return `${uid}/${coleccion}/${id}`;
  }

  private delUsuario(uid: string, coleccion: Coleccion): Documento[] {
    const prefijo = `${uid}/${coleccion}/`;
    return [...this.documentos.entries()].filter(([k]) => k.startsWith(prefijo)).map(([, d]) => d);
  }

  listarDesde(uid: string, coleccion: Coleccion, since: string | null, limite: number) {
    const docs = this.delUsuario(uid, coleccion)
      .filter((d) => since === null || d.updated_at >= since)
      .sort((a, b) => a.updated_at.localeCompare(b.updated_at) || a.id.localeCompare(b.id));
    return Promise.resolve(docs.slice(0, limite));
  }

  obtener(uid: string, coleccion: Coleccion, id: string) {
    return Promise.resolve(this.documentos.get(this.clave(uid, coleccion, id)) ?? null);
  }

  buscar(uid: string, coleccion: Coleccion, filtros: Filtros) {
    const docs = this.delUsuario(uid, coleccion).filter((d) =>
      Object.entries(filtros).every(([campo, valor]) => d[campo] === valor),
    );
    return Promise.resolve(docs);
  }

  guardar(
    uid: string,
    coleccion: Coleccion,
    id: string,
    campos: Record<string, unknown>,
    ahora: string,
    verificar?: (previo: Documento | null) => void,
  ) {
    const previo = this.documentos.get(this.clave(uid, coleccion, id));
    verificar?.(previo ?? null);
    const documento: Documento = {
      ...campos,
      id,
      created_at: previo?.created_at ?? ahora,
      updated_at: ahora,
      deleted_at: null,
    };
    this.documentos.set(this.clave(uid, coleccion, id), documento);
    return Promise.resolve(documento);
  }

  marcarBorrado(uid: string, coleccion: Coleccion, id: string, ahora: string) {
    const previo = this.documentos.get(this.clave(uid, coleccion, id));
    if (!previo) return Promise.resolve(false);
    this.documentos.set(this.clave(uid, coleccion, id), {
      ...previo,
      updated_at: ahora,
      deleted_at: ahora,
    });
    return Promise.resolve(true);
  }

  /** Para que las pruebas lean sin pasar por el puerto. */
  todos(): Documento[] {
    return [...this.documentos.values()];
  }
}

export class ImagenesEnMemoria implements AlmacenImagenes {
  readonly subidas = new Map<string, { bytes: number; contentType: string }>();
  readonly borradas: string[] = [];

  subir(pathname: string, bytes: ArrayBuffer, contentType: string): Promise<ImagenSubida> {
    const sufijo = `-${this.subidas.size + 1}`;
    const final = pathname.replace(/(\.\w+)$/, `${sufijo}$1`);
    this.subidas.set(final, { bytes: bytes.byteLength, contentType });
    return Promise.resolve({
      url: `https://tienda.public.blob.vercel-storage.com/${final}`,
      pathname: final,
    });
  }

  borrar(url: string): Promise<void> {
    this.borradas.push(url);
    return Promise.resolve();
  }
}

export interface Entorno {
  readonly deps: Dependencias;
  readonly auth: AuthEnMemoria;
  readonly almacen: AlmacenEnMemoria;
  readonly imagenes: ImagenesEnMemoria;
  /** Avanza el reloj de prueba (milisegundos) y devuelve el instante nuevo. */
  avanzar(ms?: number): string;
}

/** Entorno de prueba: reloj controlable desde 2026-11-15T10:00:00.000Z e ids `id-1`, `id-2`… */
export function crearEntorno(): Entorno {
  const auth = new AuthEnMemoria();
  const almacen = new AlmacenEnMemoria();
  const imagenes = new ImagenesEnMemoria();
  let ahora = Date.parse('2026-11-15T10:00:00.000Z');
  let contador = 0;
  return {
    auth,
    almacen,
    imagenes,
    deps: {
      auth,
      almacen,
      imagenes,
      ahora: () => new Date(ahora).toISOString(),
      nuevoId: () => `id-${++contador}`,
    },
    avanzar(ms = 1000) {
      ahora += ms;
      return new Date(ahora).toISOString();
    },
  };
}
