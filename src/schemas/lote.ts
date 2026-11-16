import { z } from 'zod';
import { esFechaValida } from './fechas';

const OBLIGATORIO = 'Este campo es obligatorio.';
const SOLO_NUMERO = 'Escribe un número.';
const numero = () => z.number({ error: SOLO_NUMERO });
const texto = (max: number) =>
  z
    .string({ error: OBLIGATORIO })
    .trim()
    .min(1, { error: OBLIGATORIO })
    .max(max, { error: `Máximo ${max} caracteres.` });

/**
 * Cuerpo de `PUT /api/lotes/:id` (secciones 7 y 9.4). Solo se guardan los campos declarados:
 * `id`, `created_at`, `updated_at` y `deleted_at` los pone el servidor, y el `uid` sale del token.
 */
export const loteSchema = z.object({
  nombre: texto(60),
  cultivo: texto(60),
  area_m2: numero()
    .int({ error: 'El área debe ser un número entero de m².' })
    .positive({ error: 'El área debe ser mayor que 0.' }),
  altitud_m: numero()
    .min(0, { error: 'La altitud mínima es 0 m.' })
    .max(6000, { error: 'La altitud máxima es 6000 m.' })
    .nullable(),
  lat: numero()
    .min(-90, { error: 'Latitud fuera de rango.' })
    .max(90, { error: 'Latitud fuera de rango.' })
    .nullable(),
  lng: numero()
    .min(-180, { error: 'Longitud fuera de rango.' })
    .max(180, { error: 'Longitud fuera de rango.' })
    .nullable(),
  fecha_siembra: z
    .string({ error: OBLIGATORIO })
    .refine(esFechaValida, { error: 'Fecha inválida: usa AAAA-MM-DD.' }),
});

export type DatosLote = z.infer<typeof loteSchema>;
