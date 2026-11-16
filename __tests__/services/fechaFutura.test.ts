import { describe, expect, it } from 'vitest';
import { ErrorHttp } from '@/lib/errores';
import { esFechaFutura, limiteDeFechaFutura } from '@/schemas/fechas';
import { aplicarCambios } from '@/services/cambiosService';
import { guardar } from '@/services/sincronizacionService';
import { crearEntorno } from '../helpers/dobles';

/** El reloj de prueba arranca el 2026-11-15 a las 10:00 UTC. */
const lote = {
  nombre: 'El Mirador',
  cultivo: 'Café',
  area_m2: 5000,
  altitud_m: 1650,
  lat: 4.65,
  lng: -75.57,
  fecha_siembra: '2026-08-16',
};

const labor = (cambios = {}) => ({
  lote_id: 'lote-1',
  tipo: 'riego',
  fecha: '2026-11-10',
  cantidad: 20,
  unidad: 'L',
  nota: null,
  foto_url: null,
  luz: null,
  ...cambios,
});

const ciclo = (cambios = {}) => ({
  lote_id: 'lote-1',
  cultivo: 'Maíz',
  fecha_inicio: '2026-01-10',
  fecha_fin: '2026-06-15',
  total_kg: 320,
  ...cambios,
});

async function campoRechazado(promesa: Promise<unknown>): Promise<string | null> {
  try {
    await promesa;
    return null;
  } catch (error) {
    return error instanceof ErrorHttp ? (error.detalles?.[0]?.campo ?? null) : 'otro error';
  }
}

describe('límite de fecha futura (D96)', () => {
  it('es el día de UTC más uno, con cambio de mes, de año y bisiesto', () => {
    expect(limiteDeFechaFutura('2026-11-15T10:00:00.000Z')).toBe('2026-11-16');
    expect(limiteDeFechaFutura('2026-11-30T23:59:59.999Z')).toBe('2026-12-01');
    expect(limiteDeFechaFutura('2026-12-31T00:00:00.000Z')).toBe('2027-01-01');
    expect(limiteDeFechaFutura('2028-02-28T12:00:00.000Z')).toBe('2028-02-29');
    expect(limiteDeFechaFutura('2027-02-28T12:00:00.000Z')).toBe('2027-03-01');
  });

  it('acepta hoy y mañana (zona horaria adelantada) y rechaza de pasado mañana en adelante', () => {
    const ahora = '2026-11-15T10:00:00.000Z';

    expect(esFechaFutura('2026-11-15', ahora)).toBe(false);
    expect(esFechaFutura('2026-11-16', ahora)).toBe(false);
    expect(esFechaFutura('2026-11-17', ahora)).toBe(true);
    expect(esFechaFutura('2020-01-01', ahora)).toBe(false);
  });
});

describe('PUT de una labor con fecha futura', () => {
  async function conLote() {
    const entorno = crearEntorno();
    await guardar(entorno.deps, 'u1', 'lotes', 'lote-1', lote);
    return entorno;
  }

  it.each([
    ['hoy', '2026-11-15'],
    ['mañana (margen por zona horaria)', '2026-11-16'],
    ['una fecha pasada', '2026-10-01'],
  ])('acepta %s', async (_nombre, fecha) => {
    const { deps } = await conLote();

    const doc = await guardar(deps, 'u1', 'labores', 'labor-1', labor({ fecha }));

    expect(doc.fecha).toBe(fecha);
  });

  it.each([
    ['pasado mañana', '2026-11-17'],
    ['el año que viene', '2027-03-01'],
  ])('rechaza %s con un 400 en el campo fecha', async (_nombre, fecha) => {
    const { deps, almacen } = await conLote();

    const campo = await campoRechazado(guardar(deps, 'u1', 'labores', 'labor-1', labor({ fecha })));

    expect(campo).toBe('fecha');
    expect(almacen.todos().filter((d) => d.id === 'labor-1')).toEqual([]);
  });

  it('también una cosecha futura, y el aviso lo da el servidor aunque el cliente no lo haya comprobado', async () => {
    const { deps } = await conLote();

    const campo = await campoRechazado(
      guardar(deps, 'u1', 'labores', 'labor-1', labor({ tipo: 'cosecha', fecha: '2026-12-25' })),
    );

    expect(campo).toBe('fecha');
  });

  it('cuando el reloj avanza, lo que era futuro deja de serlo', async () => {
    const { deps, avanzar } = await conLote();
    const futura = labor({ fecha: '2026-11-17' });
    expect(await campoRechazado(guardar(deps, 'u1', 'labores', 'labor-1', futura))).toBe('fecha');

    avanzar(24 * 60 * 60 * 1000);

    await expect(guardar(deps, 'u1', 'labores', 'labor-1', futura)).resolves.toMatchObject({
      fecha: '2026-11-17',
    });
  });

  it('en el envío por lotes se rechaza solo ese cambio', async () => {
    const { deps } = await conLote();

    const { resultados } = await aplicarCambios(deps, 'u1', {
      cambios: [
        { recurso: 'labores', id: 'a', cuerpo: labor({ fecha: '2026-11-20' }) },
        { recurso: 'labores', id: 'b', cuerpo: labor({ fecha: '2026-11-14' }) },
      ],
    });

    expect(resultados.map((r) => r.estado)).toEqual([400, 200]);
    expect(resultados[0]?.detalles?.[0]?.campo).toBe('fecha');
  });
});

describe('PUT de un ciclo con fin futuro', () => {
  it('rechaza un ciclo que termina pasado mañana y acepta hoy y mañana', async () => {
    const { deps } = crearEntorno();
    await guardar(deps, 'u1', 'lotes', 'lote-1', lote);

    expect(
      await campoRechazado(guardar(deps, 'u1', 'ciclos', 'c1', ciclo({ fecha_fin: '2026-11-17' }))),
    ).toBe('fecha_fin');
    await expect(
      guardar(deps, 'u1', 'ciclos', 'c2', ciclo({ fecha_fin: '2026-11-16' })),
    ).resolves.toMatchObject({ fecha_fin: '2026-11-16' });
    await expect(
      guardar(deps, 'u1', 'ciclos', 'c3', ciclo({ fecha_fin: '2026-11-15' })),
    ).resolves.toMatchObject({ fecha_fin: '2026-11-15' });
  });
});

describe('lo que NO se valida como futuro', () => {
  it('la siembra de un lote puede ser futura (la app la muestra como «Siembra en N días»)', async () => {
    const { deps } = crearEntorno();

    await expect(
      guardar(deps, 'u1', 'lotes', 'lote-1', { ...lote, fecha_siembra: '2027-01-01' }),
    ).resolves.toMatchObject({ fecha_siembra: '2027-01-01' });
  });
});
