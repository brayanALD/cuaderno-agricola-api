import { del, put } from '@vercel/blob';
import type { AlmacenImagenes, ImagenSubida } from '../puertos';

/**
 * Vercel Blob con un store público: la URL es accesible para quien la conozca, y el sufijo aleatorio la
 * hace difícil de adivinar. El token nunca sale del servidor. Adaptador delgado, sin emulador: solo se
 * prueba desplegado (cada subida cuenta como operación avanzada de la cuota).
 */
export function crearAlmacenBlob(token: string): AlmacenImagenes {
  return {
    async subir(pathname, bytes, contentType): Promise<ImagenSubida> {
      const resultado = await put(pathname, bytes, {
        access: 'public',
        addRandomSuffix: true,
        contentType,
        token,
      });
      return { url: resultado.url, pathname: resultado.pathname };
    },
    borrar: (url) => del(url, { token }),
  };
}

/** Doble de desarrollo (sin token real): devuelve URLs que no existen y no sube nada. */
export function crearAlmacenBlobLocal(): AlmacenImagenes {
  return {
    subir(pathname): Promise<ImagenSubida> {
      return Promise.resolve({ url: `https://blob-local.invalid/${pathname}`, pathname });
    },
    borrar: () => Promise.resolve(),
  };
}
