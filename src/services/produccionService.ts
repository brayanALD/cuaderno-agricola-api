import { ErrorHttp } from '@/lib/errores';
import type { Dependencias } from '@/lib/puertos';
import { idSchema } from '@/schemas/consulta';

export interface ProduccionMes {
  readonly mes: string;
  readonly kg: number;
}

export interface Produccion {
  readonly lote_id: string;
  readonly total_kg: number;
  readonly por_mes: readonly ProduccionMes[];
}

/** Suma redondeada a 2 decimales: 0,1 + 0,2 da 0,3 y no 0,30000000000000004. */
const sumar = (cantidades: readonly number[]): number =>
  Math.round(cantidades.reduce((total, cantidad) => total + cantidad, 0) * 100) / 100;

/** `GET /api/lotes/:id/produccion` (RF-04): kg por mes y total, calculados en el servidor. */
export async function produccionDeLote(
  deps: Pick<Dependencias, 'almacen'>,
  uid: string,
  loteId: unknown,
): Promise<Produccion> {
  const id = idSchema.parse(loteId);
  const lote = await deps.almacen.obtener(uid, 'lote', id);
  if (lote === null || lote.deleted_at !== null) throw new ErrorHttp(404, 'Lote no encontrado');

  const cosechas = await deps.almacen.buscar(uid, 'labor', {
    lote_id: id,
    tipo: 'cosecha',
    deleted_at: null,
  });
  const porMes = new Map<string, number[]>();
  for (const cosecha of cosechas) {
    const mes = String(cosecha.fecha).slice(0, 7);
    porMes.set(mes, [...(porMes.get(mes) ?? []), Number(cosecha.cantidad)]);
  }
  return {
    lote_id: id,
    total_kg: sumar(cosechas.map((c) => Number(c.cantidad))),
    por_mes: [...porMes.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, cantidades]) => ({ mes, kg: sumar(cantidades) })),
  };
}
