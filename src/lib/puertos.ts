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

/**
 * Clave única dentro del usuario (D98): dos documentos de la misma colección no pueden tener el mismo valor
 * normalizado en `campo`. La reserva vive en un documento índice que se escribe en la MISMA transacción que el
 * documento, así que dos escrituras simultáneas no pueden quedarse las dos con el nombre.
 */
export interface Unicidad {
  readonly campo: string;
  /** Normaliza el valor: dos valores con la misma clave chocan. */
  readonly clave: (valor: string) => string;
  /** Lo que se lanza si otro documento VIVO ya tiene esa clave. */
  readonly conflicto: () => Error;
}

export interface OpcionesGuardar {
  /**
   * Recibe el documento previo (o `null`) DENTRO de la misma transacción y puede lanzar para impedir la
   * escritura: así la comprobación de versión (D94) y la escritura son una sola operación.
   */
  readonly verificar?: (previo: Documento | null) => void;
  readonly unicidad?: Unicidad;
}

/** Consulta paginada de documentos vivos, del más nuevo al más antiguo por `campoOrden` y luego por id (D97). */
export interface ConsultaOrdenada {
  /** Igualdades; `deleted_at: null` deja fuera los borrados. */
  readonly filtros: Filtros;
  readonly campoOrden: string;
  /** Rango inclusivo sobre `campoOrden`. */
  readonly desde?: string;
  readonly hasta?: string;
  /** Sigue después de este documento (el último de la página anterior). */
  readonly despues?: { readonly valor: string; readonly id: string };
  readonly limite: number;
}

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
    opciones?: OpcionesGuardar,
  ): Promise<Documento>;
  /** Borrado lógico; `false` si el documento no existe. Con `unicidad`, libera la clave que tenía (D98). */
  marcarBorrado(
    uid: string,
    coleccion: Coleccion,
    id: string,
    ahora: string,
    unicidad?: Unicidad,
  ): Promise<boolean>;
  /** Borrado lógico de todos los documentos vivos que cumplan los filtros (D99). Devuelve cuántos. */
  marcarBorradoPorFiltro(
    uid: string,
    coleccion: Coleccion,
    filtros: Filtros,
    ahora: string,
  ): Promise<number>;
  /** Una página de la consulta (D97). */
  consultar(uid: string, coleccion: Coleccion, consulta: ConsultaOrdenada): Promise<Documento[]>;
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
