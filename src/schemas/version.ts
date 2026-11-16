import { z } from 'zod';
import { ErrorHttp } from '@/lib/errores';
import type { Documento } from '@/lib/puertos';

/**
 * Control de versión OPCIONAL (D94). El cliente puede enviar el `updated_at` que conocía del documento:
 * si el servidor ya tiene otro, alguien lo cambió desde entonces y se responde 409 en vez de pisarlo.
 * Sin `base_updated_at` el comportamiento es el de siempre (sección 9.3: gana la última escritura), así
 * que los clientes que no lo envían no notan ninguna diferencia.
 */
export const baseSchema = z.object({
  base_updated_at: z
    .string({ error: 'Escribe una fecha ISO.' })
    .max(40, { error: 'Fecha demasiado larga.' })
    .nullish(),
});

export const MENSAJE_CONFLICTO =
  'El elemento cambió en otro dispositivo desde la última vez que lo sincronizaste.';

/** `base_updated_at` es el campo que distingue este 409 del de «nombre de lote repetido». */
export const CAMPO_CONFLICTO = 'base_updated_at';

type Verificador = (previo: Documento | null) => void;

/** Mismo contenido (ausente = `null`): reintentar una escritura que SÍ llegó no es un conflicto. */
const mismoContenido = (previo: Documento, datos: Readonly<Record<string, unknown>>): boolean =>
  Object.entries(datos).every(([campo, valor]) => (previo[campo] ?? null) === valor);

/**
 * Verificación para `Almacen.guardar`, o `undefined` si el cliente no envió versión base.
 * `null` significa «creo que es nuevo»: si ya existe con otro contenido, también es un conflicto.
 */
export function verificadorDeBase(
  base: string | null | undefined,
  datos: Readonly<Record<string, unknown>>,
): Verificador | undefined {
  if (base === undefined) return undefined;
  return (previo) => {
    if (previo === null || previo.updated_at === base || mismoContenido(previo, datos)) return;
    throw new ErrorHttp(409, MENSAJE_CONFLICTO, [
      { campo: CAMPO_CONFLICTO, mensaje: MENSAJE_CONFLICTO },
    ]);
  };
}
