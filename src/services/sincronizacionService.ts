import { ErrorHttp } from '@/lib/errores';
import type { Coleccion, Dependencias, Documento, Unicidad } from '@/lib/puertos';
import { cicloSchema } from '@/schemas/ciclo';
import { consultaSchema, idSchema } from '@/schemas/consulta';
import { esFechaFutura } from '@/schemas/fechas';
import { laborSchema } from '@/schemas/labor';
import { loteSchema } from '@/schemas/lote';
import { baseSchema, verificadorDeBase } from '@/schemas/version';

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

/**
 * El nombre de lote es único por usuario (D98). Además de la comprobación previa (que cubre lotes anteriores a
 * esta regla, sin documento índice), la reserva atómica cierra la carrera entre dos escrituras simultáneas.
 */
const UNICIDAD_NOMBRE: Unicidad = {
  campo: 'nombre',
  clave: claveDeNombre,
  conflicto: () => new ErrorHttp(409, 'Ya existe un lote con ese nombre.'),
};

async function guardarLote(
  deps: Deps,
  uid: string,
  id: string,
  cuerpo: unknown,
): Promise<Documento> {
  const datos = loteSchema.parse(cuerpo);
  const verificar = verificadorDeBase(baseSchema.parse(cuerpo).base_updated_at, datos);
  const vivos = await deps.almacen.buscar(uid, 'lote', { deleted_at: null });
  const repetido = vivos.some(
    (otro) => otro.id !== id && claveDeNombre(String(otro.nombre)) === claveDeNombre(datos.nombre),
  );
  if (repetido) throw new ErrorHttp(409, 'Ya existe un lote con ese nombre.');
  return deps.almacen.guardar(uid, 'lote', id, datos, deps.ahora(), {
    verificar,
    unicidad: UNICIDAD_NOMBRE,
  });
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
  const verificar = verificadorDeBase(baseSchema.parse(cuerpo).base_updated_at, datos);
  if (esFechaFutura(datos.fecha, deps.ahora())) {
    throw invalido('fecha', 'La labor no puede tener fecha futura.');
  }
  const lote = await deps.almacen.obtener(uid, 'lote', datos.lote_id);
  if (lote === null || lote.deleted_at !== null) throw invalido('lote_id', 'El lote no existe.');
  if (datos.tipo === 'cosecha' && datos.fecha < String(lote.fecha_siembra)) {
    throw invalido('fecha', 'La cosecha no puede ser anterior a la siembra.');
  }
  return deps.almacen.guardar(uid, 'labor', id, datos, deps.ahora(), { verificar });
}

/** Un ciclo cerrado pertenece a un lote propio que exista (aunque esté borrado: es su historial). */
async function guardarCiclo(
  deps: Deps,
  uid: string,
  id: string,
  cuerpo: unknown,
): Promise<Documento> {
  const datos = cicloSchema.parse(cuerpo);
  if (esFechaFutura(datos.fecha_fin, deps.ahora())) {
    throw invalido('fecha_fin', 'El ciclo no puede terminar en una fecha futura.');
  }
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

/**
 * Borrar un lote borra también lo que cuelga de él (D99): sus labores y sus ciclos cerrados, con la misma marca
 * de tiempo, para que los demás teléfonos lo reciban en su próxima vuelta. Es idempotente: repetir el `DELETE`
 * termina lo que un fallo hubiera dejado a medias.
 */
async function borrarEnCascada(deps: Deps, uid: string, loteId: string, ahora: string) {
  const filtros = { lote_id: loteId, deleted_at: null };
  await deps.almacen.marcarBorradoPorFiltro(uid, 'labor', filtros, ahora);
  await deps.almacen.marcarBorradoPorFiltro(uid, 'ciclo', filtros, ahora);
}

/** `DELETE /api/<recurso>/<id>`: borrado lógico; 404 si no existe (o es de otro usuario). */
export async function borrar(
  deps: Deps,
  uid: string,
  recurso: Recurso,
  id: unknown,
): Promise<{ ok: true }> {
  const coleccion: Coleccion = COLECCIONES[recurso];
  const idValido = idSchema.parse(id);
  const ahora = deps.ahora();
  const esLote = recurso === 'lotes';
  const encontrado = await deps.almacen.marcarBorrado(
    uid,
    coleccion,
    idValido,
    ahora,
    esLote ? UNICIDAD_NOMBRE : undefined,
  );
  if (!encontrado) throw new ErrorHttp(404, 'No encontrado');
  if (esLote) await borrarEnCascada(deps, uid, idValido, ahora);
  return { ok: true };
}
