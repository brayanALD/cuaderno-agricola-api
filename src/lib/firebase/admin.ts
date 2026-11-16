import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { EntornoApi } from '../entorno';
import { ErrorHttp } from '../errores';
import type { Identidad } from '../puertos';

/**
 * App del Admin SDK. Con emuladores basta el `projectId` (el SDK lee `FIREBASE_AUTH_EMULATOR_HOST` y
 * `FIRESTORE_EMULATOR_HOST` del entorno); en producción usa la cuenta de servicio de las variables de Vercel.
 * Adaptador delgado: solo se puede probar con el emulador o desplegado (D58).
 */
export function appAdmin(entorno: EntornoApi): App {
  const existente = getApps()[0];
  if (existente) return existente;
  if (entorno.credenciales === null) return initializeApp({ projectId: entorno.proyecto });
  return initializeApp({
    projectId: entorno.proyecto,
    credential: cert({
      projectId: entorno.proyecto,
      clientEmail: entorno.credenciales.clientEmail,
      privateKey: entorno.credenciales.privateKey,
    }),
  });
}

/** `verifyIdToken` del Admin SDK; cualquier fallo (firma, caducidad, formato) es un 401 sin detalles. */
export function crearVerificador(app: App): (token: string) => Promise<Identidad> {
  return async (token) => {
    try {
      const decodificado = await getAuth(app).verifyIdToken(token);
      const rol: unknown = decodificado.rol;
      return {
        uid: decodificado.uid,
        email: decodificado.email ?? null,
        rol: typeof rol === 'string' ? rol : null,
      };
    } catch {
      throw new ErrorHttp(401, 'No autenticado');
    }
  };
}
