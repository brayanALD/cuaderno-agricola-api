import { ErrorHttp } from './errores';

const TAMANO_MAXIMO_JSON = 100_000;

/** Lee el cuerpo como JSON; vacío o inválido es un 400 y uno enorme, un 413. */
export async function leerJson(
  request: Request,
  maxCaracteres = TAMANO_MAXIMO_JSON,
): Promise<unknown> {
  const texto = await request.text();
  if (texto.length > maxCaracteres) throw new ErrorHttp(413, 'El cuerpo es demasiado grande');
  try {
    return JSON.parse(texto);
  } catch {
    throw new ErrorHttp(400, 'El cuerpo debe ser JSON válido');
  }
}

/** Token de «Authorization: Bearer <token>»; si falta o está mal formado, 401. */
export function tokenBearer(request: Request): string {
  const encabezado = request.headers.get('authorization') ?? '';
  const [esquema, token] = encabezado.trim().split(/\s+/);
  if (esquema !== 'Bearer' || !token) throw new ErrorHttp(401, 'No autenticado');
  return token;
}
