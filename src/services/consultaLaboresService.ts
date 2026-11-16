import { z } from 'zod';
import { ErrorHttp } from '@/lib/errores';
import type { Dependencias, Documento } from '@/lib/puertos';
import { idSchema } from '@/schemas/consulta';
import { esFechaValida } from '@/schemas/fechas';
import { TIPOS_LABOR } from '@/schemas/labor';
import { listar, type PaginaSync } from './sincronizacionService';

type Deps = Pick<Dependencias, 'almacen' | 'ahora'>;

export const LIMITE_POR_DEFECTO = 100;
export const LIMITE_MAXIMO = 500;

/** Los parámetros que activan la consulta filtrada; sin ninguno, `GET /api/labores` es la sincronización de 9.3. */
export const PARAMETROS = ['lote_id', 'tipo', 'desde', 'hasta', 'limite', 'cursor'] as const;

const fecha = z
  .string({ error: 'Usa AAAA-MM-DD.' })
  .refine(esFechaValida, { error: 'Fecha inválida: usa AAAA-MM-DD.' });

const consultaSchema = z
  .object({
    since: z
      .never({ error: 'since es de la sincronización: no se combina con filtros.' })
      .optional(),
    lote_id: idSchema.optional(),
    tipo: z.enum(TIPOS_LABOR, { error: 'Tipo de labor inválido.' }).optional(),
    desde: fecha.optional(),
    hasta: fecha.optional(),
    limite: z.coerce
      .number({ error: 'limite debe ser un número.' })
      .int({ error: 'limite debe ser un entero.' })
      .min(1, { error: 'limite mínimo: 1.' })
      .max(LIMITE_MAXIMO, { error: `limite máximo: ${LIMITE_MAXIMO}.` })
      .optional(),
    cursor: z.string().max(300, { error: 'Cursor inválido.' }).optional(),
  })
  .refine((c) => c.desde === undefined || c.hasta === undefined || c.desde <= c.hasta, {
    error: 'desde no puede ser posterior a hasta.',
    path: ['desde'],
  });

/** El cursor es opaco para el cliente: la fecha y el id del último elemento de la página, en base64url. */
const cursorSchema = z.object({ f: fecha, i: idSchema });

const cursorInvalido = () =>
  new ErrorHttp(400, 'Datos inválidos', [{ campo: 'cursor', mensaje: 'Cursor inválido.' }]);

export function codificarCursor(documento: Documento): string {
  const cursor = { f: String(documento.fecha), i: documento.id };
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodificarCursor(texto: string): { valor: string; id: string } {
  let crudo: unknown;
  try {
    crudo = JSON.parse(Buffer.from(texto, 'base64url').toString('utf8'));
  } catch {
    throw cursorInvalido();
  }
  const analisis = cursorSchema.safeParse(crudo);
  if (!analisis.success) throw cursorInvalido();
  return { valor: analisis.data.f, id: analisis.data.i };
}

export interface PaginaDeLabores {
  readonly items: Documento[];
  /** Cursor para pedir la página siguiente; `null` si esta fue la última. */
  readonly siguiente: string | null;
  readonly servidor_ahora: string;
}

const hayFiltros = (consulta: unknown): boolean =>
  typeof consulta === 'object' && consulta !== null && PARAMETROS.some((p) => p in consulta);

/**
 * `GET /api/labores` (D97). Sin filtros es la sincronización de la sección 9.3, tal cual (`?since=`). Con
 * `lote_id`, `tipo`, `desde`, `hasta`, `limite` o `cursor` es una consulta: solo labores vivas, de la más
 * reciente a la más antigua, en páginas de `limite` (100 por defecto, 500 como máximo) con un cursor opaco.
 */
export async function listarLabores(
  deps: Deps,
  uid: string,
  consulta: unknown,
): Promise<PaginaSync | PaginaDeLabores> {
  if (!hayFiltros(consulta)) return listar(deps, uid, 'labores', consulta);
  const c = consultaSchema.parse(consulta);
  const servidor_ahora = deps.ahora();
  const limite = c.limite ?? LIMITE_POR_DEFECTO;
  // Se pide uno de más: si llega, hay otra página y no hace falta una consulta vacía para saberlo.
  const filas = await deps.almacen.consultar(uid, 'labor', {
    filtros: {
      deleted_at: null,
      ...(c.lote_id === undefined ? {} : { lote_id: c.lote_id }),
      ...(c.tipo === undefined ? {} : { tipo: c.tipo }),
    },
    campoOrden: 'fecha',
    desde: c.desde,
    hasta: c.hasta,
    despues: c.cursor === undefined ? undefined : decodificarCursor(c.cursor),
    limite: limite + 1,
  });
  const items = filas.slice(0, limite);
  const ultimo = items.at(-1);
  const siguiente = filas.length > limite && ultimo !== undefined ? codificarCursor(ultimo) : null;
  return { items, siguiente, servidor_ahora };
}
