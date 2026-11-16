/** `AAAA-MM-DD` que existe en el calendario (rechaza 2026-02-30). */
export function esFechaValida(texto: string): boolean {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (partes === null) return false;
  const [anio, mes, dia] = [Number(partes[1]), Number(partes[2]), Number(partes[3])];
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia
  );
}

const MS_POR_DIA = 86_400_000;

/**
 * Último día que se acepta como «hoy» al validar fechas que no pueden ser futuras (D96): el día de UTC más uno.
 * El cliente guarda su fecha LOCAL y en UTC+14 ya es mañana respecto a UTC: sin ese día de margen, una labor de
 * hoy hecha allá se rechazaría. `ahoraIso` es el instante del servidor (ISO 8601 UTC).
 */
export function limiteDeFechaFutura(ahoraIso: string): string {
  const hoy = Date.parse(`${ahoraIso.slice(0, 10)}T00:00:00Z`);
  return new Date(hoy + MS_POR_DIA).toISOString().slice(0, 10);
}

/** ¿`fecha` (`AAAA-MM-DD`) pasa del margen de un día sobre la fecha del servidor? */
export const esFechaFutura = (fecha: string, ahoraIso: string): boolean =>
  fecha > limiteDeFechaFutura(ahoraIso);
