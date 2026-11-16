import { manejadores } from '@/lib/api';

export const runtime = 'nodejs';
export const PUT = manejadores.guardar('ciclos');
export const DELETE = manejadores.borrar('ciclos');
