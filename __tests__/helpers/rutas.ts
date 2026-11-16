import { crearManejadores } from '@/lib/manejadores';
import { crearEntorno, type Entorno } from './dobles';

export const lote = {
  nombre: 'El Mirador',
  cultivo: 'Café',
  area_m2: 5000,
  altitud_m: 1650,
  lat: 4.65,
  lng: -75.57,
  fecha_siembra: '2026-08-16',
};

export const labor = {
  lote_id: 'lote-1',
  tipo: 'cosecha',
  fecha: '2026-10-05',
  cantidad: 12.5,
  unidad: 'kg',
  nota: null,
  foto_url: null,
  luz: null,
};

export interface Opciones {
  token?: string;
  cuerpo?: unknown;
  texto?: string;
  encabezados?: Record<string, string>;
}

export function peticion(
  metodo: string,
  ruta: string,
  { token, cuerpo, texto, encabezados }: Opciones = {},
) {
  const headers: Record<string, string> = { ...encabezados };
  if (token) headers.authorization = `Bearer ${token}`;
  const body = texto ?? (cuerpo === undefined ? undefined : JSON.stringify(cuerpo));
  return new Request(`http://localhost${ruta}`, { method: metodo, headers, body });
}

export const contexto = (id: string) => ({ params: Promise.resolve({ id }) });

export async function conUsuarios(entorno: Entorno = crearEntorno()) {
  const registro = await entorno.deps.auth.registrar('ana@correo.com', 'contraseña-1');
  const otro = await entorno.deps.auth.registrar('beto@correo.com', 'contraseña-2');
  return {
    entorno,
    ana: registro.token,
    beto: otro.token,
    h: crearManejadores(() => entorno.deps),
  };
}
