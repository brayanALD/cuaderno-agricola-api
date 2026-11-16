import { randomUUID } from 'node:crypto';
import { crearAlmacenBlob, crearAlmacenBlobLocal } from './blob/almacenBlob';
import { leerEntorno, type EntornoApi } from './entorno';
import { appAdmin, crearVerificador } from './firebase/admin';
import { crearProveedorAuth } from './firebase/authRest';
import { crearAlmacenFirestore } from './firebase/almacenFirestore';
import type { Dependencias } from './puertos';

function construir(entorno: EntornoApi): Dependencias {
  const app = appAdmin(entorno);
  return {
    auth: crearProveedorAuth({
      apiKey: entorno.claveWeb,
      hostEmulador: entorno.hostAuthEmulador ?? undefined,
      verificarToken: crearVerificador(app),
    }),
    almacen: crearAlmacenFirestore(app),
    imagenes:
      entorno.tokenBlob === null ? crearAlmacenBlobLocal() : crearAlmacenBlob(entorno.tokenBlob),
    ahora: () => new Date().toISOString(),
    nuevoId: () => randomUUID(),
  };
}

let guardadas: Dependencias | undefined;

/** Dependencias reales, creadas la primera vez que se necesitan (no al importar: así `next build` no toca Firebase). */
export function dependencias(): Dependencias {
  guardadas ??= construir(leerEntorno(process.env));
  return guardadas;
}
