import { z } from 'zod';

export const credencialesSchema = z.object({
  email: z
    .string({ error: 'Escribe un correo válido.' })
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: 'Escribe un correo válido.' })),
  password: z
    .string({ error: 'La contraseña es obligatoria.' })
    .min(8, { error: 'La contraseña debe tener al menos 8 caracteres.' })
    .max(128, { error: 'La contraseña es demasiado larga.' }),
});

/** `POST /api/auth/recuperar`: solo el correo (mismo tratamiento que en el registro y el login). */
export const recuperarSchema = z.object({
  email: z
    .string({ error: 'Escribe un correo válido.' })
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: 'Escribe un correo válido.' })),
});

export const refreshSchema = z.object({
  refreshToken: z
    .string({ error: 'Falta el refreshToken.' })
    .min(1, { error: 'Falta el refreshToken.' }),
});

export type Credenciales = z.infer<typeof credencialesSchema>;
