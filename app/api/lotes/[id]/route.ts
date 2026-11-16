import { manejadores } from '@/lib/api';

export const runtime = 'nodejs';
export const PUT = manejadores.guardar('lotes');
export const DELETE = manejadores.borrar('lotes');
