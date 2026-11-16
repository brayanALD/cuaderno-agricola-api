import { z } from 'zod';
import { esFechaValida } from './fechas';
import { idSchema } from './consulta';

export const TIPOS_LABOR = ['riego', 'abono', 'fumigacion', 'poda', 'cosecha'] as const;
export const LUCES = ['soleado', 'nublado'] as const;

/** Cuerpo de `PUT /api/labores/:id` (sección 9.4). `foto_url` es la URL que devolvió `POST /api/imagenes`. */
export const laborSchema = z.object({
  lote_id: idSchema,
  tipo: z.enum(TIPOS_LABOR, { error: 'Tipo de labor inválido.' }),
  fecha: z
    .string({ error: 'Este campo es obligatorio.' })
    .refine(esFechaValida, { error: 'Fecha inválida: usa AAAA-MM-DD.' }),
  cantidad: z
    .number({ error: 'Escribe un número.' })
    .min(0, { error: 'La cantidad no puede ser negativa.' }),
  unidad: z.string().trim().max(20, { error: 'Máximo 20 caracteres.' }).nullable(),
  nota: z.string().trim().max(500, { error: 'Máximo 500 caracteres.' }).nullable(),
  foto_url: z
    .url({ protocol: /^https$/, error: 'La foto debe ser una URL https.' })
    .max(2000)
    .nullable(),
  luz: z.enum(LUCES, { error: 'Elige soleado o nublado.' }).nullable(),
});

export type DatosLabor = z.infer<typeof laborSchema>;
