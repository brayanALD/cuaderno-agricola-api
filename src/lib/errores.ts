import { ZodError } from 'zod';

export interface Detalle {
  readonly campo: string;
  readonly mensaje: string;
}

export type EstadoError = 400 | 401 | 403 | 404 | 409 | 413 | 415 | 429 | 500;

/** Error con estado HTTP y un mensaje seguro de mostrar al cliente. */
export class ErrorHttp extends Error {
  constructor(
    readonly status: EstadoError,
    mensaje: string,
    readonly detalles?: readonly Detalle[],
  ) {
    super(mensaje);
    this.name = 'ErrorHttp';
  }
}

/** Un detalle por incidencia: el campo (con ruta unida por puntos) y su mensaje. */
export function detallesDeZod(error: ZodError): Detalle[] {
  return error.issues.map((incidencia) => ({
    campo: incidencia.path.length === 0 ? 'cuerpo' : incidencia.path.map(String).join('.'),
    mensaje: incidencia.message,
  }));
}

/**
 * Formato de error único de la API: `{ "error", "detalles"? }`. Los errores internos responden
 * `500 Error interno` sin detalles y solo se registra el nombre del error (nunca su mensaje, que
 * podría traer contraseñas, tokens o datos personales).
 */
export function responderError(error: unknown): Response {
  if (error instanceof ErrorHttp) {
    const cuerpo = error.detalles
      ? { error: error.message, detalles: error.detalles }
      : { error: error.message };
    return Response.json(cuerpo, { status: error.status });
  }
  if (error instanceof ZodError) {
    return Response.json(
      { error: 'Datos inválidos', detalles: detallesDeZod(error) },
      { status: 400 },
    );
  }
  process.stderr.write(`Error interno: ${error instanceof Error ? error.name : 'desconocido'}\n`);
  return Response.json({ error: 'Error interno' }, { status: 500 });
}
