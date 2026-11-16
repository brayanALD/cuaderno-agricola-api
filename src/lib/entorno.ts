import { z } from 'zod';

const esquema = z.object({
  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_WEB_API_KEY: z.string().min(1),
  FIREBASE_CLIENT_EMAIL: z.string().min(1).optional(),
  FIREBASE_PRIVATE_KEY: z.string().min(1).optional(),
  FIREBASE_AUTH_EMULATOR_HOST: z.string().min(1).optional(),
  FIRESTORE_EMULATOR_HOST: z.string().min(1).optional(),
  BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
});

type Variables = z.infer<typeof esquema>;

export interface EntornoApi {
  readonly proyecto: string;
  /** Clave web de Firebase: solo vive en el servidor (nunca en la app). */
  readonly claveWeb: string;
  readonly hostAuthEmulador: string | null;
  readonly hostFirestoreEmulador: string | null;
  readonly credenciales: { readonly clientEmail: string; readonly privateKey: string } | null;
  /** `null` = sin Blob real (desarrollo): se usa un doble local. */
  readonly tokenBlob: string | null;
}

/** Valor de `env.example`: nunca es un token real. */
const TOKEN_BLOB_DE_EJEMPLO = 'token-blob-falso';

/** Los errores nombran las variables que faltan y nunca incluyen sus valores. */
function validar(env: Readonly<Record<string, string | undefined>>): Variables {
  const resultado = esquema.safeParse(env);
  if (resultado.success) return resultado.data;
  const faltan = [...new Set(resultado.error.issues.map((i) => String(i.path[0])))];
  throw new Error(`Faltan o son inválidas estas variables de entorno: ${faltan.join(', ')}`);
}

/** Cuenta de servicio (solo sin emulador). En Vercel la clave se pega con `\n` literales: se convierten. */
function credencialesDe(v: Variables, usaEmulador: boolean): EntornoApi['credenciales'] {
  if (usaEmulador) return null;
  if (v.FIREBASE_CLIENT_EMAIL === undefined || v.FIREBASE_PRIVATE_KEY === undefined) {
    throw new Error('Sin emulador hacen falta FIREBASE_CLIENT_EMAIL y FIREBASE_PRIVATE_KEY.');
  }
  return {
    clientEmail: v.FIREBASE_CLIENT_EMAIL,
    privateKey: v.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  };
}

const tokenBlobDe = (token: string | undefined): string | null =>
  token === undefined || token === TOKEN_BLOB_DE_EJEMPLO ? null : token;

/** Lee y valida las variables de entorno (sección 9.6). En Vercel no se admite apuntar a un emulador. */
export function leerEntorno(env: Readonly<Record<string, string | undefined>>): EntornoApi {
  const v = validar(env);
  const usaEmulador =
    v.FIREBASE_AUTH_EMULATOR_HOST !== undefined || v.FIRESTORE_EMULATOR_HOST !== undefined;
  if (usaEmulador && env.VERCEL !== undefined) {
    throw new Error('En Vercel no se permite configurar un emulador de Firebase.');
  }
  return {
    proyecto: v.FIREBASE_PROJECT_ID,
    claveWeb: v.FIREBASE_WEB_API_KEY,
    hostAuthEmulador: v.FIREBASE_AUTH_EMULATOR_HOST ?? null,
    hostFirestoreEmulador: v.FIRESTORE_EMULATOR_HOST ?? null,
    credenciales: credencialesDe(v, usaEmulador),
    tokenBlob: tokenBlobDe(v.BLOB_READ_WRITE_TOKEN),
  };
}
