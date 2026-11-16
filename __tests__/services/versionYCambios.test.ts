import { describe, expect, it } from 'vitest';
import { ErrorHttp } from '@/lib/errores';
import { aplicarCambios, MAXIMO_CAMBIOS } from '@/services/cambiosService';
import { guardar } from '@/services/sincronizacionService';
import { crearEntorno } from '../helpers/dobles';

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

async function esConflicto(promesa: Promise<unknown>): Promise<boolean> {
  try {
    await promesa;
    return false;
  } catch (error) {
    return (
      error instanceof ErrorHttp &&
      error.status === 409 &&
      error.detalles?.[0]?.campo === 'base_updated_at'
    );
  }
}

describe('control de versión opcional (D94)', () => {
  it('sin base_updated_at gana la última escritura, como dice la sección 9.3', async () => {
    const { deps, avanzar } = crearEntorno();
    await guardar(deps, 'u1', 'lotes', 'lote-1', lote);
    avanzar();
    await guardar(deps, 'u1', 'lotes', 'lote-1', { ...lote, area_m2: 6000 });
    avanzar();

    const doc = await guardar(deps, 'u1', 'lotes', 'lote-1', { ...lote, area_m2: 7000 });

    expect(doc.area_m2).toBe(7000);
  });

  it('con la versión que el servidor tiene, la escritura se acepta', async () => {
    const { deps, avanzar } = crearEntorno();
    const primero = await guardar(deps, 'u1', 'lotes', 'lote-1', lote);
    avanzar();

    const doc = await guardar(deps, 'u1', 'lotes', 'lote-1', {
      ...lote,
      area_m2: 6000,
      base_updated_at: primero.updated_at,
    });

    expect(doc.area_m2).toBe(6000);
  });

  it('con una versión vieja y contenido distinto responde 409 y NO pisa lo del otro dispositivo', async () => {
    const { deps, almacen, avanzar } = crearEntorno();
    const primero = await guardar(deps, 'u1', 'lotes', 'lote-1', lote);
    avanzar();
    await guardar(deps, 'u1', 'lotes', 'lote-1', { ...lote, area_m2: 6000 });
    avanzar();

    const intento = guardar(deps, 'u1', 'lotes', 'lote-1', {
      ...lote,
      area_m2: 9999,
      base_updated_at: primero.updated_at,
    });

    expect(await esConflicto(intento)).toBe(true);
    expect(almacen.todos()[0]?.area_m2).toBe(6000);
  });

  it('reintentar una escritura que SÍ llegó (mismo contenido) no es un conflicto', async () => {
    const { deps, avanzar } = crearEntorno();
    await guardar(deps, 'u1', 'lotes', 'lote-1', { ...lote, base_updated_at: null });
    avanzar();

    const reintento = guardar(deps, 'u1', 'lotes', 'lote-1', { ...lote, base_updated_at: null });

    await expect(reintento).resolves.toMatchObject({ id: 'lote-1' });
  });

  it('base null (creo que es nuevo) pero ya existe con otro contenido: conflicto', async () => {
    const { deps } = crearEntorno();
    await guardar(deps, 'u1', 'lotes', 'lote-1', lote);

    const intento = guardar(deps, 'u1', 'lotes', 'lote-1', {
      ...lote,
      area_m2: 1,
      base_updated_at: null,
    });

    expect(await esConflicto(intento)).toBe(true);
  });

  it('con base y sin documento (nunca llegó o se perdió) se crea', async () => {
    const { deps } = crearEntorno();

    const doc = await guardar(deps, 'u1', 'lotes', 'lote-1', {
      ...lote,
      base_updated_at: '2026-11-01T00:00:00.000Z',
    });

    expect(doc.id).toBe('lote-1');
  });

  it('también protege a las labores', async () => {
    const { deps, avanzar } = crearEntorno();
    await guardar(deps, 'u1', 'lotes', 'lote-1', lote);
    const primera = await guardar(deps, 'u1', 'labores', 'labor-1', labor());
    avanzar();
    await guardar(deps, 'u1', 'labores', 'labor-1', labor({ cantidad: 50 }));
    avanzar();

    const intento = guardar(
      deps,
      'u1',
      'labores',
      'labor-1',
      labor({ cantidad: 1, base_updated_at: primera.updated_at }),
    );

    expect(await esConflicto(intento)).toBe(true);
  });

  it('una base que no es texto es un 400, no un conflicto', async () => {
    const { deps } = crearEntorno();

    await expect(
      guardar(deps, 'u1', 'lotes', 'lote-1', { ...lote, base_updated_at: 123 }),
    ).rejects.toThrow();
  });

  it('el campo base_updated_at no se guarda en el documento', async () => {
    const { deps, almacen } = crearEntorno();

    await guardar(deps, 'u1', 'lotes', 'lote-1', { ...lote, base_updated_at: null });

    expect(almacen.todos()[0]).not.toHaveProperty('base_updated_at');
  });
});

describe('POST /api/sync: envío por lotes (D95)', () => {
  it('aplica los cambios en orden: un lote y su labor en el mismo viaje', async () => {
    const { deps, almacen } = crearEntorno();

    const { resultados } = await aplicarCambios(deps, 'u1', {
      cambios: [
        { recurso: 'lotes', id: 'lote-1', cuerpo: lote },
        { recurso: 'labores', id: 'labor-1', cuerpo: labor() },
      ],
    });

    expect(resultados.map((r) => r.estado)).toEqual([200, 200]);
    expect(resultados[0]?.updated_at).toBe('2026-11-15T10:00:00.000Z');
    expect(almacen.todos()).toHaveLength(2);
  });

  it('un cambio inválido no detiene a los demás y se informa con su propio código', async () => {
    const { deps } = crearEntorno();

    const { resultados } = await aplicarCambios(deps, 'u1', {
      cambios: [
        { recurso: 'lotes', id: 'lote-1', cuerpo: { ...lote, area_m2: -5 } },
        { recurso: 'lotes', id: 'lote-2', cuerpo: { ...lote, nombre: 'Otro' } },
        { recurso: 'labores', id: 'labor-1', cuerpo: labor({ lote_id: 'no-existe' }) },
      ],
    });

    expect(resultados.map((r) => r.estado)).toEqual([400, 200, 400]);
    expect(resultados[0]?.detalles?.[0]?.campo).toBe('area_m2');
    expect(resultados[2]?.detalles?.[0]?.campo).toBe('lote_id');
  });

  it('un nombre de lote repetido da 409 y un conflicto de versión da 409 con su campo', async () => {
    const { deps, avanzar } = crearEntorno();
    const primero = await guardar(deps, 'u1', 'lotes', 'lote-1', lote);
    avanzar();
    await guardar(deps, 'u1', 'lotes', 'lote-1', { ...lote, area_m2: 6000 });

    const { resultados } = await aplicarCambios(deps, 'u1', {
      cambios: [
        { recurso: 'lotes', id: 'lote-2', cuerpo: lote },
        {
          recurso: 'lotes',
          id: 'lote-1',
          cuerpo: { ...lote, area_m2: 1, base_updated_at: primero.updated_at },
        },
      ],
    });

    expect(resultados.map((r) => r.estado)).toEqual([409, 409]);
    expect(resultados[0]?.detalles).toBeUndefined();
    expect(resultados[1]?.detalles?.[0]?.campo).toBe('base_updated_at');
  });

  it('borra con borrado: true y un 404 solo afecta a ese cambio', async () => {
    const { deps, almacen } = crearEntorno();
    await guardar(deps, 'u1', 'lotes', 'lote-1', lote);

    const { resultados } = await aplicarCambios(deps, 'u1', {
      cambios: [
        { recurso: 'lotes', id: 'lote-1', borrado: true },
        { recurso: 'lotes', id: 'no-existe', borrado: true },
      ],
    });

    expect(resultados.map((r) => r.estado)).toEqual([200, 404]);
    expect(almacen.todos()[0]?.deleted_at).not.toBeNull();
  });

  it('no deja tocar los datos de otro usuario: cada uid tiene su espacio', async () => {
    const { deps, almacen } = crearEntorno();

    await aplicarCambios(deps, 'u1', {
      cambios: [{ recurso: 'lotes', id: 'lote-1', cuerpo: lote }],
    });
    const { resultados } = await aplicarCambios(deps, 'u2', {
      cambios: [{ recurso: 'lotes', id: 'lote-1', borrado: true }],
    });

    expect(resultados[0]?.estado).toBe(404);
    expect(almacen.todos()[0]?.deleted_at).toBeNull();
  });

  it.each([
    ['sin cambios', { cambios: [] }],
    ['demasiados cambios', { cambios: Array.from({ length: MAXIMO_CAMBIOS + 1 }, () => ({})) }],
    ['recurso desconocido', { cambios: [{ recurso: 'usuarios', id: 'x', cuerpo: {} }] }],
    ['id con caracteres raros', { cambios: [{ recurso: 'lotes', id: '../x', cuerpo: lote }] }],
    ['sin forma de envío', { algo: 1 }],
  ])('rechaza el envío entero: %s', async (_nombre, cuerpo) => {
    const { deps } = crearEntorno();

    await expect(aplicarCambios(deps, 'u1', cuerpo)).rejects.toThrow();
  });
});
