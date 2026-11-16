import { ErrorHttp } from '@/lib/errores';
import type { Dependencias, ImagenSubida } from '@/lib/puertos';

/** ~4 MB: Vercel limita el cuerpo de una petición a 4,5 MB (sección 9.5). */
export const TAMANO_MAXIMO_IMAGEN = 4_000_000;

const EXTENSIONES: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** `POST /api/imagenes`: guarda en `usuarios/<uid>/<id>.<ext>`. 415 si no es imagen permitida, 413 si pasa de ~4 MB. */
export function subirImagen(
  deps: Pick<Dependencias, 'imagenes' | 'nuevoId'>,
  uid: string,
  contentType: string,
  bytes: ArrayBuffer,
): Promise<ImagenSubida> {
  const tipo = (contentType.split(';')[0] ?? '').trim().toLowerCase();
  const extension = EXTENSIONES[tipo];
  if (extension === undefined) {
    return Promise.reject(new ErrorHttp(415, 'Solo se admiten imágenes JPEG, PNG o WebP'));
  }
  if (bytes.byteLength === 0) return Promise.reject(new ErrorHttp(400, 'La imagen está vacía'));
  if (bytes.byteLength > TAMANO_MAXIMO_IMAGEN) {
    return Promise.reject(new ErrorHttp(413, 'La imagen pesa más de 4 MB'));
  }
  return deps.imagenes.subir(`usuarios/${uid}/${deps.nuevoId()}.${extension}`, bytes, tipo);
}

function pathnameDe(url: unknown): string {
  if (typeof url !== 'string') throw new ErrorHttp(400, 'Falta la URL de la imagen');
  try {
    const direccion = new URL(url);
    if (direccion.protocol !== 'https:')
      throw new ErrorHttp(400, 'La URL de la imagen no es válida');
    return decodeURIComponent(direccion.pathname.replace(/^\//, ''));
  } catch (error) {
    if (error instanceof ErrorHttp) throw error;
    throw new ErrorHttp(400, 'La URL de la imagen no es válida');
  }
}

/** `DELETE /api/imagenes?url=`: solo imágenes propias; si el `pathname` no empieza con `usuarios/<uid>/`, 403. */
export async function borrarImagen(
  deps: Pick<Dependencias, 'imagenes'>,
  uid: string,
  url: unknown,
): Promise<{ ok: true }> {
  const pathname = pathnameDe(url);
  const esPropia = pathname.startsWith(`usuarios/${uid}/`) && !pathname.split('/').includes('..');
  if (!esPropia) throw new ErrorHttp(403, 'No puedes borrar esa imagen');
  await deps.imagenes.borrar(String(url));
  return { ok: true };
}
