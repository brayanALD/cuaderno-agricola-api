import { ErrorHttp } from '@/lib/errores';
import type { Coleccion, Dependencias, Documento } from '@/lib/puertos';
import { cicloSchema } from '@/schemas/ciclo';
import { consultaSchema, idSchema } from '@/schemas/consulta';
import { laborSchema } from '@/schemas/labor';
import { loteSchema } from '@/schemas/lote';

type Deps = Pick<Dependencias, 'almacen' | 'ahora'>;

const COLECCIONES = { lotes: 'lote', labores: 'labor', ciclos: 'ciclo' } as const;
export type Recurso = keyof typeof COLECCIONES;
export const esRecurso = (texto: string): texto is Recurso => texto in COLECCIONES;

/** Máximo por llamada (sección 9.3): se repite con el último `updated_at` hasta recibir menos. */
export const LIMITE_POR_LLAMADA = 500;

export interface PaginaSync {
  readonly items: Documento[];
  readonly servidor_ahora: string;
}

/**
 * `GET /api/<recurso>?since=`: lo cambiado desde `since` (inclusive) y los borrados lógicos. Inclusive a propósito: con `>` una escritura en el mismo milisegundo que `servidor_ahora` se perdería; repetir un documento es inocuo porque el PUT es idempotente.
 * `servidor_ahora` se toma ANTES de consultar, para que un cambio concurrente no se pierda.
 */
export async function listar(
  deps: Deps,
  uid: string,
  recurso: Recurso,
  consulta: unknown,
): Promise<PaginaSync> {
  const { since } = consultaSchema.parse(consulta);
  const servidor_ahora = deps.ahora();
  const items = await deps.almacen.listarDesde(
    uid,
    COLECCIONES[recurso],
    since ?? null,
    LIMITE_POR_LLAMADA,
  );
  return { items, servidor_ahora };
}

/** Misma regla que SQLite (D41/D61): sin distinguir mayúsculas ASCII y sin espacios en los extremos. */
const claveDeNombre = (nombre: string): string =>
  nombre.trim().replace(/[A-Z]/g, (letra) => letra.toLowerCase());

async function guardarLote(
  deps: Deps,
  uid: string,
  id: string,
  cuerpo: unknown,
): Promise<Documento> {
  const datos = loteSchema.parse(cuerpo);
  const vivos = await deps.almacen.buscar(uid, 'lote', { deleted_at: null });
  const repetido = vivos.some(
    (otro) => otro.id !== id && claveDeNombre(String(otro.nombre)) === claveDeNombre(datos.nombre),
  );
  if (repetido) throw new ErrorHttp(409, 'Ya existe un lote con ese nombre.');
  return deps.almacen.guardar(uid, 'lote', id, datos, deps.ahora());
}

const invalido = (campo: string, mensaje: string) =>
  new ErrorHttp(400, 'Datos inválidos', [{ campo, mensaje }]);

async function guardarLabor(
  deps: Deps,
  uid: string,
  id: string,
  cuerpo: unknown,
): Promise<Documento> {
  const datos = laborSchema.parse(cuerpo);
  const lote = await deps.almacen.obtener(uid, 'lote', datos.lote_id);
  if (lote === null || lote.deleted_at !== null) throw invalido('lote_id', 'El lote no existe.');
  if (datos.tipo === 'cosecha' && datos.fecha < String(lote.fecha_siembra)) {
    throw invalido('fecha', 'La cosecha no puede ser anterior a la siembra.');
  }
  return deps.almacen.guardar(uid, 'labor', id, datos, deps.ahora());
}

/** Un ciclo cerrado pertenece a un lote propio que exista (aunque esté borrado: es su historial). */
async function guardarCiclo(
  deps: Deps,
  uid: string,
  id: string,
  cuerpo: unknown,
): Promise<Documento> {
  const datos = cicloSchema.parse(cuerpo);
  const lote = await deps.almacen.obtener(uid, 'lote', datos.lote_id);
  if (lote === null) throw invalido('lote_id', 'El lote no existe.');
  return deps.almacen.guardar(uid, 'ciclo', id, datos, deps.ahora());
}

const GUARDAR = { lotes: guardarLote, labores: guardarLabor, ciclos: guardarCiclo } as const;

/** `PUT /api/<recurso>/<id>`: crea o reemplaza, idempotente. El cliente no decide `uid` ni fechas del servidor. */
export async function guardar(
  deps: Deps,
  uid: string,
  recurso: Recurso,
  id: unknown,
  cuerpo: unknown,
): Promise<Documento> {
  const idValido = idSchema.parse(id);
  return GUARDAR[recurso](deps, uid, idValido, cuerpo);
}

/** `DELETE /api/<recurso>/<id>`: borrado lógico; 404 si no existe (o es de otro usuario). */
export async function borrar(
  deps: Deps,
  uid: string,
  recurso: Recurso,
  id: unknown,
): Promise<{ ok: true }> {
  const coleccion: Coleccion = COLECCIONES[recurso];
  const encontrado = await deps.almacen.marcarBorrado(
    uid,
    coleccion,
    idSchema.parse(id),
    deps.ahora(),
  );
  if (!encontrado) throw new ErrorHttp(404, 'No encontrado');
  return { ok: true };
}
