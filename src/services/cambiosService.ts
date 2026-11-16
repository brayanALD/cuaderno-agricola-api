import { z, ZodError } from 'zod';
import { detallesDeZod, ErrorHttp, type Detalle } from '@/lib/errores';
import type { Dependencias } from '@/lib/puertos';
import { idSchema } from '@/schemas/consulta';
import { borrar, guardar } from './sincronizacionService';

/** Máximo de cambios por viaje (D95): un viaje de 50 labores pesa pocos KB y cabe en una sola función. */
export const MAXIMO_CAMBIOS = 50;

const cambioSchema = z.object({
  recurso: z.enum(['lotes', 'labores', 'ciclos'], { error: 'Recurso desconocido.' }),
  id: idSchema,
  /** `true` = borrado lógico (equivale a `DELETE`); si no, `cuerpo` es el de `PUT`. */
  borrado: z.boolean().optional(),
  cuerpo: z.unknown().optional(),
});

const cambiosSchema = z.object({
  cambios: z
    .array(cambioSchema)
    .min(1, { error: 'Envía al menos un cambio.' })
    .max(MAXIMO_CAMBIOS, { error: `Máximo ${MAXIMO_CAMBIOS} cambios por envío.` }),
});

export interface ResultadoCambio {
  readonly recurso: string;
  readonly id: string;
  /** El código que habría dado el `PUT` o `DELETE` suelto: 200, 400, 404, 409… */
  readonly estado: number;
  /** `updated_at` que puso el servidor (solo en los `PUT` aceptados). */
  readonly updated_at?: string;
  readonly error?: string;
  readonly detalles?: readonly Detalle[];
}

type Deps = Pick<Dependencias, 'almacen' | 'ahora'>;
type Cambio = z.infer<typeof cambioSchema>;

/** Un cambio fallido no detiene a los demás: se informa con el mismo código que daría solo. */
function resultadoDeError(cambio: Cambio, error: unknown): ResultadoCambio {
  const base = { recurso: cambio.recurso, id: cambio.id };
  if (error instanceof ErrorHttp) {
    return { ...base, estado: error.status, error: error.message, detalles: error.detalles };
  }
  if (error instanceof ZodError) {
    return { ...base, estado: 400, error: 'Datos inválidos', detalles: detallesDeZod(error) };
  }
  throw error;
}

async function aplicar(deps: Deps, uid: string, cambio: Cambio): Promise<ResultadoCambio> {
  const base = { recurso: cambio.recurso, id: cambio.id };
  if (cambio.borrado === true) {
    await borrar(deps, uid, cambio.recurso, cambio.id);
    return { ...base, estado: 200 };
  }
  const documento = await guardar(deps, uid, cambio.recurso, cambio.id, cambio.cuerpo);
  return { ...base, estado: 200, updated_at: documento.updated_at };
}

/**
 * `POST /api/sync` (D95): hasta 50 cambios en un solo viaje, aplicados EN ORDEN (primero los lotes y luego lo
 * que depende de ellos). Cada uno se valida y se guarda como su `PUT`/`DELETE` y tiene su propio resultado;
 * el envío entero solo falla si el cuerpo no tiene la forma esperada (400) o la sesión no vale (401).
 */
export async function aplicarCambios(
  deps: Deps,
  uid: string,
  cuerpo: unknown,
): Promise<{ resultados: ResultadoCambio[] }> {
  const { cambios } = cambiosSchema.parse(cuerpo);
  const resultados: ResultadoCambio[] = [];
  for (const cambio of cambios) {
    try {
      resultados.push(await aplicar(deps, uid, cambio));
    } catch (error) {
      resultados.push(resultadoDeError(cambio, error));
    }
  }
  return { resultados };
}
