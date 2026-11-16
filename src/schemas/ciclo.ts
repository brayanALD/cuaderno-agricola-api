import { z } from 'zod';
import { idSchema } from './consulta';
import { esFechaValida } from './fechas';

const fecha = z
  .string({ error: 'Este campo es obligatorio.' })
  .refine(esFechaValida, { error: 'Fecha inválida: usa AAAA-MM-DD.' });

/**
 * Cuerpo de `PUT /api/ciclos/:id` (D93): un ciclo de cultivo YA CERRADO de un lote. El ciclo en curso sigue
 * siendo el `cultivo` y la `fecha_siembra` del lote.
 */
export const cicloSchema = z
  .object({
    lote_id: idSchema,
    cultivo: z
      .string({ error: 'Este campo es obligatorio.' })
      .trim()
      .min(1, { error: 'Este campo es obligatorio.' })
      .max(60, { error: 'Máximo 60 caracteres.' }),
    fecha_inicio: fecha,
    fecha_fin: fecha,
    total_kg: z
      .number({ error: 'Escribe un número.' })
      .min(0, { error: 'El total no puede ser negativo.' }),
  })
  .refine((ciclo) => ciclo.fecha_fin >= ciclo.fecha_inicio, {
    error: 'El ciclo no puede terminar antes de empezar.',
    path: ['fecha_fin'],
  });

export type DatosCiclo = z.infer<typeof cicloSchema>;
