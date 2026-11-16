import { z } from 'zod';
import { esFechaValida } from './fechas';
import { idSchema } from './consulta';
import { numeroOpcional, textoOpcional } from './opcionales';

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
  /** Producto aplicado (fumigación o abono) y días de carencia antes de poder cosechar (D93). */
  producto: textoOpcional(60),
  carencia_dias: numeroOpcional(
    z
      .number({ error: 'Escribe un número.' })
      .int({ error: 'Los días de carencia deben ser un número entero.' })
      .min(0, { error: 'Los días de carencia no pueden ser negativos.' })
      .max(365, { error: 'Máximo 365 días de carencia.' }),
  ),
  /** Costo de la labor en la moneda del usuario (D93). */
  costo: numeroOpcional(
    z.number({ error: 'Escribe un número.' }).min(0, { error: 'El costo no puede ser negativo.' }),
  ),
});

export type DatosLabor = z.infer<typeof laborSchema>;
