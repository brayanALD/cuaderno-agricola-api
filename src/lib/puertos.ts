/**
 * Puertos (D58): lo que los servicios necesitan del mundo exterior. Firebase y Vercel Blob solo
 * aparecen en los adaptadores (`src/lib/firebase`, `src/lib/blob`); las pruebas usan dobles en memoria.
 */

export interface Usuario {
  readonly id: string;
  readonly email: string;
}

export interface Sesion {
  /** ID token de Firebase (dura 1 h). */
  readonly token: string;
  readonly refreshToken: string;
  readonly expiraEnSeg: number;
}

export interface SesionConUsuario extends Sesion {
  readonly usuario: Usuario;
}

export interface Identidad {
  /** Siempre sale del token verificado. */
  readonly uid: string;
  readonly email: string | null;
  /** Custom claim `rol` (p. ej. `admin`). */
  readonly rol: string | null;
}

/** Autenticación con correo y contraseña. Lanza `ErrorHttp` (409, 401, 400, 429…) ya traducido. */
export interface ProveedorAuth {
  registrar(email: string, password: string): Promise<SesionConUsuario>;
  iniciarSesion(email: string, password: string): Promise<SesionConUsuario>;
  renovar(refreshToken: string): Promise<Sesion>;
  /**
   * Manda el correo de Firebase para restablecer la contraseña. NO revela si el correo existe: un correo
   * desconocido termina igual que uno conocido. Lanza `ErrorHttp` (400 correo inválido, 429 demasiados intentos).
   */
  recuperarPassword(email: string): Promise<void>;
  /** Verifica el ID token; si no es válido lanza `ErrorHttp(401)`. */
  verificar(token: string): Promise<Identidad>;
}

export type Coleccion = 'lote' | 'labor' | 'ciclo';

/** Documento privado: campos del recurso más los que pone el servidor. */
export type Documento = Readonly<Record<string, unknown>> & {
  readonly id: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deleted_at: string | null;
};

/** Filtros de igualdad (con Firestore no necesitan índice compuesto). */
export type Filtros = Readonly<Record<string, string | null>>;

/** Documentos privados bajo `usuarios/{uid}/<coleccion>/{id}`: el aislamiento lo da la ruta. */
export interface Almacen {
  /** `updated_at >= since` (inclusive), de menor a mayor; **incluye** los borrados lógicos. */
  listarDesde(
    uid: string,
    coleccion: Coleccion,
    since: string | null,
    limite: number,
  ): Promise<Documento[]>;
  obtener(uid: string, coleccion: Coleccion, id: string): Promise<Documento | null>;
  buscar(uid: string, coleccion: Coleccion, filtros: Filtros): Promise<Documento[]>;
  /** Crea o reemplaza (idempotente): conserva `created_at`, fija `updated_at` y `deleted_at = null`. */
  guardar(
    uid: string,
    coleccion: Coleccion,
    id: string,
    campos: Readonly<Record<string, unknown>>,
    ahora: string,
  ): Promise<Documento>;
  /** Borrado lógico; `false` si el documento no existe. */
  marcarBorrado(uid: string, coleccion: Coleccion, id: string, ahora: string): Promise<boolean>;
}

export interface ImagenSubida {
  readonly url: string;
  readonly pathname: string;
}

export interface AlmacenImagenes {
  subir(pathname: string, bytes: ArrayBuffer, contentType: string): Promise<ImagenSubida>;
  borrar(url: string): Promise<void>;
}

export interface Dependencias {
  readonly auth: ProveedorAuth;
  readonly almacen: Almacen;
  readonly imagenes: AlmacenImagenes;
  /** Instante actual en ISO 8601 UTC con milisegundos. */
  readonly ahora: () => string;
  /** Identificador único para nombres de archivo. */
  readonly nuevoId: () => string;
}
