import { manejadores } from '@/lib/api';

export const runtime = 'nodejs';
export const PUT = manejadores.guardar('labores');
export const DELETE = manejadores.borrar('labores');
