import { z } from 'zod';

/** `?since=` de la sincronización: fecha ISO 8601 UTC; ausente = desde el principio. */
export const consultaSchema = z.object({
  since: z.iso.datetime({ error: 'since debe ser una fecha ISO 8601 UTC.' }).optional(),
});

/** El id lo genera el cliente (UUID): solo caracteres seguros, nunca una ruta. */
export const idSchema = z
  .string({ error: 'Id inválido.' })
  .regex(/^[A-Za-z0-9_-]{1,64}$/, { error: 'Id inválido.' });
