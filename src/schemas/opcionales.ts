import { z } from 'zod';

/**
 * Campos añadidos después de la primera versión del contrato (D93): un cliente antiguo no los envía, así que
 * ausente, `null` o vacío se guardan como `null`. Así el APK viejo sigue funcionando contra la API nueva.
 */
export const textoOpcional = (max: number) =>
  z
    .string({ error: 'Escribe un texto.' })
    .trim()
    .max(max, { error: `Máximo ${max} caracteres.` })
    .nullish()
    .transform((valor) => (valor === undefined || valor === null || valor === '' ? null : valor));

export const numeroOpcional = (esquema: z.ZodNumber) =>
  esquema.nullish().transform((valor) => valor ?? null);
