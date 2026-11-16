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
  /** Suma de los costos de TODAS las labores vivas del lote (D93). */
  readonly costo_total: number;
  /** Costo por kilo cosechado; `null` si aún no hay cosecha. */
  readonly costo_por_kg: number | null;
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

  const labores = await deps.almacen.buscar(uid, 'labor', { lote_id: id, deleted_at: null });
  const cosechas = labores.filter((labor) => labor.tipo === 'cosecha');
  const totalKg = sumar(cosechas.map((c) => Number(c.cantidad)));
  const costoTotal = sumar(labores.map((labor) => Number(labor.costo ?? 0)));
  const porMes = new Map<string, number[]>();
  for (const cosecha of cosechas) {
    const mes = String(cosecha.fecha).slice(0, 7);
    porMes.set(mes, [...(porMes.get(mes) ?? []), Number(cosecha.cantidad)]);
  }
  return {
    lote_id: id,
    total_kg: totalKg,
    por_mes: [...porMes.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, cantidades]) => ({ mes, kg: sumar(cantidades) })),
    costo_total: costoTotal,
    costo_por_kg: totalKg > 0 ? Math.round((costoTotal / totalKg) * 100) / 100 : null,
  };
}
